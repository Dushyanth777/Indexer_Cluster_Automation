# Splunk Indexer Cluster Automation Platform 🚀

A full-stack, enterprise-grade orchestration engine designed to automate the deployment, configuration, and management of Splunk Enterprise environments. This platform integrates with the Corporate Cloud Manager (CCM) API to provision cloud infrastructure and dynamically bootstraps Splunk Validated Architectures (SVAs) without manual SSH intervention.

## ✨ Key Features
* **Dynamic SVA Routing:** Automatically provisions Standalone (S1), standard Distributed Clusters (C3), or executes advanced manual clustering pipelines for high Replication Factor (RF > 3) environments.
* **Real-Time Orchestration Terminal:** Streams deep OS-level and Splunk daemon execution logs directly to the UI via WebSockets.
* **Zero-Touch Configuration:** Automatically injects `props.conf` and `transforms.conf` into dynamically generated Splunk Apps (`/opt/splunk/etc/apps/`) post-installation.
* **Role-Based Access Control (RBAC):** Distinct `admin` (Root Access) and `user` workflows for secure infrastructure management and visibility.
* **Intelligent Recommendation Engine:** Calculates estimated storage, CPU/RAM sizing, and node counts based on selected RF/SF parameters.

## 🛠️ Tech Stack
* **Frontend:** React, TypeScript, Vite, Tailwind CSS v4, Lucide Icons
* **Backend:** Python, FastAPI, WebSockets, SQLAlchemy, SQLite
* **Orchestration:** Paramiko (Async SSH), Requests (CCM API integration)

---

## ⚙️ Local Setup & Installation

### Prerequisites
* [Node.js](https://nodejs.org/) (v18+)
* [Python](https://www.python.org/downloads/) (v3.9+)

### 1. Clone the Repository
```bash
git clone https://github.com/Dushyanth777/Indexer_Cluster_Automation.git
cd Indexer_Cluster_Automation
