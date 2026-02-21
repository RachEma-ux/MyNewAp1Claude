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
NODE_ENV=production
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

## Render

### Quick Start

1. Go to **render.com**, sign up with GitHub
2. Click **New+ > Web Service**, select `RachEma-ux/MyNewAp1Claude`
3. Render auto-fills from `render.yaml`:
   - **Build:** `pnpm install && pnpm build`
   - **Start:** `pnpm start`
4. Add a free PostgreSQL database — Render sets `DATABASE_URL` automatically
5. Deploy (first build takes 3–5 min)

### render.yaml Blueprint

Connect via **Dashboard > New+ > Blueprint** to auto-deploy from `render.yaml`.

### Manual Dashboard Setup

```
Name: mynewap1claude
Environment: Node
Branch: main
Build Command: pnpm install --frozen-lockfile && pnpm run build && pnpm run db:push
Start Command: pnpm start
```

### Render Free Tier

- 750 hours/month, auto-sleeps after 15 min inactivity
- Free PostgreSQL for 90 days
- 100 GB bandwidth/month

### Render Troubleshooting

**ELIFECYCLE build error (OOM):**
- Render free tier has 512 MB RAM; Vite build may exceed it
- Disable sourcemaps in `vite.config.ts` (`sourcemap: false`)
- Limit parallel file ops (`maxParallelFileOps: 2`)
- Target `es2020` with esbuild minifier
- If builds still fail, upgrade to Starter plan ($7/mo)

**Migrations not applied:** Run `pnpm run db:push` in Render Shell.

**Rollback:** Go to Events tab > click "Rollback to this deploy" on a previous successful deployment.

---

## Railway

### Quick Start

1. Go to **railway.app**, sign in with GitHub
2. Click **Deploy from GitHub repo**, select `RachEma-ux/MyNewAp1Claude`
3. Add PostgreSQL: click **+ New > Database > Add PostgreSQL** (free, auto-sets `DATABASE_URL`)
4. Add env vars: `JWT_SECRET`, `NODE_ENV=production`, `PORT=3000`
5. Click **Settings > Generate Domain** — get `your-app.up.railway.app`

### Railway Free Tier

- $5 credit/month (~500 hours runtime)
- 1 GB database storage

### Railway Troubleshooting

**Build fails?** Check build logs in Railway dashboard.

**Database errors?** Railway auto-connects `DATABASE_URL`; migrations run on startup.

---

## Vercel

### Quick Start

1. Provision an external PostgreSQL database (Neon, Supabase, or Railway)
2. Go to **vercel.com**, sign in with GitHub
3. Click **New Project**, import `MyNewAp1Claude`
4. Set env vars: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`
5. Deploy

### External Database Options

| Provider  | Free Tier                     |
|-----------|-------------------------------|
| Neon      | 512 MB storage, branching     |
| Supabase  | 500 MB, auth included         |
| Railway   | $5/mo credit                  |

### Vercel Notes

- Vercel is serverless — the app uses a `vercel-build` script
- 100 GB bandwidth/month on free tier
- Run `pnpm db:push` once after first deployment for migrations

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

## Security Checklist

- [ ] Set `ENCRYPTION_KEY` in production (never use default dev key)
- [ ] Enable HTTPS/TLS via reverse proxy
- [ ] Set strong database passwords
- [ ] Configure CORS properly
- [ ] Enable rate limiting
- [ ] No secrets in code or git history
- [ ] Database has backups enabled
- [ ] Regular dependency audits (`pnpm audit`)
