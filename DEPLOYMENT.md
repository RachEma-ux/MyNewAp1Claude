# MyNewAppV1 — Deployment Guide

## Prerequisites

- Node.js 18+ and pnpm (or npm)
- PostgreSQL 14+ database
- Docker (optional, for containerized deployment)

## Environment Variables

Create a `.env` file in the project root (see `.env.example` for a complete template).

```bash
# Database (Required) — PostgreSQL connection string
DATABASE_URL=postgresql://user:password@localhost:5432/mynewapp

# Authentication (Optional — app runs in demo mode without these)
JWT_SECRET=your-secret-key-here
VITE_OAUTH_PORTAL_URL=https://oauth.example.com
VITE_APP_ID=your-app-id

# Encryption (Required for production — used to encrypt provider secrets)
ENCRYPTION_KEY=your-32-byte-encryption-key

# Application
PORT=3000
VITE_APP_TITLE=MyNewAppV1
VITE_APP_LOGO=/logo.png

# Provider API Keys (Optional — auto-provisions providers on startup)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AI...

# OPA Policy Engine (Optional)
OPA_BASE_URL=https://opa.example.com
OPA_TIMEOUT=30000

# Storage (Optional — defaults to local filesystem)
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

# Redis (Optional — for rate limiting in multi-instance deployments)
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=info
```

## Installation

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/RachEma-ux/MyNewAp1Claude.git
cd MyNewAp1Claude
pnpm install
```

### 2. Database Setup

```bash
# Ensure PostgreSQL is running, then:
export DATABASE_URL=postgresql://user:password@localhost:5432/mynewapp

# Run migrations
pnpm db:push
```

### 3. Development

```bash
pnpm dev
# Server runs on http://localhost:3000
```

### 4. Production Build

```bash
pnpm build
pnpm start
```

## Docker Deployment

### Build Docker Image

```bash
docker build -t mynewapp:latest .
```

### Docker Compose

```yaml
version: '3.8'

services:
  app:
    image: mynewapp:latest
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://user:password@db:5432/mynewapp
      ENCRYPTION_KEY: your-encryption-key
      NODE_ENV: production
    depends_on:
      - db

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: mynewapp
    volumes:
      - db_data:/var/lib/postgresql/data

volumes:
  db_data:
```

## Production Deployment

### 1. Reverse Proxy Setup (Nginx)

```nginx
upstream app {
  server localhost:3000;
}

server {
  listen 443 ssl;
  server_name app.example.com;

  ssl_certificate /path/to/cert.pem;
  ssl_certificate_key /path/to/key.pem;

  location / {
    proxy_pass http://app;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}
```

### 2. Health Check

```bash
curl http://localhost:3000/api/health
```

## Backup and Recovery

### Manual Backup

```bash
pg_dump -U user mynewapp > backup_$(date +%Y%m%d).sql
```

### Restore

```bash
psql -U user mynewapp < backup_20260221.sql
```

## Troubleshooting

### Database Connection Issues

```bash
# Test PostgreSQL connection
psql $DATABASE_URL -c "SELECT 1"
```

### Application Logs

```bash
# View application health
curl http://localhost:3000/api/health
```

## Security Checklist

- [ ] Set `ENCRYPTION_KEY` in production (never use the default dev key)
- [ ] Enable HTTPS/TLS via reverse proxy
- [ ] Set strong database passwords
- [ ] Configure CORS properly
- [ ] Enable rate limiting
- [ ] Regular security updates and dependency audits
