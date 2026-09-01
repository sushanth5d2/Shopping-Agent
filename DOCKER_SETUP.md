# Docker Setup Guide for Shopping-Agent

This file explains how to install Docker and run the Shopping-Agent app on Linux.

## 1) Install Docker on Ubuntu / Debian

Run the following commands:

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

## 2) Start Docker

```bash
sudo systemctl enable docker
sudo systemctl start docker
```

## 3) Add your user to the Docker group

```bash
sudo usermod -aG docker $USER
```

Log out and log back in to apply the group change.

## 4) Verify Docker is working

```bash
docker --version
docker compose version
```

If both commands work, Docker is ready.

## 5) Go to the project folder

```bash
cd /workspaces/Shopping-Agent
```

## 6) Start the app

```bash
docker compose up -d --build
```

This starts:

- PostgreSQL database
- FastAPI backend
- monitoring worker
- Next.js web app

## 7) Check if containers are running

```bash
docker compose ps
```

## 8) Test the app

Open the browser:

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- API docs: http://localhost:8000/docs

To check health from the terminal:

```bash
curl http://localhost:8000/api/health
curl -I http://localhost:3000
```

## 9) Check logs if there is a problem

```bash
docker compose logs -f backend web db
```

## 10) Stop the app

```bash
docker compose down
```

To reset the database completely:

```bash
docker compose down -v
```

## 11) Rebuild everything from scratch

```bash
docker compose down -v --remove-orphans
docker compose up -d --build
```

## 12) Quick summary

```bash
cd /workspaces/Shopping-Agent
docker compose up -d --build
```

Then open:

```text
http://localhost:3000
http://localhost:8000/docs
```

## 13) If Docker is already installed

You can skip installation and go straight to:

```bash
cd /workspaces/Shopping-Agent
docker compose up -d --build
```
