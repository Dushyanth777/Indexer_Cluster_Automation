import os
import asyncio
import json
import uuid
import requests
import tempfile
import base64
import paramiko
import traceback
import socket
import time

from datetime import datetime, timedelta

from dotenv import load_dotenv

from fastapi import (
    FastAPI,
    WebSocket,
    WebSocketDisconnect,
    BackgroundTasks,
    Request,
    HTTPException
)

from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import (
    create_engine,
    Column,
    String,
    Text,
    DateTime
)

from sqlalchemy.orm import (
    declarative_base,
    sessionmaker
)

# =========================================================
# ENV
# =========================================================

load_dotenv()

CCM_TOKEN = os.getenv("CCM_BEARER_TOKEN")

CCM_BASE_URL = "https://api.ccm.splunkits.io"

SPLUNK_ADMIN_PASSWORD = "ch@ngeme!"

# =========================================================
# DATABASE
# =========================================================

Base = declarative_base()

engine = create_engine(
    "sqlite:///./ccm_system.db",
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# =========================================================
# MODELS
# =========================================================

class LocalDeployment(Base):

    __tablename__ = "local_deployments"

    id = Column(String, primary_key=True)

    name = Column(String)

    owner = Column(String)

    app_name = Column(String)

    props_conf = Column(Text)

    transforms_conf = Column(Text)

    logs = Column(Text)
    stage = Column(String, default="PENDING")

    topology_json = Column(Text)

    verbose_logs = Column(Text)

    status = Column(String)

    created_at = Column(DateTime, default=datetime.utcnow)


class DeploymentInstance(Base):

    __tablename__ = "deployment_instances"

    id = Column(String, primary_key=True)

    deployment_id = Column(String)

    instance_id = Column(String)

    hostname = Column(String)

    role = Column(String)

    ip_address = Column(String)

    state = Column(String)

    ssh_status = Column(String)

    config_status = Column(String)

    cluster_status = Column(String)

    created_at = Column(DateTime, default=datetime.utcnow)

class User(Base):

    __tablename__ = "users"

    username = Column(String, primary_key=True)

    password = Column(String)

    role = Column(String)


Base.metadata.create_all(bind=engine)

# =========================================================
# FASTAPI
# =========================================================

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# =========================================================
# LOGGING MANAGER
# =========================================================

class ConnectionManager:

    def __init__(self):

        self.active_connections: dict[str, list[WebSocket]] = {}

        self.log_history: dict[str, list[str]] = {}

    async def connect(
        self,
        ws: WebSocket,
        dep_id: str
    ):

        await ws.accept()

        self.active_connections.setdefault(
            dep_id,
            []
        ).append(ws)

        for log_entry in self.log_history.get(dep_id, []):

            try:
                await ws.send_text(log_entry)
            except Exception:
                pass

    def disconnect(
        self,
        ws: WebSocket,
        dep_id: str
    ):

        if dep_id in self.active_connections:

            if ws in self.active_connections[dep_id]:

                self.active_connections[dep_id].remove(ws)

    async def send_log(
        self,
        dep_id: str,
        msg: str,
        level: str = "info"
    ):

        ts = datetime.utcnow().strftime("%H:%M:%S")

        log_entry = json.dumps({
            "ts": ts,
            "level": level,
            "msg": msg
        })

        self.log_history.setdefault(
            dep_id,
            []
        ).append(log_entry)

        if dep_id not in self.active_connections:
            return

        dead_connections = []

        for ws in self.active_connections[dep_id]:

            try:

                await ws.send_text(log_entry)

            except Exception:

                dead_connections.append(ws)

        for ws in dead_connections:

            self.disconnect(ws, dep_id)


manager = ConnectionManager()

# =========================================================
# HELPERS
# =========================================================

def get_ccm_headers():

    return {
        "Authorization": f"Bearer {CCM_TOKEN}"
    }
def update_deployment_stage(
    dep_id,
    stage,
    status=None
):

    db = SessionLocal()

    try:

        dep = db.query(
            LocalDeployment
        ).filter(
            LocalDeployment.id == dep_id
        ).first()

        if dep:

            dep.stage = stage

            if status:
                dep.status = status

            db.commit()

    finally:

        db.close()
def save_instance(
    deployment_id,
    instance_id,
    hostname,
    role,
    ip,
    state="running",
    ssh_status="pending",
    config_status="pending",
    cluster_status="pending"
):

    db = SessionLocal()

    try:

        existing = db.query(
            DeploymentInstance
        ).filter(
            DeploymentInstance.instance_id == instance_id
        ).first()

        if existing:

            existing.hostname = hostname
            existing.role = role
            existing.ip_address = ip
            existing.state = state
            existing.ssh_status = ssh_status
            existing.config_status = config_status
            existing.cluster_status = cluster_status

        else:

            db.add(
                DeploymentInstance(
                    id=str(uuid.uuid4()),
                    deployment_id=deployment_id,
                    instance_id=instance_id,
                    hostname=hostname,
                    role=role,
                    ip_address=ip,
                    state=state,
                    ssh_status=ssh_status,
                    config_status=config_status,
                    cluster_status=cluster_status
                )
            )

        db.commit()

    finally:

        db.close()

# =========================================================
# CLUSTER HEALTH PARSER
# =========================================================

def parse_cluster_status(output: str):

    rf_met = (
        "Replication factor met" in output and
        "Replication factor not met" not in output
    )

    sf_met = (
        "Search factor met" in output and
        "Search factor not met" not in output
    )

    indexing_ready = (
        "Indexing Ready YES" in output
    )

    searchable = (
        "All data is searchable" in output or
        "All data is not searchable" not in output
    )

    return {
        "rf_met": rf_met,
        "sf_met": sf_met,
        "indexing_ready": indexing_ready,
        "searchable": searchable
    }

# =========================================================
# HEALTH CHECK
# =========================================================

def cluster_is_healthy(result: dict):

    return (
        result["rf_met"] and
        result["sf_met"] and
        result["indexing_ready"]
    )

# =========================================================
# SSH WAIT
# =========================================================

async def wait_for_ssh(
    ip: str,
    pem_content: str,
    dep_id: str,
    log_prefix: str,
    debug_mode: bool
):

    await manager.send_log(
        dep_id,
        f"[{log_prefix}] Waiting for SSH on {ip}:22",
        "info"
    )

    def check_ssh():

        fd, temp_path = tempfile.mkstemp(
            suffix=".pem"
        )

        try:

            with os.fdopen(fd, "w") as f:

                f.write(
                    pem_content.replace("\\n", "\n").strip() + "\n"
                )

            client = paramiko.SSHClient()

            client.set_missing_host_key_policy(
                paramiko.AutoAddPolicy()
            )

            client.connect(
                hostname=ip,
                username="splunker",
                key_filename=temp_path,
                timeout=5,
                banner_timeout=5
            )

            client.close()

            return True, "OK"

        except Exception as e:

            return False, str(e)

        finally:

            if os.path.exists(temp_path):

                os.remove(temp_path)

    for attempt in range(1, 16):

        success, err = await asyncio.to_thread(
            check_ssh
        )

        if success:

            await manager.send_log(
                dep_id,
                f"[{log_prefix}] SSH ONLINE",
                "success"
            )

            return True

        if debug_mode:

            await manager.send_log(
                dep_id,
                f"[{log_prefix}] SSH attempt {attempt}/15 -> {err}",
                "debug"
            )

        await asyncio.sleep(10)

    await manager.send_log(
        dep_id,
        f"[{log_prefix}] SSH TIMEOUT",
        "error"
    )

    return False

# =========================================================
# SSH EXECUTION
# =========================================================

async def run_cmd_live(
    ip: str,
    pem_content: str,
    cmd: str,
    dep_id: str,
    log_prefix: str,
    debug_mode: bool
):

    await manager.send_log(
        dep_id,
        f"[{log_prefix}] EXEC -> {cmd}",
        "info"
    )

    def blocking_ssh():

        fd, temp_path = tempfile.mkstemp(
            suffix=".pem"
        )

        try:

            with os.fdopen(fd, "w") as f:

                f.write(
                    pem_content.replace("\\n", "\n").strip() + "\n"
                )

            client = paramiko.SSHClient()

            client.set_missing_host_key_policy(
                paramiko.AutoAddPolicy()
            )

            client.connect(
                hostname=ip,
                username="splunker",
                key_filename=temp_path,
                timeout=10
            )

            stdin, stdout, stderr = client.exec_command(
                cmd,
                timeout=240
            )

            status = stdout.channel.recv_exit_status()

            output_lines = (
                stdout.read().decode().splitlines() +
                stderr.read().decode().splitlines()
            )

            client.close()

            return True, status, output_lines

        except Exception as e:

            return False, -1, [
                f"EXEC_CRASH: {str(e)}"
            ]

        finally:

            if os.path.exists(temp_path):

                os.remove(temp_path)

    success, status, lines = await asyncio.to_thread(
        blocking_ssh
    )

    for line in lines:

        if line.strip():

            if debug_mode:

                await manager.send_log(
                    dep_id,
                    f"[{log_prefix} STDOUT] {line.strip()}",
                    "debug"
                )

                await asyncio.sleep(0.01)

    full_output = "\n".join(lines)

    if not success or status != 0:

        await manager.send_log(
            dep_id,
            f"[{log_prefix}] FAILED EXIT={status}",
            "error"
        )

        return False, full_output

    await manager.send_log(
        dep_id,
        f"[{log_prefix}] COMMAND OK",
        "success"
    )

    return True, full_output

# =========================================================
# EXEC WRAPPER
# =========================================================

async def exec_ssh(
    ip: str,
    pem: str,
    cmd: str,
    dep_id: str,
    prefix: str,
    debug: bool
):

    success, output = await run_cmd_live(
        ip,
        pem,
        cmd,
        dep_id,
        prefix,
        debug
    )

    if not success:

        raise Exception(
            f"[{prefix}] SSH EXECUTION FAILED"
        )

    return output

# =========================================================
# ORCHESTRATOR
# =========================================================

async def orchestrate_deployment(
    dep_id: str,
    payload: dict,
    owner: str
):

    await asyncio.sleep(1)

    base_name = payload.get("name")

    app_name = payload.get(
        "custom_app_name",
        "ccm_custom_configs"
    )

    mode = payload.get("mode")

    rf = int(payload.get("rf", 3))

    sf = int(payload.get("sf", 2))

    pem_content = payload.get(
        "pem_key_content",
        ""
    )

    debug_mode = payload.get(
        "debug_mode",
        True
    )

    total_nodes = (
        rf + 1
        if mode == "cluster"
        else 1
    )

    local_status = "SUCCESS"

    real_ips = []

    try:

        await manager.send_log(
            dep_id,
            "==== ORCHESTRATOR START ====",
            "info"
        )
        update_deployment_stage(
            dep_id,
            "INITIALIZING"
        )

        if not pem_content:

            raise Exception(
                "PEM KEY MISSING"
            )

        ttl_raw = payload.get("ttl")
        update_deployment_stage(
            dep_id,
            "PROVISIONING"
        )
        ccm_payload = {

            "name": base_name,

            "disk_storage": int(
                payload.get("disk_storage")
            ),

            "operating_system": payload.get("os"),

            "instance_type": payload.get("instance_type"),

            "timezone": payload.get("timezone"),

            "ssh_key_name": payload.get("ssh_key"),

            "splunk_version": payload.get("splunk_version"),

            "operation_hours": "business_hours",

            "ttl": (
                f"{ttl_raw}T12:00:00.000Z"
                if len(ttl_raw) == 10
                else ttl_raw
            ),

            "splunk_validated_architecture": "S1",

            "num_instances": total_nodes
        }

        headers = {
            "Authorization": f"Bearer {CCM_TOKEN}",
            "Content-Type": "application/json"
        }

        await manager.send_log(
            dep_id,
            (
    f"[ORCHESTRATOR]"
    f"[PROVISION]"
    f"[CCM_API]"
    f"[STATE=INIT]"
),
            "info"
        )

        res = await asyncio.to_thread(
            requests.post,
            f"{CCM_BASE_URL}/api/v1/deployments?type=splunk",
            headers=headers,
            json=ccm_payload,
            timeout=60
        )

        if res.status_code not in [200, 202]:

            raise Exception(
                f"CCM API FAILURE -> {res.text}"
            )

        real_id = res.json().get(
            "data",
            {}
        ).get(
            "deployment_id",
            "UNKNOWN"
        )

        update_deployment_stage(
            dep_id,
            "CCM_ACCEPTED"
        )

        await manager.send_log(
            dep_id,
            f"[CCM] ACCEPTED -> {real_id}",
            "success"
        )

        # ==========================================
        # POLL
        # ==========================================

        instances_ready = False

        for i in range(1, 61):

            await asyncio.sleep(10)

            try:

                poll_res = await asyncio.to_thread(
                    requests.get,
                    f"{CCM_BASE_URL}/api/v1/deployments/{real_id}",
                    headers=headers,
                    timeout=30
                )

                if poll_res.status_code == 200:

                    inst_data = poll_res.json().get(
                        "data",
                        {}
                    ).get(
                        "instances_data",
                        []
                    )

                    await manager.send_log(
                        dep_id,
                        f"[RAW_CCM] {json.dumps(inst_data, indent=2)}",
                        "debug"
                    )

                    running_nodes = []

                    for n in inst_data:

                        node_state = n.get("state")
                        node_ip = n.get("ip_address")

                        await manager.send_log(
                            dep_id,
                            (
                                f"[INSTANCE_STATUS] "
                                f"ID={n.get('instance_id')} "
                                f"STATE={node_state} "
                                f"IP={node_ip}"
                            ),
                            "debug"
                        )

                        if node_state == "running" and node_ip:
                            running_nodes.append(n)

                    if len(running_nodes) == total_nodes:

                        real_ips = []

                        for idx, node in enumerate(running_nodes):

                            ip = node.get("ip_address")

                            inst_id = node.get("instance_id")

                            real_ips.append(ip)

                            if mode == "cluster":

                                role = (
                                    "cluster_manager"
                                    if idx == 0
                                    else f"indexer_{idx}"
                                )

                                hostname = role

                            else:

                                role = "standalone"

                                hostname = "standalone-node"

                            save_instance(
                                dep_id,
                                inst_id,
                                hostname,
                                role,
                                ip
                            )

                        instances_ready = True

                        await manager.send_log(
                            dep_id,
                            f"[CCM] READY -> {', '.join(real_ips)}",
                            "success"
                        )

                        break

                    await manager.send_log(
                        dep_id,
                        f"[POLL] {len(running_nodes)}/{total_nodes} READY",
                        "debug"
                    )

            except Exception as e:

                await manager.send_log(
                    dep_id,
                    f"[POLL] ERROR -> {str(e)}",
                    "warn"
                )

        if not instances_ready:

            raise Exception(
                "INSTANCE BOOT TIMEOUT"
            )
        update_deployment_stage(
            dep_id,
            "WAITING_FOR_SSH"
        )

        # ==========================================
        # SSH CHECK
        # ==========================================

        for idx, ip in enumerate(real_ips):

            db = SessionLocal()

            node = db.query(
                DeploymentInstance
            ).filter(
                DeploymentInstance.ip_address == ip
            ).first()

            db.close()

            ok = await wait_for_ssh(
                ip,
                pem_content,
                dep_id,
                f"NODE-{idx}",
                debug_mode
            )

            if not ok:

                if node:

                    save_instance(
                        dep_id,
                        node.instance_id,
                        node.hostname,
                        node.role,
                        node.ip_address,
                        ssh_status="failed"
                    )

                raise Exception(
                    f"SSH FAILED -> {ip}"
                )

            if node:

                save_instance(
                    dep_id,
                    node.instance_id,
                    node.hostname,
                    node.role,
                    node.ip_address,
                    ssh_status="connected"
                )

        splunk_auth = (
            f"-auth 'admin:{SPLUNK_ADMIN_PASSWORD}'"
        )
        update_deployment_stage(
            dep_id,
            "BOOTSTRAPPING_CLUSTER"
        )
# ==========================================
        # CLUSTER
        # ==========================================

        if mode == "cluster":

            cm_ip = real_ips[0]

            peer_ips = real_ips[1:]

            await manager.send_log(
                dep_id,
                "[STEP 2] CLUSTER MODE",
                "info"
            )

            await exec_ssh(
                cm_ip,
                pem_content,
                "sudo hostnamectl set-hostname cluster-manager",
                dep_id,
                "CM",
                debug_mode
            )

            for i, p_ip in enumerate(peer_ips, 1):

                await exec_ssh(
                    p_ip,
                    pem_content,
                    f"sudo hostnamectl set-hostname indexer-{i}",
                    dep_id,
                    f"IDX-{i}",
                    debug_mode
                )

            cluster_secret = payload.get(
                "pass4SymmKey",
                "ccm-default-secret"
            )

            await exec_ssh(
                cm_ip,
                pem_content,
                (
                    f"sudo su - splunk -c "
                    f"'/opt/splunk/bin/splunk "
                    f"edit cluster-config "
                    f"-mode master "
                    f"-replication_factor {rf} "
                    f"-search_factor {sf} "
                    f"-secret \"{cluster_secret}\" "
                    f"{splunk_auth}'"
                ),
                dep_id,
                "CM",
                debug_mode
            )

            await exec_ssh(
                cm_ip,
                pem_content,
                "sudo systemctl restart Splunkd",
                dep_id,
                "CM",
                debug_mode
            )

            await manager.send_log(
                dep_id,
                "[WAIT] CM STARTUP 45s",
                "warn"
            )

            await asyncio.sleep(45)

            for i, p_ip in enumerate(peer_ips, 1):

                await exec_ssh(
                    p_ip,
                    pem_content,
                    (
                        f"sudo su - splunk -c "
                        f"'/opt/splunk/bin/splunk "
                        f"edit cluster-config "
                        f"-mode slave "
                        f"-master_uri https://{cm_ip}:8089 "
                        f"-replication_port 9887 "
                        f"-secret \"{cluster_secret}\" "
                        f"{splunk_auth}'"
                    ),
                    dep_id,
                    f"IDX-{i}",
                    debug_mode
                )

                await exec_ssh(
                    p_ip,
                    pem_content,
                    "sudo systemctl restart Splunkd",
                    dep_id,
                    f"IDX-{i}",
                    debug_mode
                )

            await manager.send_log(
                dep_id,
                "[STEP 3] CLUSTER VALIDATION LOOP",
                "info"
            )

            await asyncio.sleep(30)

            cluster_healthy = False

            for attempt in range(1, 13):

                await manager.send_log(
                    dep_id,
                    f"[VALIDATION] ATTEMPT {attempt}/12",
                    "info"
                )
                start_time = time.time()

                success, output = await run_cmd_live(
                    cm_ip,
                    pem_content,
                    (
                        f"sudo su - splunk -c "
                        f"'/opt/splunk/bin/splunk "
                        f"show cluster-status "
                        f"{splunk_auth}'"
                    ),
                    dep_id,
                    "CM_VALID",
                    True
                )

                health = parse_cluster_status(
                    output
                )
                duration = round(
                    time.time() - start_time,
                    2
                )
                await manager.send_log(
                    dep_id,
                    f"[CM_VALID] COMMAND_DURATION={duration}s",
                    "debug"
                )

                if cluster_is_healthy(health):

                    cluster_healthy = True

                    await manager.send_log(
                        dep_id,
                        "[CLUSTER] FULLY HEALTHY",
                        "success"
                    )

                    break

                await manager.send_log(
                    dep_id,
                    (
                        f"[SYNC_PENDING] "
                        f"RF={health['rf_met']} "
                        f"SF={health['sf_met']} "
                        f"IDX={health['indexing_ready']}"
                    ),
                    "warn"
                )

                await asyncio.sleep(20)

            if not cluster_healthy:

                local_status = "PARTIAL_SUCCESS"

                await manager.send_log(
                    dep_id,
                    "[CLUSTER] PARTIAL_SUCCESS",
                    "warn"
                )

        else:

            target_ip = real_ips[0]

            await exec_ssh(
                target_ip,
                pem_content,
                "sudo hostnamectl set-hostname standalone-node",
                dep_id,
                "NODE",
                debug_mode
            )

        # ==========================================
        # CONFIGMAPS
        # ==========================================

        props = payload.get(
            "propsConf",
            ""
        ).strip()

        transforms = payload.get(
            "transformsConf",
            ""
        ).strip()

        if props or transforms:

            target_ip = real_ips[0]

            app_dir = (
                f"/opt/splunk/etc/apps/{app_name}/local"
            )

            await manager.send_log(
                dep_id,
                f"[CONFIG] DEPLOYING -> {app_dir}",
                "info"
            )

            await exec_ssh(
                target_ip,
                pem_content,
                (
                    f"sudo su - splunk -c "
                    f"'mkdir -p {app_dir}'"
                ),
                dep_id,
                "CONFIG",
                debug_mode
            )

            if props:

                b64_props = base64.b64encode(
                    props.encode()
                ).decode()

                await exec_ssh(
                    target_ip,
                    pem_content,
                    (
                        f"echo '{b64_props}' "
                        f"| base64 -d "
                        f"| sudo -u splunk tee {app_dir}/props.conf"
                    ),
                    dep_id,
                    "CONFIG",
                    debug_mode
                )

            if transforms:

                b64_trans = base64.b64encode(
                    transforms.encode()
                ).decode()

                await exec_ssh(
                    target_ip,
                    pem_content,
                    (
                        f"echo '{b64_trans}' "
                        f"| base64 -d "
                        f"| sudo -u splunk tee {app_dir}/transforms.conf"
                    ),
                    dep_id,
                    "CONFIG",
                    debug_mode
                )

        else:

            await manager.send_log(
                dep_id,
                "[CONFIG] SKIPPED",
                "info"
            )

        update_deployment_stage(
            dep_id,
            "COMPLETED",
            local_status
        )

        await manager.send_log(
            dep_id,
            f"==== WORKFLOW COMPLETE ({local_status}) ====",
            "success"
        )

    except Exception as e:

        local_status = "FAILED"

        update_deployment_stage(
            dep_id,
            "FAILED",
            "FAILED"
        )

        traceback.print_exc()

        await manager.send_log(
            dep_id,
            f"[FATAL] {str(e)}",
            "error"
        )

    finally:

        _save_deployment_to_db(
            dep_id,
            base_name,
            owner,
            app_name,
            payload,
            local_status
        )

# =========================================================
# SAVE DB
# =========================================================

def _save_deployment_to_db(
    dep_id,
    name,
    owner,
    app_name,
    payload,
    status
):

    db = SessionLocal()

    try:

        log_data = json.dumps(
            manager.log_history.get(dep_id, [])
        )

        existing = db.query(
            LocalDeployment
        ).filter(
            LocalDeployment.id == dep_id
        ).first()

        if existing:

            existing.logs = log_data

            existing.status = status

        else:

            db.add(
                LocalDeployment(
                    id=dep_id,
                    name=name,
                    owner=owner,
                    app_name=app_name,
                    props_conf=payload.get("propsConf", ""),
                    transforms_conf=payload.get("transformsConf", ""),
                    logs=log_data,
                    status=status
                )
            )

        db.commit()

    except Exception:

        db.rollback()

    finally:

        db.close()

# =========================================================
# AUTH
# =========================================================

@app.post("/api/auth/register")
async def register(request: Request):

    payload = await request.json()

    uname = payload.get(
        "username",
        ""
    ).lower()

    pwd = payload.get(
        "password",
        ""
    )

    if not uname or not pwd:

        raise HTTPException(
            status_code=400,
            detail="Missing fields"
        )

    db = SessionLocal()

    if db.query(User).filter(
        User.username == uname
    ).first():

        db.close()

        raise HTTPException(
            status_code=400,
            detail="User exists"
        )

    db.add(
        User(
            username=uname,
            password=pwd,
            role="admin" if uname == "admin" else "user"
        )
    )

    db.commit()

    db.close()

    return {
        "status": "created"
    }

@app.post("/api/auth/login")
async def login(request: Request):

    payload = await request.json()

    uname = payload.get(
        "username",
        ""
    ).lower()

    pwd = payload.get(
        "password",
        ""
    )

    db = SessionLocal()

    user = db.query(User).filter(
        User.username == uname,
        User.password == pwd
    ).first()

    db.close()

    if not user:

        raise HTTPException(
            status_code=401,
            detail="Invalid credentials"
        )

    return {
        "username": user.username,
        "role": user.role,
        "token": "session_ok"
    }

# =========================================================
# META
# =========================================================

@app.get("/api/meta")
async def fetch_meta():

    try:

        r1 = requests.get(
            f"{CCM_BASE_URL}/ssh_keys/",
            headers=get_ccm_headers(),
            timeout=30
        )

        keys = []

        if r1.status_code == 200:

            keys = [
                k["ssh_key_name"].split("#")[-1]
                for k in r1.json()
            ]

        r2 = requests.get(
            f"{CCM_BASE_URL}/api/v1/meta",
            headers=get_ccm_headers(),
            timeout=30
        )

        meta = (
            r2.json()
            if r2.status_code == 200
            else {}
        )

        return {

            "keys": keys,

            "os": meta.get(
                "operating_systems",
                ["ubuntu_22.04"]
            ),

            "instance_types": meta.get(
                "instance_types",
                ["t3a.medium"]
            ),

            "disk": meta.get(
                "disk_storage",
                [50]
            )
        }

    except Exception as e:

        return {
            "error": str(e)
        }

# =========================================================
# DEPLOYMENTS
# =========================================================

@app.get("/api/deployments")
async def get_deployments(request: Request):

    username = request.headers.get(
        "X-User-Name",
        ""
    )

    role = request.headers.get(
        "X-User-Role",
        "user"
    )

    db = SessionLocal()

    local_deps = db.query(
        LocalDeployment
    ).all()

    local_dep_map = {
        d.name: d
        for d in local_deps
    }

    db.close()

    try:

        res = requests.get(
            f"{CCM_BASE_URL}/api/v1/deployments",
            headers=get_ccm_headers(),
            timeout=30
        )

        ccm_data = res.json().get(
            "data",
            {}
        ).get(
            "user_deployments",
            []
        )

        merged_data = []

        ccm_names = set()

        for d in ccm_data:

            if role != "admin":

                if d.get("owner") != username:
                    continue

            ccm_names.add(d.get("name"))

            if d.get("name") in local_dep_map:

                d["local_id"] = local_dep_map[
                    d.get("name")
                ].id

                d["local_status"] = local_dep_map[
                    d.get("name")
                ].status

            merged_data.append(d)

        for ld in local_deps:

            if (
                ld.name not in ccm_names and
                (
                    role == "admin" or
                    ld.owner == username
                )
            ):

                merged_data.append({

                    "name": ld.name,

                    "deployment_id": ld.id,

                    "owner": ld.owner,

                    "resource_type": ["Local Job"],

                    "num_instances": 0,

                    "req_state": "Terminated",

                    "local_id": ld.id,

                    "local_status": ld.status
                })

        return {
            "data": merged_data
        }

    except Exception as e:

        return {
            "error": str(e)
        }

# =========================================================
# DELETE
# =========================================================

@app.delete("/api/deployments/{dep_id}")
async def delete_deployment(dep_id: str):

    try:

        requests.delete(
            f"{CCM_BASE_URL}/api/v1/deployments/{dep_id}",
            headers=get_ccm_headers(),
            timeout=30
        )

    except Exception:
        pass

    db = SessionLocal()

    try:

        db.query(
            DeploymentInstance
        ).filter(
            DeploymentInstance.deployment_id == dep_id
        ).delete()

        db.query(
            LocalDeployment
        ).filter(
            LocalDeployment.id == dep_id
        ).delete()

        db.commit()

    finally:

        db.close()

    manager.log_history.pop(dep_id, None)

    return {
        "status": 200
    }
# =========================================================
# PATCH
# =========================================================

@app.patch("/api/deployments/{dep_id}/instances/{inst_id}")
async def patch_instance(
    dep_id: str,
    inst_id: str,
    request: Request
):

    payload = await request.json()

    requests.patch(
        f"{CCM_BASE_URL}/api/v1/deployments/{dep_id}/instances/{inst_id}",
        headers=get_ccm_headers(),
        json=payload,
        timeout=30
    )

    return {
        "status": 200
    }

# =========================================================
# CREATE DEPLOYMENT
# =========================================================

@app.post("/api/deployments")
async def create_deployment(
    request: Request,
    bg_tasks: BackgroundTasks
):

    payload = await request.json()

    required_fields = [
        "name",
        "os",
        "instance_type",
        "timezone",
        "ssh_key",
        "splunk_version",
        "ttl"
    ]

    missing = []

    for field in required_fields:

        value = payload.get(field)

        if value is None or value == "":

            missing.append(field)

    if missing:

        raise HTTPException(
            status_code=400,
            detail=f"Missing required fields: {', '.join(missing)}"
        )

    owner = request.headers.get(
        "X-User-Name",
        "unknown"
    )

    job_id = f"job-{uuid.uuid4().hex[:8]}"

    db = SessionLocal()

    try:

        db.add(
            LocalDeployment(
                id=job_id,
                name=payload.get("name"),
                owner=owner,
                app_name=payload.get(
                    "custom_app_name",
                    "ccm_custom_configs"
                ),
                props_conf=payload.get(
                    "propsConf",
                    ""
                ),
                transforms_conf=payload.get(
                    "transformsConf",
                    ""
                ),
                logs="[]",
                verbose_logs="[]",
                topology_json="[]",
                status="INITIALIZING",
                stage="QUEUED"
            )
        )

        db.commit()

    finally:

        db.close()

    bg_tasks.add_task(
        orchestrate_deployment,
        job_id,
        payload,
        owner
    )

    return {
        "status": "accepted",
        "deployment_id": job_id
    }
# =========================================================
# LOCAL DEPLOYMENTS
# =========================================================

@app.get("/api/local_deployments")
async def get_local_deployments():

    db = SessionLocal()

    try:

        deps = db.query(
            LocalDeployment
        ).order_by(
            LocalDeployment.created_at.desc()
        ).all()

        return [

            {
                "id": d.id,
                "name": d.name,
                "owner": d.owner,
                "app_name": d.app_name,
                "props": d.props_conf,
                "transforms": d.transforms_conf,
                "status": d.status
            }

            for d in deps
        ]

    except Exception:

        return []

    finally:

        db.close()

# =========================================================
# LOGS
# =========================================================

@app.get("/api/deployments/{dep_id}/logs")
async def get_logs(dep_id: str):

    if dep_id in manager.log_history:

        return [

            json.loads(x)

            for x in manager.log_history[dep_id]
        ]

    db = SessionLocal()

    try:

        dep = db.query(
            LocalDeployment
        ).filter(
            LocalDeployment.id == dep_id
        ).first()

        if dep and dep.logs:

            return [

                json.loads(x)

                for x in json.loads(dep.logs)
            ]

        return []

    except Exception as e:

        return {
            "error": str(e)
        }

    finally:

        db.close()


@app.get("/api/deployments/{dep_id}/instances")
async def get_instances(dep_id: str):

    db = SessionLocal()

    try:

        nodes = db.query(
            DeploymentInstance
        ).filter(
            DeploymentInstance.deployment_id == dep_id
        ).all()

        return [

            {
                "instance_id": n.instance_id,
                "hostname": n.hostname,
                "role": n.role,
                "ip_address": n.ip_address,
                "state": n.state,
                "ssh_status": n.ssh_status,
                "config_status": n.config_status,
                "cluster_status": n.cluster_status
            }

            for n in nodes
        ]

    finally:

        db.close()
# =========================================================
# WEBSOCKET
# =========================================================

@app.websocket("/ws/logs/{dep_id}")
async def websocket_logs(
    websocket: WebSocket,
    dep_id: str
):

    await manager.connect(
        websocket,
        dep_id
    )

    try:

        while True:

            try:

                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=60
                )

                if data == "ping":

                    await websocket.send_text(
                        json.dumps({

                            "ts": datetime.utcnow().strftime("%H:%M:%S"),

                            "level": "debug",

                            "msg": "pong"
                        })
                    )

            except asyncio.TimeoutError:

                await websocket.send_text(
                    json.dumps({

                        "ts": datetime.utcnow().strftime("%H:%M:%S"),

                        "level": "debug",

                        "msg": "heartbeat"
                    })
                )

    except WebSocketDisconnect:

        manager.disconnect(
            websocket,
            dep_id
        )

    except Exception as e:

        print("WS ERROR:", str(e))

        manager.disconnect(
            websocket,
            dep_id
        )

    finally:

        manager.disconnect(
            websocket,
            dep_id
        )

