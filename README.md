# CCM Splunk Orchestration Matrix

A full-stack Splunk deployment orchestration platform built using FastAPI and React.

This platform automates:

* Standalone Splunk deployments
<<<<<<< HEAD
* Distributed Splunk indexer clusters
=======
* Distributed Splunk indexer cluster deployments
>>>>>>> 5801a0b963c1cdfad7fea56cb4837ca73a633f24
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
<<<<<<< HEAD
* Real-time deployment dashboard
* Live terminal logs
=======
* Live deployment dashboard
* Real-time terminal logs
>>>>>>> 5801a0b963c1cdfad7fea56cb4837ca73a633f24
* Deployment history
* ConfigMap viewer
* Deployment controls

---

<<<<<<< HEAD
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
=======
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
Indexer_Cluster_Automation/
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
>>>>>>> 5801a0b963c1cdfad7fea56cb4837ca73a633f24
└── README.md
```

---

<<<<<<< HEAD
# Backend Setup
=======
# Backend Installation
>>>>>>> 5801a0b963c1cdfad7fea56cb4837ca73a633f24

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

<<<<<<< HEAD
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
=======
Install required Python packages:

```bash
pip install fastapi uvicorn sqlalchemy python-dotenv httpx paramiko passlib[bcrypt] bcrypt==4.0.1 PyJWT python-multipart
>>>>>>> 5801a0b963c1cdfad7fea56cb4837ca73a633f24
```

---

<<<<<<< HEAD
# 3. Environment Variables
=======
# 3. Create Environment Variables
>>>>>>> 5801a0b963c1cdfad7fea56cb4837ca73a633f24

Create:

```text
ccm-backend/.env
```

Add:

```env
CCM_BEARER_TOKEN=YOUR_CCM_API_TOKEN
<<<<<<< HEAD
SPLUNK_ADMIN_PASSWORD=SplunkAdmin123
JWT_SECRET=super_secure_random_secret
=======
SPLUNK_ADMIN_PASSWORD=YourSplunkPassword
JWT_SECRET=YourJWTSecret
>>>>>>> 5801a0b963c1cdfad7fea56cb4837ca73a633f24
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

<<<<<<< HEAD
# Frontend Setup
=======
# Frontend Installation
>>>>>>> 5801a0b963c1cdfad7fea56cb4837ca73a633f24

## 1. Install Dependencies

```bash
<<<<<<< HEAD
cd ccm-frontend
npm install
```

Install required packages:

```bash
npm install react react-dom
npm install lucide-react
npm install tailwindcss
npm install vite
=======
npm install
```

Install required frontend packages:

```bash
npm install react react-dom lucide-react tailwindcss vite
>>>>>>> 5801a0b963c1cdfad7fea56cb4837ca73a633f24
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

<<<<<<< HEAD
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
=======
Create a new user account using the registration screen.

## Login

Authenticate using JWT-based login.
>>>>>>> 5801a0b963c1cdfad7fea56cb4837ca73a633f24

---

# Deployment Modes

<<<<<<< HEAD
## Standalone
=======
## Standalone Mode
>>>>>>> 5801a0b963c1cdfad7fea56cb4837ca73a633f24

Creates:

* Single Splunk instance

<<<<<<< HEAD
---

=======
>>>>>>> 5801a0b963c1cdfad7fea56cb4837ca73a633f24
## Cluster Mode

Creates:

* 1 Cluster Manager
<<<<<<< HEAD
* Multiple indexers
=======
* Multiple Indexers
>>>>>>> 5801a0b963c1cdfad7fea56cb4837ca73a633f24

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

<<<<<<< HEAD
Real-time deployment logs are streamed using WebSockets.

Endpoint:

```text
/ws/logs/{deployment_id}
```
=======
Deployment logs are streamed in real-time using WebSockets.
>>>>>>> 5801a0b963c1cdfad7fea56cb4837ca73a633f24

---

# Stop Deployment

The deployment stop API:

<<<<<<< HEAD
* Cancels active orchestration task
=======
* Cancels active orchestration tasks
>>>>>>> 5801a0b963c1cdfad7fea56cb4837ca73a633f24
* Deletes CCM deployment
* Terminates created instances
* Stops websocket streaming
* Updates deployment status

<<<<<<< HEAD
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

=======
>>>>>>> 5801a0b963c1cdfad7fea56cb4837ca73a633f24
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

<<<<<<< HEAD
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

=======
>>>>>>> 5801a0b963c1cdfad7fea56cb4837ca73a633f24
# Recommended Versions

| Component | Version |
| --------- | ------- |
| Python    | 3.11+   |
| Node.js   | 20+     |
| Splunk    | 9.4+    |
| FastAPI   | Latest  |
| React     | Latest  |

---

<<<<<<< HEAD
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

=======
>>>>>>> 5801a0b963c1cdfad7fea56cb4837ca73a633f24
# License

This project is intended for educational and infrastructure automation purposes.
