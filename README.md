# 🟢 Splunk CCM Orchestration Matrix 🚀

![Python](https://img.shields.io/badge/Backend-Python_FastAPI-2b5b84?style=for-the-badge\&logo=python\&logoColor=white)
![React](https://img.shields.io/badge/Frontend-React_TypeScript-61dafb?style=for-the-badge\&logo=react\&logoColor=black)
![Splunk](https://img.shields.io/badge/Target-Splunk_Enterprise-000000?style=for-the-badge\&logo=splunk\&logoColor=white)

A full-stack orchestration control plane designed to automate the deployment, configuration, and lifecycle management of Splunk Enterprise environments using the Corporate Cloud Manager (CCM) API.

This platform provisions infrastructure, bootstraps Splunk clusters, securely injects ConfigMaps, validates deployments using `btool`, and streams live orchestration logs through authenticated WebSockets.

---

# ✨ Features

## 🔐 Secure Authentication

* JWT-based session authentication
* Bcrypt password hashing
* Role-Based Access Control (RBAC)
* Protected API endpoints
* Ownership validation for deployments

---

## ⚡ Real-Time Orchestration

* Live deployment logs over WebSockets
* Real-time SSH command streaming
* Deployment stage tracking
* Cluster stabilization monitoring
* Splunk health validation loops

---

## 🏗️ Splunk Infrastructure Automation

Supports:

* Standalone Splunk deployments
* Distributed Indexer Clusters
* Cluster Manager bootstrapping
* Indexer peer joining
* Automated RF/SF validation
* Automatic hostname assignment

---

## 📂 Secure ConfigMap Injection

Securely pushes:

* `props.conf`
* `transforms.conf`

Features:

* SFTP-based secure upload engine
* Automatic ownership correction
* `btool` validation
* Cluster bundle replication
* Standalone restart orchestration

---

## 🌐 Operations Dashboard

* Live deployment dashboard
* Dynamic topology mapping
* Start/Stop instance controls
* Historical log replay
* Live SSH access helper
* Config repository management

---

# 📂 Project Structure

```text
Indexer_Cluster_Automation/
│
├── .venv/
│
├── ccm-backend/
│   ├── .env
│   ├── ccm_system.db
│   └── main.py
│
├── src/
│   ├── assets/
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
│
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
└── README.md
```

---

# ⚙️ Backend Environment Setup

Create:

```bash
ccm-backend/.env
```

Add:

```env
# CCM API TOKEN
CCM_BEARER_TOKEN=YOUR_CCM_TOKEN

# Splunk default admin password
SPLUNK_ADMIN_PASSWORD=your_splunk_password

# JWT signing secret
JWT_SECRET=super-secure-random-secret

# Comma-separated admin usernames
ADMIN_USERS=admin,root

# Allowed frontend origins
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

---

# ⚠️ Security Notes

Never commit:

* `.env`
* `.pem`
* `ccm_system.db`

Add to `.gitignore`:

```gitignore
.env
*.pem
ccm_system.db
.venv/
node_modules/
```

---

# 🚀 Installation

# Backend Setup

Open terminal:

```bash
cd ccm-backend
```

Create virtual environment:

```bash
python -m venv .venv
```

Activate:

## Windows

```bash
.venv\Scripts\activate
```

## Linux/macOS

```bash
source .venv/bin/activate
```

Install dependencies:

```bash
pip install fastapi
pip install "uvicorn[standard]"
pip install sqlalchemy
pip install python-dotenv
pip install httpx
pip install paramiko
pip install pyjwt
pip install "passlib[bcrypt]"
pip install python-multipart
pip install websockets
```

Run backend:

```bash
uvicorn main:app --reload --port 8000
```

---

# Frontend Setup

Open another terminal:

```bash
cd Indexer_Cluster_Automation
```

Install dependencies:

```bash
npm install
npm install react-router-dom lucide-react
```

Run frontend:

```bash
npm run dev
```

Frontend:

```text
http://localhost:5173
```

Backend:

```text
http://localhost:8000
```

---

# 🎮 Usage Guide

# 1. Authentication

* Register a user
* Login to access dashboard
* Admin usernames automatically receive elevated permissions

---

# 2. Deploy Splunk Infrastructure

Navigate to:

```text
Deploy Engine
```

Fill:

* Workload Name
* OS
* Instance Type
* SSH Key
* TTL
* Splunk Version

Choose:

* Standalone
  OR
* Distributed Cluster

Upload:

```text
.pem key
```

Click:

```text
EXECUTE_DEPLOYMENT
```

---

# 3. Cluster Deployment Flow

The orchestrator automatically:

1. Provisions infrastructure through CCM
2. Waits for SSH availability
3. Configures hostnames
4. Initializes Cluster Manager
5. Joins peer indexers
6. Restarts Splunk
7. Validates RF/SF
8. Confirms cluster health

---

# 4. ConfigMap Injection

Navigate to:

```text
ConfigMaps
```

Supported:

* props.conf
* transforms.conf

Workflow:

1. Save configs first
2. Upload PEM key
3. Apply configuration

The platform:

* Uploads configs securely through SFTP
* Executes `btool` validation
* Pushes cluster bundles
* Restarts standalone instances if required

---

# 5. Dashboard Operations

Dashboard features:

* Live topology mapping
* Instance status
* SSH helper buttons
* Splunk Web shortcuts
* Deployment expansion
* Live terminal viewer

Admin users can:

* START instances
* STOP instances
* SIGKILL deployments

---

# 📜 Execution History

Execution History provides:

* Full orchestration replay
* SSH logs
* Splunk bootstrap logs
* Cluster validation logs
* Config deployment history
* Failure tracing

---

# 🧠 Core Technologies

| Layer          | Technology         |
| -------------- | ------------------ |
| Frontend       | React + TypeScript |
| Styling        | TailwindCSS        |
| Backend        | FastAPI            |
| Database       | SQLite             |
| SSH Engine     | Paramiko           |
| Auth           | JWT + Bcrypt       |
| Real-Time Logs | WebSockets         |
| Infra Provider | CCM API            |
| Validation     | Splunk btool       |

---

# 🔄 Deployment Lifecycle

```text
INITIALIZING
    ↓
PROVISIONING
    ↓
WAITING_FOR_SSH
    ↓
BOOTSTRAPPING_CLUSTER
    ↓
VALIDATING_CLUSTER
    ↓
CONFIG_INJECTION
    ↓
COMPLETED
```

---

# 🛠️ Supported Splunk Operations

## Standalone

* Deployment
* Restart
* Config injection
* Health checks

## Distributed Cluster

* Cluster Manager bootstrap
* Peer registration
* RF/SF validation
* Bundle replication
* Peer validation

---

# 🔍 Built-In Health Checks

The orchestrator validates:

* SSH daemon availability
* Splunk daemon state
* Port `8089`
* Cluster replication factor
* Search factor
* Indexing readiness
* Bundle replication

---

# 📡 WebSocket Logging System

The platform streams:

* SSH command execution
* Splunk stdout/stderr
* Health validation
* Cluster sync states
* Config deployment logs
* Runtime errors

All logs are timestamped and categorized.

---

# 📌 Current Status

Current platform capabilities:

* Multi-user authentication
* RBAC security
* Real-time orchestration
* Distributed Splunk clustering
* Secure config deployment
* Historical log replay
* Live infrastructure control

---

