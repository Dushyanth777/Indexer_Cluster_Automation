import os, asyncio, json, uuid, httpx, tempfile, paramiko, time, re, shlex, traceback, jwt, io
from datetime import datetime, timedelta
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, BackgroundTasks, Request, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import create_engine, Column, String, Text, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from passlib.context import CryptContext

load_dotenv()
CCM_TOKEN = os.getenv("CCM_BEARER_TOKEN")
CCM_BASE_URL = "https://api.ccm.splunkits.io"
SPLUNK_ADMIN_PASSWORD = os.getenv("SPLUNK_ADMIN_PASSWORD")
JWT_SECRET = os.getenv("JWT_SECRET")
ADMIN_USERS = os.getenv("ADMIN_USERS", "admin").split(",")

if not SPLUNK_ADMIN_PASSWORD: raise RuntimeError("CRITICAL: Missing SPLUNK_ADMIN_PASSWORD in .env")
if not JWT_SECRET: raise RuntimeError("CRITICAL: Missing JWT_SECRET in .env")

ALGORITHM = "HS256"
RUNNING_TASKS = {}

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

Base = declarative_base()
engine = create_engine("sqlite:///./ccm_system.db", connect_args={"check_same_thread": False}, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# FIX 1: Explicit Model Definition (No tuple assignment)
class LocalDeployment(Base):
    __tablename__ = "local_deployments"
    id = Column(String, primary_key=True)
    name = Column(String)
    owner = Column(String, index=True)
    app_name = Column(String)
    props_conf = Column(Text)
    transforms_conf = Column(Text)
    logs = Column(Text)
    stage = Column(String, default="PENDING")
    topology_json = Column(Text)
    verbose_logs = Column(Text)
    status = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class User(Base):
    __tablename__ = "users"
    username = Column(String, primary_key=True)
    password = Column(String)
    role = Column(String)


Base.metadata.create_all(bind=engine)
app = FastAPI()
app.add_middleware(CORSMiddleware,
                   allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "https://ccm.yourdomain.com"],
                   allow_methods=["*"], allow_headers=["*"])


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}
        self.log_history: dict[str, list[str]] = {}

    async def connect(self, ws: WebSocket, dep_id: str):
        self.active_connections.setdefault(dep_id, []).append(ws)
        for log_entry in self.log_history.get(dep_id, []):
            try:
                await ws.send_text(log_entry)
            except Exception:
                pass

    def disconnect(self, ws: WebSocket, dep_id: str):
        if dep_id in self.active_connections and ws in self.active_connections[dep_id]:
            self.active_connections[dep_id].remove(ws)

    async def send_log(self, dep_id: str, msg: str, level: str = "info", stage: str = "general", tag: str = "SYS"):
        ts = datetime.utcnow().strftime("%H:%M:%S")
        log_entry = json.dumps({"ts": ts, "level": level, "msg": msg, "stage": stage, "tag": tag})
        logs = self.log_history.setdefault(dep_id, [])
        logs.append(log_entry)
        if len(logs) > 1000: self.log_history[dep_id] = logs[-1000:]

        if dep_id not in self.active_connections: return
        dead_conns = []
        for ws in self.active_connections[dep_id]:
            try:
                await ws.send_text(log_entry)
            except Exception:
                dead_conns.append(ws)
        for ws in dead_conns: self.disconnect(ws, dep_id)


manager = ConnectionManager()


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[ALGORITHM])
        return {"username": payload.get("sub"), "role": payload.get("role")}
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


def verify_ownership(dep_id: str, user: dict):
    db = SessionLocal()
    try:
        dep = db.query(LocalDeployment).filter(LocalDeployment.id == dep_id).first()
        if not dep: raise HTTPException(status_code=404, detail="Deployment not found")
        if user["role"] != "admin" and dep.owner != user["username"]: raise HTTPException(status_code=403,
                                                                                          detail="FORBIDDEN")
        return dep
    finally:
        db.close()


def get_ccm_headers(): return {"Authorization": f"Bearer {CCM_TOKEN}"}


def update_topology(dep_id, hostname, role, ip, inst_id, state="running", ssh_status="pending"):
    db = SessionLocal()
    try:
        dep = db.query(LocalDeployment).filter(LocalDeployment.id == dep_id).first()
        if dep:
            current = json.loads(dep.topology_json or "[]")
            current = [n for n in current if n.get("instance_id") != inst_id]
            current.append(
                {"hostname": hostname, "role": role, "ip_address": ip, "instance_id": inst_id, "state": state,
                 "ssh_status": ssh_status})
            dep.topology_json = json.dumps(current)
            db.commit()
    finally:
        db.close()


def update_deployment_stage(dep_id, stage, status=None):
    db = SessionLocal()
    try:
        dep = db.query(LocalDeployment).filter(LocalDeployment.id == dep_id).first()
        if dep:
            dep.stage = stage
            if status: dep.status = status
            db.commit()
    finally:
        db.close()


def parse_cluster_status(output: str):
    rf_met = "Replication factor met" in output and "Replication factor not met" not in output
    sf_met = "Search factor met" in output and "Search factor not met" not in output
    return {"rf_met": rf_met, "sf_met": sf_met, "indexing_ready": "Indexing Ready YES" in output}


def cluster_is_healthy(r: dict): return r["rf_met"] and r["sf_met"] and r["indexing_ready"]


# --- SECURE SFTP UPLOAD ENGINE ---
async def sftp_upload_file(ip: str, pem_content: str, remote_dest: str, file_content: str, dep_id: str,
                           debug_mode: bool):
    await manager.send_log(dep_id, f"Securely transferring file via SFTP to {remote_dest}...", "info", "sftp", "SYS")

    def blocking_sftp():
        fd, temp_path = tempfile.mkstemp(suffix=".pem")
        try:
            with os.fdopen(fd, "w") as f:
                f.write(pem_content.replace("\\n", "\n").strip() + "\n")
            c = paramiko.SSHClient()
            c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            c.connect(hostname=ip, username="splunker", key_filename=temp_path, timeout=10)

            sftp = c.open_sftp()
            tmp_target = f"/tmp/{uuid.uuid4().hex}.conf"
            file_obj = io.BytesIO(file_content.encode('utf-8'))
            sftp.putfo(file_obj, tmp_target)
            sftp.close()

            # Securely move and chown
            stdin, stdout, stderr = c.exec_command(
                f"sudo mv {tmp_target} {remote_dest} && sudo chown splunk:splunk {remote_dest}")
            status = stdout.channel.recv_exit_status()
            c.close()
            return status == 0
        except Exception as e:
            return False
        finally:
            if os.path.exists(temp_path): os.remove(temp_path)

    success = await asyncio.to_thread(blocking_sftp)
    if not success: raise Exception(f"SFTP Upload failed for {remote_dest}")


# --- SSH ENGINE ---
async def wait_for_ssh(ip: str, pem_content: str, dep_id: str, log_prefix: str, debug_mode: bool):
    await manager.send_log(dep_id, f"Waiting for SSH on {ip}:22", "info", "ssh_probe", "SSH")

    def check_ssh():
        fd, temp_path = tempfile.mkstemp(suffix=".pem")
        try:
            with os.fdopen(fd, "w") as f:
                f.write(pem_content.replace("\\n", "\n").strip() + "\n")
            c = paramiko.SSHClient()
            c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            c.connect(hostname=ip, port=22, username="splunker", key_filename=temp_path, timeout=5, banner_timeout=5)
            c.close()
            return True, "OK"
        except Exception as e:
            return False, str(e)
        finally:
            if os.path.exists(temp_path): os.remove(temp_path)

    for attempt in range(1, 16):
        success, err = await asyncio.to_thread(check_ssh)
        if success:
            await manager.send_log(dep_id, f"SSH ONLINE", "success", "ssh_probe", "SSH")
            return True
        if debug_mode: await manager.send_log(dep_id, f"SSH attempt {attempt}/15 -> {err}", "debug", "ssh_probe", "SSH")
        await asyncio.sleep(10)
    await manager.send_log(dep_id, f"Max retries reached. SSH is offline.", "error", "ssh_probe", "SSH")
    return False


async def run_cmd_live(ip: str, pem_content: str, cmd: str, dep_id: str, log_prefix: str, debug_mode: bool,
                       tag: str = "EXEC"):
    def blocking_ssh():
        fd, temp_path = tempfile.mkstemp(suffix=".pem")
        try:
            with os.fdopen(fd, "w") as f:
                f.write(pem_content.replace("\\n", "\n").strip() + "\n")
            c = paramiko.SSHClient()
            c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            c.connect(hostname=ip, username="splunker", key_filename=temp_path, timeout=10)
            stdin, stdout, stderr = c.exec_command(cmd, timeout=240)
            status = stdout.channel.recv_exit_status()
            out_lines = stdout.read().decode().splitlines() + stderr.read().decode().splitlines()
            c.close()
            return True, status, out_lines
        except Exception as e:
            return False, -1, [f"EXEC_CRASH: {str(e)}"]
        finally:
            if os.path.exists(temp_path): os.remove(temp_path)

    success, status, lines = await asyncio.to_thread(blocking_ssh)
    safe_cmd = re.sub(r"-auth\s+'?admin:[^'\s]+", "-auth admin:********", cmd)
    if not any(x in cmd for x in ["services/server/info", "show cluster-status"]):
        safe_cmd = re.sub(r"admin:[^\s']+", "admin:********", cmd)
        await manager.send_log(dep_id, f"[{log_prefix.lower()} | {ip}] EXECUTE -> {safe_cmd}", "info", "ssh_exec", tag)

    is_large = len(lines) > 200
    for idx, line in enumerate(lines):
        if line.strip() and debug_mode:
            safe_line = re.sub(r"admin:[^\s']+", "admin:********", line.strip())
            await manager.send_log(dep_id, safe_line, "debug", "ssh_exec", "STDOUT")
            if not is_large: await asyncio.sleep(0.01)

    full_output = "\n".join(lines)
    if not success or status != 0:
        if status == 3 and tag == "HEALTH":
            await manager.send_log(dep_id, "splunkd has not started yet", "warn", "health", "HEALTH")
            return False, full_output
        await manager.send_log(dep_id, f"FAILED EXIT={status}", "error", "ssh_exec", tag)
        return False, full_output
    await manager.send_log(dep_id, f"COMMAND OK", "success", "ssh_exec", tag)
    return True, full_output


async def exec_ssh(ip: str, pem: str, cmd: str, dep_id: str, prefix: str, debug: bool, tag: str = "EXEC"):
    success, output = await run_cmd_live(ip, pem, cmd, dep_id, prefix, debug, tag)
    if not success: raise Exception(f"[{prefix}] SSH EXECUTION FAILED")
    return output


async def wait_for_splunk(ip: str, pem: str, dep_id: str):
    for _ in range(30):
        success, output = await run_cmd_live(ip, pem, "sudo /opt/splunk/bin/splunk status", dep_id, "HEALTH", False,
                                             "HEALTH")
        if not success:
            await asyncio.sleep(10)
            continue
        if success and "splunkd is running" in output.lower(): return True
        await manager.send_log(dep_id, "Splunk still starting...", "warn", "health", "HEALTH")
        await asyncio.sleep(10)
    raise Exception("Splunk failed to boot completely.")


# --- CONFIG PUSH TASK ---
async def execute_config_push(dep_id: str, raw_app_name: str, props: str, transforms: str, topology: list,
                              pem_key: str):
    app_name = re.sub(r'[^a-zA-Z0-9_-]', '', raw_app_name)
    safe_app = shlex.quote(app_name)
    try:
        await manager.send_log(dep_id, "==== CONFIG UPDATE STARTED ====", "info", "config_update", "SYS")
        cm_node = next((n for n in topology if n.get("role") == "cluster_manager"), None)
        target = cm_node if cm_node else topology[0]
        target_ip = target["ip_address"]
        splunk_auth = f"-auth 'admin:{SPLUNK_ADMIN_PASSWORD}'"

        app_dir = f"/opt/splunk/etc/manager-apps/{app_name}/local" if cm_node else f"/opt/splunk/etc/apps/{app_name}/local"
        await exec_ssh(target_ip, pem_key, f"sudo su - splunk -c 'mkdir -p {app_dir}'", dep_id, "CONFIG", True, "OS")

        # FIX: Secure SFTP File Generation
        if props: await sftp_upload_file(target_ip, pem_key, f"{app_dir}/props.conf", props, dep_id, True)
        if transforms: await sftp_upload_file(target_ip, pem_key, f"{app_dir}/transforms.conf", transforms, dep_id,
                                              True)

        await exec_ssh(target_ip, pem_key, f"sudo chown -R splunk:splunk {app_dir.replace('/local', '')}", dep_id,
                       "CONFIG", True, "OS")

        if cm_node:
            await manager.send_log(dep_id, "Applying cluster bundle", "warn", "config_update", "BUNDLE")
            await exec_ssh(target_ip, pem_key,
                           f"sudo su - splunk -c '/opt/splunk/bin/splunk apply cluster-bundle --answer-yes --skip-validation {splunk_auth}'",
                           dep_id, "BUNDLE", True, "BUNDLE")
            await manager.send_log(dep_id, "Waiting 30s for bundle replication...", "info", "config_update", "WAIT")
            await asyncio.sleep(30)

            await manager.send_log(dep_id, "VALIDATING PEERS", "info", "btool", "BTOOL")
            for n in topology:
                if n.get("role") != "indexer" and "indexer" not in n.get("role"): continue
                peer_ip = n["ip_address"]
                if props: await exec_ssh(peer_ip, pem_key,
                                         f"sudo su - splunk -c '/opt/splunk/bin/splunk btool props list --debug | grep {safe_app} || true'",
                                         dep_id, n["hostname"], True, "BTOOL")
                if transforms: await exec_ssh(peer_ip, pem_key,
                                              f"sudo su - splunk -c '/opt/splunk/bin/splunk btool transforms list --debug | grep {safe_app} || true'",
                                              dep_id, n["hostname"], True, "BTOOL")
        else:
            await manager.send_log(dep_id, "Restarting standalone Splunk", "warn", "config_update", "RESTART")
            await exec_ssh(target_ip, pem_key, "sudo su - splunk -c '/opt/splunk/bin/splunk restart'", dep_id, "NODE",
                           True, "SPLUNK")
            await wait_for_splunk(target_ip, pem_key, dep_id)

            if props: await exec_ssh(target_ip, pem_key,
                                     f"sudo su - splunk -c '/opt/splunk/bin/splunk btool props list --debug | grep {safe_app} || true'",
                                     dep_id, "NODE", True, "BTOOL")
            if transforms: await exec_ssh(target_ip, pem_key,
                                          f"sudo su - splunk -c '/opt/splunk/bin/splunk btool transforms list --debug | grep {safe_app} || true'",
                                          dep_id, "NODE", True, "BTOOL")

        await manager.send_log(dep_id, "==== CONFIG UPDATE COMPLETE ====", "success", "config_update", "SYS")
    except Exception as e:
        traceback.print_exc()
        await manager.send_log(dep_id, f"CONFIG UPDATE FAILED -> {str(e)}", "error", "config_update", "SYS")
    finally:
        db = SessionLocal()
        try:
            dep = db.query(LocalDeployment).filter(LocalDeployment.id == dep_id).first()
            if dep: dep.logs = json.dumps(manager.log_history.get(dep_id, [])); db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()


# --- ASYNC ORCHESTRATOR ENGINE ---
async def orchestrate_deployment(dep_id: str, payload: dict, owner: str):
    await asyncio.sleep(1)
    base_name = payload.get("name")
    raw_app_name = payload.get("custom_app_name", "ccm_custom_configs")
    app_name = re.sub(r'[^a-zA-Z0-9_-]', '', raw_app_name)
    safe_app = shlex.quote(app_name)
    mode, rf, sf = payload.get("mode"), int(payload.get("rf", 3)), int(payload.get("sf", 2))
    pem_content, debug_mode = payload.get("pem_key_content", ""), payload.get("debug_mode", "verbose") == "verbose"
    if payload.get("debug_mode") == "trace": debug_mode = True

    total_nodes = rf + 1 if mode == "cluster" else 1
    local_status, real_ips = "SUCCESS", []

    try:
        await manager.send_log(dep_id, "==== ORCHESTRATOR START ====", "info", "init", "SYS")

        ttl_raw = payload.get("ttl")
        ccm_payload = {
            "name": base_name, "disk_storage": int(payload.get("disk_storage")),
            "operating_system": payload.get("os"), "instance_type": payload.get("instance_type"),
            "timezone": payload.get("timezone"), "ssh_key_name": payload.get("ssh_key"),
            "splunk_version": payload.get("splunk_version"), "operation_hours": "business_hours",
            "ttl": f"{ttl_raw}T12:00:00.000Z" if len(ttl_raw) == 10 else ttl_raw,
            "splunk_validated_architecture": "S1", "num_instances": total_nodes
        }

        await manager.send_log(dep_id, "Transmitting payload to CCM API...", "info", "provision", "API")
        async with httpx.AsyncClient() as client:
            res = await client.post(f"{CCM_BASE_URL}/api/v1/deployments?type=splunk", headers=get_ccm_headers(),
                                    json=ccm_payload, timeout=60.0)
            if res.status_code not in [200, 202]: raise Exception(f"CCM API FAILURE -> {res.text}")
            real_id = res.json().get("data", {}).get("deployment_id", "UNKNOWN")

            update_deployment_stage(dep_id, real_id)
            await manager.send_log(dep_id, f"CCM ACCEPTED -> {real_id}", "success", "provision", "API")

            instances_ready = False
            for i in range(1, 61):
                await asyncio.sleep(10)
                try:
                    poll_res = await client.get(f"{CCM_BASE_URL}/api/v1/deployments/{real_id}",
                                                headers=get_ccm_headers(), timeout=30.0)
                    if poll_res.status_code == 200:
                        inst_data = poll_res.json().get("data", {}).get("instances_data", [])
                        running_nodes = [n for n in inst_data if n.get("state") == "running" and n.get("ip_address")]
                        if len(running_nodes) == total_nodes:
                            for idx, node in enumerate(running_nodes):
                                ip, inst_id = node.get("ip_address"), node.get("instance_id")
                                real_ips.append(ip)
                                role = "cluster_manager" if mode == "cluster" and idx == 0 else "indexer" if mode == "cluster" else "standalone"
                                hostname = "cluster-manager" if role == "cluster_manager" else f"indexer-{idx}" if role == "indexer" else "standalone-node"
                                update_topology(dep_id, hostname, role, ip, inst_id)
                            instances_ready = True
                            await manager.send_log(dep_id, f"Hardware allocated! REAL IPs: {', '.join(real_ips)}",
                                                   "success", "provision", "AWS")
                            break
                        await manager.send_log(dep_id, f"Poll {i}/60: {len(running_nodes)}/{total_nodes} running...",
                                               "debug", "provision", "API")
                except Exception as e:
                    await manager.send_log(dep_id, f"Poll Error -> {str(e)}", "warn", "provision", "API")

        if not instances_ready: raise Exception("INSTANCE BOOT TIMEOUT")

        for idx, ip in enumerate(real_ips):
            ok = await wait_for_ssh(ip, pem_content, dep_id, f"NODE-{idx}", debug_mode)
            if not ok: raise Exception(f"SSH FAILED -> {ip}")

        splunk_auth = f"-auth 'admin:{SPLUNK_ADMIN_PASSWORD}'"

        if mode == "cluster":
            cm_ip, peer_ips = real_ips[0], real_ips[1:]
            await manager.send_log(dep_id, "CLUSTER MODE DETECTED", "info", "bootstrap", "SYS")

            await exec_ssh(cm_ip, pem_content, "sudo hostnamectl set-hostname cluster-manager", dep_id, "CM",
                           debug_mode, "OS")
            for i, p_ip in enumerate(peer_ips, 1):
                await exec_ssh(p_ip, pem_content, f"sudo hostnamectl set-hostname indexer-{i}", dep_id, f"IDX-{i}",
                               debug_mode, "OS")

            cluster_secret = payload.get("pass4SymmKey", "ccm-default-secret")
            await exec_ssh(cm_ip, pem_content,
                           f"sudo su - splunk -c '/opt/splunk/bin/splunk edit cluster-config -mode manager -replication_factor {rf} -search_factor {sf} -secret \"{cluster_secret}\" {splunk_auth}'",
                           dep_id, "CM", debug_mode, "SPLUNK")
            await exec_ssh(cm_ip, pem_content, "sudo su - splunk -c '/opt/splunk/bin/splunk restart'", dep_id, "CM",
                           debug_mode, "SPLUNK")
            await wait_for_splunk(cm_ip, pem_content, dep_id)

            await manager.send_log(dep_id, "Sleeping 30s for Cluster Manager to bind Port 8089...", "warn", "bootstrap",
                                   "WAIT")
            await asyncio.sleep(30)

            for i, p_ip in enumerate(peer_ips, 1):
                await exec_ssh(p_ip, pem_content,
                               f"sudo su - splunk -c '/opt/splunk/bin/splunk edit cluster-config -mode peer -manager_uri https://{cm_ip}:8089 -replication_port 9887 -secret \"{cluster_secret}\" {splunk_auth}'",
                               dep_id, f"IDX-{i}", debug_mode, "SPLUNK")
                await exec_ssh(p_ip, pem_content, "sudo su - splunk -c '/opt/splunk/bin/splunk restart'", dep_id,
                               f"IDX-{i}", debug_mode, "SPLUNK")
                await wait_for_splunk(p_ip, pem_content, dep_id)

            await manager.send_log(dep_id, "Entering Cluster Stabilization Loop...", "info", "validate", "SYS")
            await asyncio.sleep(20)
            cluster_healthy = False
            for attempt in range(1, 13):
                await manager.send_log(dep_id, f"Validation Poll {attempt}/12...", "info", "validate", "CURL")
                success, output = await run_cmd_live(cm_ip, pem_content,
                                                     f"sudo su - splunk -c '/opt/splunk/bin/splunk show cluster-status {splunk_auth}'",
                                                     dep_id, "CM_VALID", True, "SPLUNK")
                health = parse_cluster_status(output)
                if cluster_is_healthy(health):
                    cluster_healthy = True
                    await manager.send_log(dep_id, "CLUSTER FULLY HEALTHY", "success", "validate", "SYS")
                    break
                await manager.send_log(dep_id,
                                       f"Sync Pending -> RF={health['rf_met']} SF={health['sf_met']} IDX={health['indexing_ready']}",
                                       "warn", "validate", "SYS")
                await asyncio.sleep(20)

            if not cluster_healthy:
                local_status = "PARTIAL_SUCCESS"
                await manager.send_log(dep_id, "CLUSTER PARTIAL_SUCCESS", "warn", "validate", "SYS")
        else:
            target_ip = real_ips[0]
            await exec_ssh(target_ip, pem_content, "sudo hostnamectl set-hostname standalone-node", dep_id, "NODE",
                           debug_mode, "OS")

        props, transforms = payload.get("propsConf", "").strip(), payload.get("transformsConf", "").strip()
        if props or transforms:
            target_ip = real_ips[0]
            app_dir = f"/opt/splunk/etc/manager-apps/{app_name}/local" if mode == "cluster" else f"/opt/splunk/etc/apps/{app_name}/local"
            await manager.send_log(dep_id, f"DEPLOYING -> {app_dir}", "info", "config", "SYS")
            await exec_ssh(target_ip, pem_content, f"sudo su - splunk -c 'mkdir -p {app_dir}'", dep_id, "CONFIG",
                           debug_mode, "OS")

            if props: await sftp_upload_file(target_ip, pem_content, f"{app_dir}/props.conf", props, dep_id, debug_mode)
            if transforms: await sftp_upload_file(target_ip, pem_content, f"{app_dir}/transforms.conf", transforms,
                                                  dep_id, debug_mode)

            await exec_ssh(target_ip, pem_content, f"sudo chown -R splunk:splunk {app_dir.replace('/local', '')}",
                           dep_id, "CONFIG", debug_mode, "OS")

            await manager.send_log(dep_id, "VALIDATING CONFIGS WITH BTOOL", "info", "btool", "BTOOL")
            if props: await exec_ssh(target_ip, pem_content,
                                     f"sudo su - splunk -c '/opt/splunk/bin/splunk btool props list --debug | grep {safe_app} || true'",
                                     dep_id, "BTOOL_PROPS", True, "BTOOL")
            if transforms: await exec_ssh(target_ip, pem_content,
                                          f"sudo su - splunk -c '/opt/splunk/bin/splunk btool transforms list --debug | grep {safe_app} || true'",
                                          dep_id, "BTOOL_TRANSFORMS", True, "BTOOL")

            if mode == "cluster":
                await manager.send_log(dep_id, "Applying Cluster Bundle...", "warn", "config", "BUNDLE")
                await exec_ssh(target_ip, pem_content,
                               f"sudo su - splunk -c '/opt/splunk/bin/splunk apply cluster-bundle --answer-yes --skip-validation {splunk_auth}'",
                               dep_id, "BUNDLE_PUSH", True, "BUNDLE")
            else:
                await exec_ssh(target_ip, pem_content, f"sudo su - splunk -c '/opt/splunk/bin/splunk restart'", dep_id,
                               "CONFIG", debug_mode, "SPLUNK")
                await wait_for_splunk(target_ip, pem_content, dep_id)
        else:
            await manager.send_log(dep_id, "SKIPPED CONFIGMAPS", "info", "config", "SYS")

        await manager.send_log(dep_id, f"==== WORKFLOW COMPLETE ({local_status}) ====", "success", "complete", "SYS")

    except Exception as e:
        local_status = "FAILED"
        update_deployment_stage(dep_id, "FAILED", "FAILED")
        traceback.print_exc()
        await manager.send_log(dep_id, f"FATAL ERROR: {str(e)}", "error", "crash", "SYS")
    finally:
        manager.log_history.pop(dep_id, None)  # FIX: RAM Leak terminated
        db = SessionLocal()
        try:
            log_data = json.dumps(manager.log_history.get(dep_id, []))
            existing = db.query(LocalDeployment).filter(LocalDeployment.id == dep_id).first()
            if existing:
                existing.logs, existing.status = log_data, local_status
            else:
                db.add(LocalDeployment(id=dep_id, name=base_name, owner=owner, app_name=app_name,
                                       props_conf=payload.get("propsConf", ""),
                                       transforms_conf=payload.get("transformsConf", ""), logs=log_data,
                                       status=local_status))
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()


# --- REST APIS ---
@app.post("/api/auth/register")
async def register(request: Request):
    payload = await request.json()
    uname, pwd = payload.get("username", "").lower(), payload.get("password", "")
    if not uname or not pwd: raise HTTPException(status_code=400, detail="Missing fields")
    db = SessionLocal()
    if db.query(User).filter(User.username == uname).first():
        db.close();
        raise HTTPException(status_code=400, detail="User exists")

    hashed = pwd_context.hash(pwd)
    role = "admin" if uname in ADMIN_USERS else "user"  # FIX: Secure Admin Assignment
    db.add(User(username=uname, password=hashed, role=role))
    db.commit();
    db.close()
    return {"status": "created"}


@app.post("/api/auth/login")
async def login(request: Request):
    payload = await request.json()
    uname, pwd = payload.get("username", "").lower(), payload.get("password", "")
    db = SessionLocal()
    user = db.query(User).filter(User.username == uname).first()
    db.close()

    if not user: raise HTTPException(status_code=401, detail="Invalid credentials")

    # FIX: Auto-migration for legacy plaintext passwords
    if not user.password.startswith("$2b$") and not user.password.startswith("$2y$"):
        if user.password != pwd: raise HTTPException(status_code=401, detail="Invalid credentials")
        db = SessionLocal()
        u = db.query(User).filter(User.username == uname).first()
        u.password = pwd_context.hash(pwd)
        db.commit();
        db.close()
    elif not pwd_context.verify(pwd, user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = jwt.encode({"sub": user.username, "role": user.role, "exp": datetime.utcnow() + timedelta(hours=8)},
                       JWT_SECRET, algorithm=ALGORITHM)
    return {"username": user.username, "role": user.role, "token": token}


@app.get("/api/meta")
async def fetch_meta(current_user: dict = Depends(verify_token)):
    try:
        async with httpx.AsyncClient() as client:
            r1 = await client.get(f"{CCM_BASE_URL}/ssh_keys/", headers=get_ccm_headers(), timeout=30.0)
            keys = [k["ssh_key_name"].split("#")[-1] for k in r1.json()] if r1.status_code == 200 else []
            r2 = await client.get(f"{CCM_BASE_URL}/api/v1/meta", headers=get_ccm_headers(), timeout=30.0)
            meta = r2.json() if r2.status_code == 200 else {}
        return {"keys": keys, "os": meta.get("operating_systems", ["ubuntu_22.04"]),
                "instance_types": meta.get("instance_types", ["t3a.medium", "c6a.xlarge"]),
                "disk": meta.get("disk_storage", [50, 100])}
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/deployments")
async def get_deployments(current_user: dict = Depends(verify_token)):
    username, role = current_user["username"], current_user["role"]
    db = SessionLocal()
    local_deps = db.query(LocalDeployment).all()
    local_dep_map = {d.name: d for d in local_deps}
    db.close()
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{CCM_BASE_URL}/api/v1/deployments", headers=get_ccm_headers(), timeout=30.0)
        ccm_data = res.json().get("data", {}).get("user_deployments", [])
        merged_data, ccm_ids = [], set()
        for d in ccm_data:
            if role != "admin" and d.get("owner") != username: continue
            effective_id = d.get("local_id") or d.get("deployment_id")
            ccm_ids.add(effective_id)
            if d.get("name") in local_dep_map:
                ld = local_dep_map[d.get("name")]
                d["local_id"], d["local_status"] = ld.id, ld.status
                d["props"], d["transforms"], d["app_name"] = ld.props_conf, ld.transforms_conf, ld.app_name
                if ld.topology_json and ld.topology_json != "[]":
                    d["instances_data"] = json.loads(ld.topology_json)
                    d["num_instances"] = len(d["instances_data"])
            merged_data.append(d)
        for ld in local_deps:
            if ld.id not in ccm_ids and (role == "admin" or ld.owner == username):
                instances = json.loads(ld.topology_json or "[]")
                merged_data.append(
                    {"name": ld.name, "deployment_id": ld.id, "owner": ld.owner, "resource_type": ["Local Job"],
                     "num_instances": len(instances), "req_state": ld.stage, "local_id": ld.id,
                     "local_status": ld.status, "props": ld.props_conf, "transforms": ld.transforms_conf,
                     "app_name": ld.app_name, "instances_data": instances})
        return {"data": merged_data}
    except Exception as e:
        return {"error": str(e)}


@app.delete("/api/deployments/{dep_id}")
async def delete_deployment(dep_id: str, current_user: dict = Depends(verify_token)):
    db = SessionLocal()
    try:
        dep = db.query(LocalDeployment).filter(LocalDeployment.id == dep_id).first()

        # 1. Determine the real CCM ID and verify ownership if it's a local job
        if dep:
            if current_user["role"] != "admin" and dep.owner != current_user["username"]:
                raise HTTPException(status_code=403, detail="FORBIDDEN: You do not own this deployment")
            target_ccm_id = dep.stage if (dep.stage and dep.stage.startswith("dep-")) else None
        else:
            # 2. If it's not in the local DB, assume it's a direct CCM deployment ID
            target_ccm_id = dep_id

        # 3. Send the DELETE request to the upstream CCM API
        if target_ccm_id:
            try:
                async with httpx.AsyncClient() as client:
                    await client.delete(f"{CCM_BASE_URL}/api/v1/deployments/{target_ccm_id}", headers=get_ccm_headers(),
                                        timeout=30.0)
            except Exception:
                pass

        # 4. Clean up the local database record
        if dep:
            db.delete(dep)
            db.commit()

    finally:
        db.close()

    manager.log_history.pop(dep_id, None)
    return {"status": 200}


@app.patch("/api/deployments/{dep_id}/instances/{inst_id}")
async def patch_instance(dep_id: str, inst_id: str, request: Request, current_user: dict = Depends(verify_token)):
    payload = await request.json()
    db = SessionLocal()
    try:
        dep = db.query(LocalDeployment).filter(LocalDeployment.id == dep_id).first()

        if dep:
            if current_user["role"] != "admin" and dep.owner != current_user["username"]:
                raise HTTPException(status_code=403, detail="FORBIDDEN: You do not own this deployment")
            target_ccm_id = dep.stage if (dep.stage and dep.stage.startswith("dep-")) else None
        else:
            target_ccm_id = dep_id

        if target_ccm_id:
            async with httpx.AsyncClient() as client:
                await client.patch(f"{CCM_BASE_URL}/api/v1/deployments/{target_ccm_id}/instances/{inst_id}",
                                   headers=get_ccm_headers(), json=payload, timeout=30.0)
    finally:
        db.close()

    return {"status": 200}

@app.post("/api/deployments")
async def create_deployment(request: Request, bg_tasks: BackgroundTasks, current_user: dict = Depends(verify_token)):
    payload = await request.json()
    req_fields = ["name", "os", "instance_type", "timezone", "ssh_key", "splunk_version", "ttl"]
    missing = [f for f in req_fields if not payload.get(f)]
    if missing: raise HTTPException(status_code=400, detail=f"Missing required fields: {', '.join(missing)}")
    if payload.get("mode") == "cluster" and int(payload.get("sf", 2)) > int(payload.get("rf", 3)): raise HTTPException(
        status_code=400, detail="Search Factor cannot exceed Replication Factor")

    owner = current_user["username"]
    db = SessionLocal()
    try:
        active_job = db.query(LocalDeployment).filter(LocalDeployment.owner == owner, LocalDeployment.status.in_(
            ["INITIALIZING", "QUEUED", "PROVISIONING"])).first()
        if active_job: raise HTTPException(status_code=400, detail="Deployment already running")

        job_id = f"job-{uuid.uuid4().hex[:8]}"
        db.add(LocalDeployment(id=job_id, name=payload.get("name"), owner=owner, app_name=re.sub(r'[^a-zA-Z0-9_-]', '',
                                                                                                 payload.get(
                                                                                                     "custom_app_name",
                                                                                                     "ccm_custom_configs")),
                               props_conf=payload.get("propsConf", ""),
                               transforms_conf=payload.get("transformsConf", ""), logs="[]", topology_json="[]",
                               status="INITIALIZING", stage="QUEUED"))
        db.commit()
    finally:
        db.close()

    bg_tasks.add_task(orchestrate_deployment, job_id, payload, owner)
    return {"status": "accepted", "deployment_id": job_id}


@app.patch("/api/deployments/{dep_id}/configs")
async def update_configs(dep_id: str, request: Request, current_user: dict = Depends(verify_token)):
    payload = await request.json()
    dep = verify_ownership(dep_id, current_user)
    db = SessionLocal()
    try:
        db_dep = db.query(LocalDeployment).filter(LocalDeployment.id == dep_id).first()
        db_dep.props_conf = payload.get("props", db_dep.props_conf)
        db_dep.transforms_conf = payload.get("transforms", db_dep.transforms_conf)
        db.commit()
    finally:
        db.close()
    return {"status": "updated"}


@app.post("/api/deployments/{dep_id}/apply-config")
async def apply_config_api(dep_id: str, request: Request, bg_tasks: BackgroundTasks,
                           current_user: dict = Depends(verify_token)):
    payload = await request.json()
    pem = payload.get("pem_key_content")
    if not pem: raise HTTPException(status_code=400, detail="PEM Key required to apply configs")
    dep = verify_ownership(dep_id, current_user)
    topology = json.loads(dep.topology_json or "[]")
    if not topology: raise HTTPException(status_code=400, detail="No active topology found for this deployment")
    bg_tasks.add_task(execute_config_push, dep_id, dep.app_name, dep.props_conf, dep.transforms_conf, topology, pem)
    return {"status": "accepted"}


@app.get("/api/local_deployments")
async def get_local_deployments(current_user: dict = Depends(verify_token)):
    db = SessionLocal()
    try:
        query = db.query(LocalDeployment).order_by(LocalDeployment.created_at.desc())
        if current_user["role"] != "admin": query = query.filter(LocalDeployment.owner == current_user["username"])
        deps = query.all()
        return [{"id": d.id, "name": d.name, "owner": d.owner, "app_name": d.app_name, "props": d.props_conf,
                 "transforms": d.transforms_conf, "status": d.status, "topology": json.loads(d.topology_json or "[]")}
                for d in deps]
    except Exception:
        return []
    finally:
        db.close()


@app.get("/api/deployments/{dep_id}/logs")
async def get_logs(dep_id: str, current_user: dict = Depends(verify_token)):
    verify_ownership(dep_id, current_user)
    if dep_id in manager.log_history: return [json.loads(x) for x in manager.log_history[dep_id]]
    db = SessionLocal()
    try:
        dep = db.query(LocalDeployment).filter(LocalDeployment.id == dep_id).first()
        if dep and dep.logs: return [json.loads(x) for x in json.loads(dep.logs)]
        return []
    except Exception:
        return []
    finally:
        db.close()


@app.get("/api/node-config/{ip}")
async def node_config(ip: str, current_user: dict = Depends(verify_token)):
    db = SessionLocal()
    try:
        deps = db.query(LocalDeployment).all()
        for dep in deps:
            if dep.topology_json:
                nodes = json.loads(dep.topology_json)
                for n in nodes:
                    if n.get("ip_address") == ip:
                        verify_ownership(dep.id, current_user)
                        return {"props": dep.props_conf, "transforms": dep.transforms_conf, "app": dep.app_name}
        return {"error": "node not found"}
    finally:
        db.close()


# --- SECURITY FIX: WebSocket JWT Interception ---
@app.websocket("/ws/logs/{dep_id}")
async def websocket_logs(websocket: WebSocket, dep_id: str, token: str = Query(None)):
    if not token:
        return await websocket.close(code=1008)
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        verify_ownership(dep_id, {"username": payload.get("sub"), "role": payload.get("role")})
    except Exception:
        return await websocket.close(code=1008)

    await websocket.accept()
    await manager.connect(websocket, dep_id)
    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=60)
                if data == "ping": await websocket.send_text(json.dumps(
                    {"ts": datetime.utcnow().strftime("%H:%M:%S"), "level": "debug", "msg": "pong", "tag": "SYS"}))
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps(
                    {"ts": datetime.utcnow().strftime("%H:%M:%S"), "level": "debug", "msg": "heartbeat", "tag": "SYS"}))
    except WebSocketDisconnect:
        manager.disconnect(websocket, dep_id)
    except Exception as e:
        manager.disconnect(websocket, dep_id)