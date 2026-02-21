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

# Authentication — see "Authentication Modes" section below
JWT_SECRET=your-secret-key-here
VITE_OAUTH_PORTAL_URL=https://oauth.example.com
VITE_APP_ID=your-app-id

# Development only — auto-authenticates as dev user (blocked in production)
# DEV_MODE=true

# Encryption (Required for production — used to encrypt provider secrets)
ENCRYPTION_KEY=your-32-byte-encryption-key

# Application
PORT=3000
NODE_ENV=production
VITE_APP_TITLE=MyNewAppV1
VITE_APP_LOGO=/logo.png

# Provider API Keys (Optional — auto-provisions providers on startup)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AI...

# Storage (Optional — defaults to local filesystem)
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

# Redis (Required for production multi-instance deployments)
# Without REDIS_URL, rate limiting uses in-memory storage (single-instance only).
# Multi-instance deployments MUST set REDIS_URL for distributed rate limiting.
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=info
```

## Installation

### 1. Clone and Install

```bash
git clone https://github.com/RachEma-ux/MyNewAp1Claude.git
cd MyNewAp1Claude
pnpm install
```

### 2. Database Setup

```bash
export DATABASE_URL=postgresql://user:password@localhost:5432/mynewapp
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

### Build Image

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

## Production — Reverse Proxy (Nginx)

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

---

## Health Check

```bash
curl http://localhost:3000/api/health
```

## Backup and Recovery

```bash
# Backup
pg_dump -U user mynewapp > backup_$(date +%Y%m%d).sql

# Restore
psql -U user mynewapp < backup_20260221.sql
```

## Authentication Modes

The application supports three authentication states:

| Mode | Configuration | Behavior |
|---|---|---|
| **DEV_MODE** | `DEV_MODE=true` | Auto-authenticates as dev user. **Blocked in production** — the server will refuse to start if `DEV_MODE=true` and `NODE_ENV=production`. Use for local development and CI only. |
| **OAuth** | `VITE_APP_ID` + `OAUTH_SERVER_URL` + `JWT_SECRET` set | Real authentication via external OAuth provider. Required for user-facing production deployments. |
| **Unconfigured** | Neither DEV_MODE nor OAuth env vars set | Only public (unauthenticated) endpoints work. Protected endpoints return 401. |

For development, set `DEV_MODE=true` in your `.env` file. For production, configure OAuth credentials.

## Rate Limiting

Rate limiting is enabled by default using in-memory storage. This is sufficient for single-instance deployments.

For **multi-instance production deployments**, set `REDIS_URL` to enable distributed rate limiting. Without Redis, each instance maintains its own rate limit counters independently, which can allow higher-than-intended request rates.

## Security Checklist

- [ ] Set `ENCRYPTION_KEY` in production (never use default dev key)
- [ ] Ensure `DEV_MODE` is NOT set in production environment
- [ ] Configure OAuth credentials for production authentication
- [ ] Set `REDIS_URL` for multi-instance rate limiting
- [ ] Enable HTTPS/TLS via reverse proxy
- [ ] Set strong database passwords
- [ ] Configure CORS properly
- [ ] No secrets in code or git history
- [ ] Database has backups enabled
- [ ] Regular dependency audits (`pnpm audit`)
