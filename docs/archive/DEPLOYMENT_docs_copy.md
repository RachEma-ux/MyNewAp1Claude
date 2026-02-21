# Deployment Guide

## Overview

This guide covers deploying Unified LLM Platform in various environments.

## Deployment Options

1. **Docker** - Recommended for most use cases
2. **Native Installation** - Direct installation on Linux/macOS/Windows
3. **Kubernetes** - For large-scale production deployments
4. **Cloud Platforms** - AWS, GCP, Azure, DigitalOcean

---

## Docker Deployment

### Quick Start

```bash
# Clone repository
git clone https://github.com/unified-llm/platform.git
cd platform

# Create environment file
cp .env.example .env
# Edit .env with your configuration

# Start with Docker Compose
docker-compose up -d
```

### Configuration

Edit `.env` file:

```env
# Database
DATABASE_URL=postgresql://user:password@database:5432/unifiedllm

# JWT
JWT_SECRET=your-secret-key-here

# OAuth
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://auth.manus.im

# Qdrant
QDRANT_URL=http://qdrant:6333
```

### Services

Docker Compose includes:
- **app** - Main application (port 3000)
- **database** - PostgreSQL 16 (port 5432)
- **qdrant** - Vector database (port 6333)
- **redis** - Caching (port 6379)
- **nginx** - Reverse proxy (ports 80, 443)

### Volumes

Data persists in Docker volumes:
- `app-data` - Application data
- `model-cache` - Downloaded models
- `db-data` - Database
- `qdrant-data` - Vector database
- `redis-data` - Cache

### Commands

```bash
# Start
docker-compose up -d

# Stop
docker-compose down

# View logs
docker-compose logs -f app

# Restart service
docker-compose restart app

# Update
docker-compose pull
docker-compose up -d
```

---

## Native Installation

### Linux

```bash
# Download installer
curl -fsSL https://install.unified-llm.ai/linux.sh | bash

# Or manual installation
wget https://github.com/unified-llm/platform/releases/latest/download/unified-llm-linux.tar.gz
tar -xzf unified-llm-linux.tar.gz
cd unified-llm
./scripts/install-linux.sh
```

### macOS

```bash
# Using Homebrew
brew install unified-llm

# Or download DMG
# Download from https://unified-llm.ai/download
# Open DMG and drag to Applications
```

### Windows

```powershell
# Using Chocolatey
choco install unified-llm

# Or download installer
# Download UnifiedLLM-Setup.exe from https://unified-llm.ai/download
# Run installer and follow wizard
```

---

## Kubernetes Deployment

### Prerequisites

- Kubernetes cluster (1.20+)
- kubectl configured
- Helm 3

### Install with Helm

```bash
# Add Helm repository
helm repo add unified-llm https://charts.unified-llm.ai
helm repo update

# Install
helm install unified-llm unified-llm/platform \
  --set database.password=yourpassword \
  --set jwt.secret=yoursecret

# Custom values
helm install unified-llm unified-llm/platform -f values.yaml
```

### values.yaml Example

```yaml
replicaCount: 3

image:
  repository: unifiedllm/platform
  tag: latest
  pullPolicy: IfNotPresent

service:
  type: LoadBalancer
  port: 80

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: llm.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: llm-tls
      hosts:
        - llm.example.com

database:
  type: postgresql
  host: postgres.default.svc.cluster.local
  port: 5432
  name: unifiedllm
  user: llmuser
  password: changeme

qdrant:
  enabled: true
  persistence:
    size: 50Gi

redis:
  enabled: true
  persistence:
    size: 10Gi

resources:
  limits:
    cpu: 2000m
    memory: 4Gi
  requests:
    cpu: 1000m
    memory: 2Gi

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
```

### Manual Kubernetes Deployment

```bash
# Apply manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/database.yaml
kubectl apply -f k8s/qdrant.yaml
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/app.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
```

---

## Cloud Platform Deployment

### AWS

#### ECS (Elastic Container Service)

```bash
# Build and push image
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com
docker build -t unified-llm .
docker tag unified-llm:latest <account>.dkr.ecr.us-east-1.amazonaws.com/unified-llm:latest
docker push <account>.dkr.ecr.us-east-1.amazonaws.com/unified-llm:latest

# Deploy with ECS
aws ecs create-cluster --cluster-name unified-llm
aws ecs register-task-definition --cli-input-json file://ecs-task-definition.json
aws ecs create-service --cluster unified-llm --service-name unified-llm --task-definition unified-llm --desired-count 2
```

#### EC2

```bash
# Launch EC2 instance (Ubuntu 22.04)
# SSH into instance
ssh -i key.pem ubuntu@<instance-ip>

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu

# Deploy
git clone https://github.com/unified-llm/platform.git
cd platform
docker-compose up -d
```

### Google Cloud Platform

#### Cloud Run

```bash
# Build and push
gcloud builds submit --tag gcr.io/<project-id>/unified-llm

# Deploy
gcloud run deploy unified-llm \
  --image gcr.io/<project-id>/unified-llm \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars DATABASE_URL=<url>,JWT_SECRET=<secret>
```

#### GKE (Google Kubernetes Engine)

```bash
# Create cluster
gcloud container clusters create unified-llm \
  --num-nodes=3 \
  --machine-type=n1-standard-2

# Deploy with Helm
helm install unified-llm unified-llm/platform
```

### Azure

#### Container Instances

```bash
# Create resource group
az group create --name unified-llm --location eastus

# Deploy container
az container create \
  --resource-group unified-llm \
  --name unified-llm \
  --image unifiedllm/platform:latest \
  --dns-name-label unified-llm \
  --ports 3000 \
  --environment-variables DATABASE_URL=<url> JWT_SECRET=<secret>
```

#### AKS (Azure Kubernetes Service)

```bash
# Create cluster
az aks create \
  --resource-group unified-llm \
  --name unified-llm-cluster \
  --node-count 3 \
  --enable-addons monitoring \
  --generate-ssh-keys

# Deploy
helm install unified-llm unified-llm/platform
```

### DigitalOcean

#### App Platform

```yaml
# app.yaml
name: unified-llm
services:
  - name: app
    github:
      repo: unified-llm/platform
      branch: main
    build_command: pnpm build
    run_command: node dist/index.js
    envs:
      - key: DATABASE_URL
        value: ${db.DATABASE_URL}
      - key: JWT_SECRET
        value: ${JWT_SECRET}
    http_port: 3000
databases:
  - name: db
    engine: PG
    version: "16"
```

```bash
# Deploy
doctl apps create --spec app.yaml
```

---

## Environment Variables

### Required

- `DATABASE_URL` - Database connection string
- `JWT_SECRET` - JWT signing secret
- `OAUTH_SERVER_URL` - OAuth server URL
- `VITE_OAUTH_PORTAL_URL` - OAuth portal URL

### Optional

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `QDRANT_URL` - Qdrant vector database URL
- `REDIS_URL` - Redis cache URL
- `LOG_LEVEL` - Logging level (debug/info/warn/error)

---

## SSL/TLS Configuration

### Using Let's Encrypt

```bash
# Install certbot
sudo apt-get install certbot

# Get certificate
sudo certbot certonly --standalone -d llm.example.com

# Configure nginx
server {
    listen 443 ssl;
    server_name llm.example.com;
    
    ssl_certificate /etc/letsencrypt/live/llm.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/llm.example.com/privkey.pem;
    
    location / {
        proxy_pass http://localhost:3000;
    }
}
```

### Auto-renewal

```bash
# Add cron job
sudo crontab -e

# Add line
0 0 * * * certbot renew --quiet
```

---

## Monitoring

### Health Check

```bash
curl http://localhost:3000/api/health
```

### Metrics

Prometheus metrics available at:
```
http://localhost:3000/metrics
```

### Logging

View logs:
```bash
# Docker
docker-compose logs -f app

# Systemd
journalctl -u unified-llm -f

# Kubernetes
kubectl logs -f deployment/unified-llm
```

---

## Backup & Restore

### Database Backup

```bash
# PostgreSQL
pg_dump -U user unifiedllm > backup.sql

# Restore
psql -U user unifiedllm < backup.sql
```

### Qdrant Backup

```bash
# Backup
docker exec qdrant tar -czf /backup/qdrant-$(date +%Y%m%d).tar.gz /qdrant/storage

# Restore
docker exec qdrant tar -xzf /backup/qdrant-20240101.tar.gz -C /
```

### Full Backup

```bash
# Backup script
./scripts/backup.sh

# Restore
./scripts/restore.sh backup-20240101.tar.gz
```

---

## Scaling

### Horizontal Scaling

```bash
# Docker Compose
docker-compose up -d --scale app=3

# Kubernetes
kubectl scale deployment unified-llm --replicas=5

# Auto-scaling
kubectl autoscale deployment unified-llm --min=2 --max=10 --cpu-percent=70
```

### Vertical Scaling

Update resource limits in deployment configuration.

---

## Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues and solutions.

---

## Support

- Documentation: https://docs.unified-llm.ai
- GitHub: https://github.com/unified-llm/platform
- Discord: https://discord.gg/unified-llm
