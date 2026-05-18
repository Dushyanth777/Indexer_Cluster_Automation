# CCM Splunk Orchestration Matrix

A full-stack Splunk deployment orchestration platform built using FastAPI and React.

This platform automates:

* Standalone Splunk deployments
* Distributed Splunk indexer clusters
* Cluster Manager configuration
* Live deployment monitoring
* ConfigMap injection (`props.conf`, `transforms.conf`)
* Real-time websocket logs
* Deployment termination and cleanup

---

# Features

## Backend

* FastAPI
* JWT Authentication
* WebSocket live logging
* Async deployment orchestration
* SSH automation using Paramiko
* SQLite persistence
* CCM API integration
* Cluster validation
* Config bundle deployment

## Frontend

* React
* TailwindCSS
* Real-time deployment dashboard
* Live terminal logs
* Deployment history
* ConfigMap viewer
* Deployment controls

---

# Project Structure

```text
ccm-automation/
│
├── ccm-backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── .env
│   └── ccm_system.db
│
├── ccm-frontend/
│   ├── src/
│   ├── package.json
│   └── vite.config.js
│
└── README.md
```

---

# Backend Setup

## 1. Create Virtual Environment

### Windows

```bash
python -m venv .venv
```

Activate:

```bash
.venv\Scripts\activate
```

### Linux/macOS

```bash
python3 -m venv .venv
source .venv/bin/activate
```

---

# 2. Install Dependencies

Create `requirements.txt`

```txt
fastapi
uvicorn
sqlalchemy
python-dotenv
httpx
paramiko
passlib[bcrypt]
bcrypt==4.0.1
PyJWT
python-multipart
```

Install:

```bash
pip install -r requirements.txt
```

---

# 3. Environment Variables

Create:

```text
ccm-backend/.env
```

Add:

```env
CCM_BEARER_TOKEN=YOUR_CCM_API_TOKEN
SPLUNK_ADMIN_PASSWORD=SplunkAdmin123
JWT_SECRET=super_secure_random_secret
```

---

# 4. Start Backend

```bash
cd ccm-backend
uvicorn main:app --reload
```

Backend runs on:

```text
http://localhost:8000
```

---

# Frontend Setup

## 1. Install Dependencies

```bash
cd ccm-frontend
npm install
```

Install required packages:

```bash
npm install react react-dom
npm install lucide-react
npm install tailwindcss
npm install vite
```

---

# 2. Start Frontend

```bash
npm run dev
```

Frontend runs on:

```text
http://localhost:5173
```

---

# Authentication

## Register

```http
POST /api/auth/register
```

## Login

```http
POST /api/auth/login
```

JWT tokens are automatically used for:

* REST API authentication
* WebSocket authentication
* Deployment ownership validation

---

# Deployment Modes

## Standalone

Creates:

* Single Splunk instance

---

## Cluster Mode

Creates:

* 1 Cluster Manager
* Multiple indexers

Example:

```text
RF = 3
Creates:
- 1 Cluster Manager
- 3 Indexers
```

---

# ConfigMap Injection

Supports:

## props.conf

```ini
[source::...]
TRANSFORMS-routing = route_data
```

## transforms.conf

```ini
[route_data]
REGEX = .
DEST_KEY = _TCP_ROUTING
FORMAT = idx_group
```

---

# Live Logs

Real-time deployment logs are streamed using WebSockets.

Endpoint:

```text
/ws/logs/{deployment_id}
```

---

# Stop Deployment

The deployment stop API:

* Cancels active orchestration task
* Deletes CCM deployment
* Terminates created instances
* Stops websocket streaming
* Updates deployment status

Endpoint:

```http
POST /api/deployments/{dep_id}/stop
```

---

# API Endpoints

## Deployments

### Create Deployment

```http
POST /api/deployments
```

### List Deployments

```http
GET /api/deployments
```

### Delete Deployment

```http
DELETE /api/deployments/{dep_id}
```

### Stop Deployment

```http
POST /api/deployments/{dep_id}/stop
```

---

# Default Splunk Credentials

```text
Username: admin
Password: value from SPLUNK_ADMIN_PASSWORD
```

---

# SSH Access

```bash
ssh -i mykey.pem splunker@<INSTANCE_IP>
```

---

# Troubleshooting

## bcrypt Error

```text
AttributeError: module 'bcrypt' has no attribute '__about__'
```

Fix:

```bash
pip uninstall bcrypt
pip install bcrypt==4.0.1
```

---

## JWT Error

```text
module 'jwt' has no attribute 'encode'
```

Fix:

```bash
pip uninstall jwt
pip install PyJWT
```

---

## WebSocket Handshake Error

```text
ASGI callable returned without sending handshake
```

Fix:

Ensure:

```python
await websocket.accept()
```

exists in websocket route.

---

# Recommended Versions

| Component | Version |
| --------- | ------- |
| Python    | 3.11+   |
| Node.js   | 20+     |
| Splunk    | 9.4+    |
| FastAPI   | Latest  |
| React     | Latest  |

---

# Security Notes

* JWT-protected APIs
* WebSocket authentication
* Deployment ownership validation
* Sanitized app paths
* Secure SSH orchestration
* Deployment cleanup support

---

# Future Improvements

* Search Head Cluster support
* Deployment Server integration
* Monitoring Console deployment
* App package uploads
* Redis task queue
* PostgreSQL support
* RBAC enhancements

---

# License

This project is intended for educational and infrastructure automation purposes.
