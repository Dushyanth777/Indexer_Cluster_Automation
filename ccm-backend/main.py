import os
import asyncio
import json
import uuid
import requests
import io
import time
import paramiko
from datetime import datetime, timedelta
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, BackgroundTasks, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, String, JSON
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()
CCM_TOKEN = os.getenv("CCM_BEARER_TOKEN")
CCM_BASE_URL = "https://api.ccm.splunkits.io"
SPLUNK_ADMIN_PASSWORD = "admin"

Base = declarative_base()
engine = create_engine("sqlite:///./ccm_system.db", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class LocalDeployment(Base):
    __tablename__ = "local_deployments"
    id = Column(String, primary_key=True)
    name = Column(String)
    owner = Column(String)
    app_name = Column(String)
    props_conf = Column(String)
    transforms_conf = Column(String)


class User(Base):
    __tablename__ = "users"
    username = Column(String, primary_key=True)
    password = Column(String)
    role = Column(String)


Base.metadata.create_all(bind=engine)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, ws: WebSocket, dep_id: str):
        await ws.accept()
        self.active_connections[dep_id] = ws

    def disconnect(self, dep_id: str):
        if dep_id in self.active_connections: del self.active_connections[dep_id]

    async def send_log(self, dep_id: str, msg: str, level: str = "info"):
        if dep_id in self.active_connections:
            ts = datetime.utcnow().strftime('%H:%M:%S.%f')[:-3]
            await self.active_connections[dep_id].send_text(json.dumps({"ts": ts, "level": level, "msg": msg}))


manager = ConnectionManager()


# --- BULLETPROOF SSH EXECUTOR ---
async def run_cmd_live(ip: str, pem_content: str, cmd: str, dep_id: str, log_prefix: str):
    await manager.send_log(dep_id, f"[{log_prefix}] Exec: {cmd}", "info")

    def blocking_ssh():
        # 1. Smart Key Parser (Supports RSA, Ed25519, ECDSA)
        k = None
        for pkey_class in (paramiko.RSAKey, paramiko.Ed25519Key, paramiko.ECDSAKey, paramiko.DSSKey):
            try:
                k = pkey_class.from_private_key(io.StringIO(pem_content))
                break
            except Exception:
                pass

        if not k:
            return False, -1, ["KEY_ERROR: Invalid PEM format. Ensure it is a valid private key."]

        # 2. Aggressive Connection Retry Loop (AWS instances take a minute for SSH to wake up)
        c = paramiko.SSHClient()
        c.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        connected = False
        err_msg = ""
        for attempt in range(1, 7):  # Try for 30 seconds
            try:
                c.connect(hostname=ip, username="ubuntu", pkey=k, timeout=10, banner_timeout=15)
                connected = True
                break
            except Exception as e:
                err_msg = str(e)
                time.sleep(5)

        if not connected:
            return False, -1, [f"SSH_CONN_ERROR: Connection rejected by {ip} after multiple retries. ({err_msg})"]

        # 3. Execute Command
        try:
            stdin, stdout, stderr = c.exec_command(cmd, get_pty=True)
            out_lines = []
            for line in iter(stdout.readline, ""):
                clean_line = line.strip()
                if clean_line: out_lines.append(clean_line)

            status = stdout.channel.recv_exit_status()
            c.close()
            return True, status, out_lines
        except Exception as e:
            return False, -1, [f"EXEC_ERROR: {str(e)}"]

    success, status, lines = await asyncio.to_thread(blocking_ssh)

    for line in lines:
        await manager.send_log(dep_id, f"[{log_prefix} STDOUT] {line}", "debug")
        await asyncio.sleep(0.05)

    if not success or status != 0:
        await manager.send_log(dep_id, f"[{log_prefix}] FAILED with exit code {status}", "error")
        return False
    return True


# --- ORCHESTRATION ENGINE ---
async def orchestrate_deployment(dep_id: str, payload: dict, owner: str):
    await asyncio.sleep(1)
    base_name = payload.get("name")
    app_name = payload.get("custom_app_name", "ccm_custom_configs")
    rf = int(payload.get("rf", 3))
    sf = int(payload.get("sf", 2))
    mode = payload.get("mode")
    pem_content = payload.get("pem_key_content")

    if not pem_content:
        await manager.send_log(dep_id, "[FATAL] No PEM Key uploaded. Cannot establish SSH fabric.", "error")
        return

    total_nodes = payload.get("num_instances", rf + 1 if mode == "cluster" else 1)
    await manager.send_log(dep_id, f"==== INITIATING DEPLOYMENT WORKFLOW[{uuid.uuid4().hex[:8]}] ====", "info")

    # 1. TRANSMIT API
    ttl_raw = payload.get("ttl")
    ccm_payload = {
        "name": base_name, "disk_storage": int(payload.get("disk_storage")),
        "operating_system": payload.get("os"), "instance_type": payload.get("instance_type"),
        "timezone": payload.get("timezone"), "ssh_key_name": payload.get("ssh_key"),
        "splunk_version": payload.get("splunk_version"), "operation_hours": "business_hours",
        "ttl": f"{ttl_raw}T12:00:00.000Z" if len(ttl_raw) == 10 else ttl_raw,
        "splunk_validated_architecture": "S1", "num_instances": total_nodes
    }

    try:
        headers = {"Authorization": f"Bearer {CCM_TOKEN}", "Content-Type": "application/json"}
        res = await asyncio.to_thread(requests.post, f"{CCM_BASE_URL}/api/v1/deployments?type=splunk", headers=headers,
                                      json=ccm_payload)
        if res.status_code in [200, 202]:
            real_id = res.json().get("data", {}).get("deployment_id", "UNKNOWN")
            await manager.send_log(dep_id, f"CCM ACCEPTED: Remote ID: {real_id}", "success")
        else:
            await manager.send_log(dep_id, f"CCM REJECTED: {res.text}", "error")
            return
    except Exception as e:
        await manager.send_log(dep_id, f"NETWORK ERR: {e}", "error")
        return

    # 2. STRICT POLLING FOR REAL IPs (60 attempts = 10 Minutes)
    await manager.send_log(dep_id, f"[STEP 2] Actively polling CCM API for {total_nodes} nodes to boot...", "info")
    instances_ready = False
    real_ips = []

    for i in range(1, 61):
        await asyncio.sleep(10)
        try:
            poll_res = await asyncio.to_thread(requests.get, f"{CCM_BASE_URL}/api/v1/deployments/{real_id}",
                                               headers=headers)
            if poll_res.status_code == 200:
                inst_data = poll_res.json().get("data", {}).get("instances_data", [])
                running_nodes = [n for n in inst_data if n.get("state") == "running" and n.get("ip_address")]
                if len(running_nodes) == total_nodes:
                    real_ips = [n.get("ip_address") for n in running_nodes]
                    await manager.send_log(dep_id, f"Hardware allocated! REAL IPs: {', '.join(real_ips)}", "success")
                    instances_ready = True
                    break
                else:
                    await manager.send_log(dep_id, f"Poll {i}/60: {len(running_nodes)}/{total_nodes} running...",
                                           "debug")
        except Exception:
            pass

    # FATAL ABORT: Do not proceed without real IPs.
    if not instances_ready:
        await manager.send_log(dep_id, "[FATAL] Provisioning timed out. Aborting pipeline.", "error")
        return

    # 3. CONFIGURE ROLES & HOSTNAMES
    await manager.send_log(dep_id, "[STEP 3] Updating OS-level hostnames...", "info")
    if mode == "cluster":
        cm_ip = real_ips[0]
        peer_ips = real_ips[1:]

        await run_cmd_live(cm_ip, pem_content, "sudo hostnamectl set-hostname cluster_manager", dep_id, "CM")
        for i, p_ip in enumerate(peer_ips, 1):
            await run_cmd_live(p_ip, pem_content, f"sudo hostnamectl set-hostname indexer_{i}", dep_id, f"IDX_{i}")

        # 4. CONFIGURE CLUSTER MANAGER
        await manager.send_log(dep_id, "[STEP 4] Configuring Cluster Manager...", "info")
        cluster_secret = payload.get('pass4SymmKey')

        await run_cmd_live(cm_ip, pem_content,
                           f"sudo -u splunk /opt/splunk/bin/splunk edit cluster-config -mode master -replication_factor {rf} -search_factor {sf} -secret {cluster_secret} -auth admin:{SPLUNK_ADMIN_PASSWORD} -auto_accept",
                           dep_id, "CM")
        await run_cmd_live(cm_ip, pem_content, "sudo -u splunk /opt/splunk/bin/splunk restart", dep_id, "CM")

        # 5. CONFIGURE PEERS
        await manager.send_log(dep_id, "[STEP 5] Configuring Peer Indexers...", "info")
        for i, p_ip in enumerate(peer_ips, 1):
            await run_cmd_live(p_ip, pem_content,
                               f"sudo -u splunk /opt/splunk/bin/splunk edit cluster-config -mode slave -master_uri https://{cm_ip}:8089 -replication_port 9887 -secret {cluster_secret} -auth admin:{SPLUNK_ADMIN_PASSWORD} -auto_accept",
                               dep_id, f"IDX_{i}")
            await run_cmd_live(p_ip, pem_content, "sudo -u splunk /opt/splunk/bin/splunk restart", dep_id, f"IDX_{i}")

        await asyncio.sleep(5)
        await manager.send_log(dep_id, "Cluster topology initialized.", "success")

    # 6. DEPLOY CONFIGURATION APPS
    props = payload.get('propsConf', '').strip()
    transforms = payload.get('transformsConf', '').strip()

    if props or transforms:
        await manager.send_log(dep_id, f"[STEP 6] Deploying ConfigMaps to /opt/splunk/etc/apps/{app_name}/local",
                               "info")
        target_ip = real_ips[0] if real_ips else "LOCAL"

        await run_cmd_live(target_ip, pem_content, f"sudo -u splunk mkdir -p /opt/splunk/etc/apps/{app_name}/local",
                           dep_id, "CONFIG")

        if props:
            safe_props = props.replace("'", "'\\''")
            await run_cmd_live(target_ip, pem_content,
                               f"echo '{safe_props}' | sudo -u splunk tee /opt/splunk/etc/apps/{app_name}/local/props.conf",
                               dep_id, "CONFIG")

        if transforms:
            safe_transforms = transforms.replace("'", "'\\''")
            await run_cmd_live(target_ip, pem_content,
                               f"echo '{safe_transforms}' | sudo -u splunk tee /opt/splunk/etc/apps/{app_name}/local/transforms.conf",
                               dep_id, "CONFIG")

        if mode == "cluster":
            await run_cmd_live(target_ip, pem_content,
                               f"sudo -u splunk /opt/splunk/bin/splunk apply cluster-bundle -auth admin:{SPLUNK_ADMIN_PASSWORD} --answer-yes",
                               dep_id, "CONFIG")
        else:
            await run_cmd_live(target_ip, pem_content, "sudo -u splunk /opt/splunk/bin/splunk restart", dep_id,
                               "CONFIG")

    # SAVE TO DB
    db = SessionLocal()
    db.add(LocalDeployment(id=dep_id, name=base_name, owner=owner, app_name=app_name, props_conf=props,
                           transforms_conf=transforms))
    db.commit();
    db.close()

    await manager.send_log(dep_id, "==== DEPLOYMENT WORKFLOW COMPLETED SUCCESSFULLY ====", "success")


# --- APIS ---
@app.post("/api/auth/register")
async def register(request: Request):
    payload = await request.json()
    uname, pwd = payload.get("username", "").lower(), payload.get("password", "")
    if not uname or not pwd: raise HTTPException(status_code=400, detail="Missing fields")
    db = SessionLocal()
    if db.query(User).filter(User.username == uname).first():
        db.close();
        raise HTTPException(status_code=400, detail="User already exists")
    db.add(User(username=uname, password=pwd, role="admin" if uname == "admin" else "user"))
    db.commit();
    db.close()
    return {"status": "created"}


@app.post("/api/auth/login")
async def login(request: Request):
    payload = await request.json()
    uname, pwd = payload.get("username", "").lower(), payload.get("password", "")
    db = SessionLocal()
    user = db.query(User).filter(User.username == uname, User.password == pwd).first()
    db.close()
    if not user: raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"username": user.username, "role": user.role, "token": "session_ok"}


def get_ccm_headers():
    return {"Authorization": f"Bearer {CCM_TOKEN}"}


@app.get("/api/meta")
async def fetch_meta():
    try:
        r1 = requests.get(f"{CCM_BASE_URL}/ssh_keys/", headers=get_ccm_headers())
        keys = [k["ssh_key_name"].split("#")[-1] for k in r1.json()] if r1.status_code == 200 else []
        r2 = requests.get(f"{CCM_BASE_URL}/api/v1/meta", headers=get_ccm_headers())
        meta = r2.json() if r2.status_code == 200 else {}
        return {
            "keys": keys, "os": meta.get("operating_systems", ["ubuntu_22.04"]),
            "instance_types": meta.get("instance_types", ["t3a.medium", "c6a.xlarge", "m5.2xlarge"]),
            "disk": meta.get("disk_storage", [50, 100, 500])
        }
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/deployments")
async def get_deployments(request: Request):
    username = request.headers.get("X-User-Name", "")
    role = request.headers.get("X-User-Role", "user")
    try:
        res = requests.get(f"{CCM_BASE_URL}/api/v1/deployments", headers=get_ccm_headers())
        data = res.json().get("data", {}).get("user_deployments", [])
        if role != "admin": data = [d for d in data if d.get("owner") == username]

        db = SessionLocal()
        local_deps = {d.name: d for d in db.query(LocalDeployment).all()}
        db.close()
        for d in data:
            if d.get("name") in local_deps:
                d["props"] = local_deps[d.get("name")].props_conf
                d["transforms"] = local_deps[d.get("name")].transforms_conf

        return {"data": data}
    except Exception as e:
        return {"error": str(e)}


@app.delete("/api/deployments/{dep_id}")
async def delete_deployment(dep_id: str):
    res = requests.delete(f"{CCM_BASE_URL}/api/v1/deployments/{dep_id}", headers=get_ccm_headers())
    return {"status": res.status_code}


@app.patch("/api/deployments/{dep_id}/instances/{inst_id}")
async def patch_instance(dep_id: str, inst_id: str, request: Request):
    payload = await request.json()
    res = requests.patch(f"{CCM_BASE_URL}/api/v1/deployments/{dep_id}/instances/{inst_id}", headers=get_ccm_headers(),
                         json=payload)
    return {"status": res.status_code}


@app.post("/api/deployments")
async def create_deployment(request: Request, bg_tasks: BackgroundTasks):
    payload = await request.json()
    owner = request.headers.get("X-User-Name", "unknown")
    job_id = f"job-{uuid.uuid4().hex[:8]}"
    bg_tasks.add_task(orchestrate_deployment, job_id, payload, owner)
    return {"status": "accepted", "deployment_id": job_id}


@app.get("/api/configs")
async def get_configs():
    db = SessionLocal()
    deps = db.query(LocalDeployment).all()
    db.close()
    return [{"id": d.id, "name": d.name, "owner": d.owner, "app_name": d.app_name, "props": d.props_conf,
             "transforms": d.transforms_conf} for d in deps]


@app.websocket("/ws/logs/{dep_id}")
async def websocket_logs(websocket: WebSocket, dep_id: str):
    await manager.connect(websocket, dep_id)
    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(dep_id)