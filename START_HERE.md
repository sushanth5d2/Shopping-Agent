# Shopping-Agent Startup Guide

This document explains how to run the Shopping-Agent application locally.

## 1) Install Docker on Linux

If Docker is not installed yet, install it with the commands below.

### Ubuntu / Debian

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### Start Docker and add your user

```bash
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER
```

Log out and log back in, then verify:

```bash
docker --version
docker compose version
```

If Docker is already installed, skip this section.

## 2) Prerequisites

Install the following tools on your machine:

- Docker
- Docker Compose
- Python 3.12+
- Node.js 20+
- Git

## 3) Open the project folder

```bash
cd /workspaces/Shopping-Agent
```

## 4) Check environment variables

The app uses a local environment file named `.env`.

If you are starting from a fresh clone, create it from the example file:

```bash
cp .env.example .env
```

Then verify the values in `.env` before starting the app.

Important values include:

- `POSTGRES_PASSWORD`
- `SHOPAGENT_JWT_SECRET`
- `SHOPAGENT_CORS_ORIGINS`
- `NEXT_PUBLIC_API_URL`

The repo already contains a working dev config in `.env`, so this is usually not required in this workspace unless you reset the project.

## 5) Start the complete app

From the project root, run:

```bash
docker compose up -d --build
```

This starts the app stack:

- PostgreSQL database
- FastAPI backend
- Monitoring worker
- Next.js frontend

## 6) Check containers

```bash
docker compose ps
```

You should see the app services running.

## 7) View the app

Open these URLs in your browser:

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- Swagger docs: http://localhost:8000/docs
- Health check: http://localhost:8000/api/health

## 8) Verify the app is healthy

Run:

```bash
curl http://localhost:8000/api/health
```

And:

```bash
curl -I http://localhost:3000
```

## 9) Check logs if something fails

```bash
docker compose logs -f backend web db
```

## 10) Stop the app

To stop all services:

```bash
docker compose down
```

To stop and remove the database volume (reset DB):

```bash
docker compose down -v
```

## 11) Rebuild from scratch

If you want a complete clean rebuild:

```bash
docker compose down -v --remove-orphans
docker compose up -d --build
```

## 12) Manual run without Docker

### Backend

```bash
cd /workspaces/Shopping-Agent/backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Frontend

Open a second terminal:

```bash
cd /workspaces/Shopping-Agent/web
npm install
npm run dev
```

Then open:

- http://localhost:3000
- http://localhost:8000

## 13) Notes

- The backend container handles database migrations automatically.
- The frontend uses `NEXT_PUBLIC_API_URL` for the backend URL.
- This repo is production-oriented and uses Playwright for live URL processing.
- If the Docker services do not start correctly, check the logs first with `docker compose logs`.

## 14) Quick start command

If you want the minimal command sequence:

```bash
cd /workspaces/Shopping-Agent
docker compose up -d --build
```

Then open:

```text
http://localhost:3000
http://localhost:8000/docs
```
