# CCM Splunk Orchestration Matrix

A full-stack Splunk deployment orchestration platform built using FastAPI and React.

This platform automates:

* Standalone Splunk deployments
* Distributed Splunk indexer cluster deployments
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
* Live deployment dashboard
* Real-time terminal logs
* Deployment history
* ConfigMap viewer
* Deployment controls

---

# Tech Stack

## Backend

* Python
* FastAPI
* SQLAlchemy
* Paramiko
* HTTPX
* SQLite

## Frontend

* React
* Vite
* TailwindCSS
* Lucide Icons

---

# Project Structure

```text
splunk-ccm-ui/
│
├── ccm-backend/
│   ├── main.py
│   ├── .env
│   └── ccm_system.db
│
├── public/
├── src/
├── package.json
├── vite.config.js
├── tailwind.config.js
└── README.md
```

---

# Backend Installation

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

Install required Python packages:

```bash
pip install fastapi uvicorn sqlalchemy python-dotenv httpx paramiko passlib[bcrypt] bcrypt==4.0.1 PyJWT python-multipart
```

---

# 3. Create Environment Variables

Create:

```text
ccm-backend/.env
```

Add:

```env
CCM_BEARER_TOKEN=YOUR_CCM_API_TOKEN
SPLUNK_ADMIN_PASSWORD=YourSplunkPassword
JWT_SECRET=YourJWTSecret
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

# Frontend Installation

## 1. Install Dependencies

```bash
npm install
```

Install required frontend packages:

```bash
npm install react react-dom lucide-react tailwindcss vite
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

Create a new user account using the registration screen.

## Login

Authenticate using JWT-based login.

---

# Deployment Modes

## Standalone Mode

Creates:

* Single Splunk instance

## Cluster Mode

Creates:

* 1 Cluster Manager
* Multiple Indexers

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

Deployment logs are streamed in real-time using WebSockets.

---

# Stop Deployment

The deployment stop API:

* Cancels active orchestration tasks
* Deletes CCM deployment
* Terminates created instances
* Stops websocket streaming
* Updates deployment status

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

# Recommended Versions

| Component | Version |
| --------- | ------- |
| Python    | 3.11+   |
| Node.js   | 20+     |
| Splunk    | 9.4+    |
| FastAPI   | Latest  |
| React     | Latest  |

---

# License

This project is intended for educational and infrastructure automation purposes.
