# Deployment Guide - LLM Control Plane

## Overview

This guide covers deploying the LLM Control Plane to Render.com.

**Status:** Ready for deployment

---

## What's Being Deployed

### Features:
- LLM Dashboard - Statistics and activity feed
- LLM Control Plane - Admin interface for managing LLMs
- LLM Wizard - 3-step creation workflow with policy validation
- LLM Promotions - Approval workflow for environment promotions
- LLM Detail Page - Version history and promotion management
- Policy Validation Engine - OPA-style governance rules
- Agent Versioning - Snapshot-based agent version control

### Database Changes:
- New tables added via Drizzle migrations
- No existing tables modified
- All changes are additive and safe

### Routes Added:
- `/llm` - Dashboard
- `/llm/control-plane` - Admin interface
- `/llm/wizard` - LLM creation wizard
- `/llm/promotions` - Promotion management
- `/llm/:id` - LLM detail page

---

## Prerequisites

### Required Environment Variables:

```bash
# Database (REQUIRED) — PostgreSQL connection string
DATABASE_URL=postgresql://user:password@host:5432/database

# Node Environment (REQUIRED)
NODE_ENV=production

# Optional: API Keys (if using cloud LLM providers)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
```

### Verify Environment Variables:

1. Log in to Render Dashboard
2. Go to your web service
3. Click "Environment" tab
4. Verify `DATABASE_URL` is set correctly
5. Verify `NODE_ENV` is set to `production`

---

## Deployment Steps

### Option A: Merge to Main (Recommended)

#### Step 1: Create Pull Request

1. Go to your repository
2. Create a Pull Request to `main`
3. Review the changes
4. Merge the PR

#### Step 2: Automatic Deployment

Once merged, Render will automatically:
1. Detect the new commit on `main`
2. Pull the latest code
3. Run `pnpm install`
4. Run `pnpm run build` (which includes database migrations)
5. Start the server with `pnpm start`

#### Step 3: Verify Deployment

Check Render Logs for:
- "Build successful"
- "Migrations applied"
- "Server listening on port..."

#### Step 4: Manual Migration (If Needed)

```bash
# In Render Shell:
cd /opt/render/project/src
pnpm run db:push
```

---

### Option B: Local Testing First

```bash
# 1. Install dependencies
pnpm install

# 2. Set up DATABASE_URL
export DATABASE_URL="postgresql://user:password@localhost:5432/mydb"

# 3. Run migrations
pnpm run db:push

# 4. Build and test
pnpm run build
pnpm start

# 5. Test in browser at http://localhost:3000/llm
```

---

## Post-Deployment Checklist

### 1. Verify Application Health

```bash
curl https://your-app.onrender.com/api/health
```

### 2. Test Core Functionality

- `/llm` - Dashboard loads, stats display
- `/llm/control-plane` - Page loads, empty state shows "Create LLM" button
- `/llm/wizard` - All 3 steps work, policy validation works
- `/llm/promotions` - Page loads

### 3. Verify Database Tables

```bash
# Via Render Shell or psql:
psql $DATABASE_URL -c "\dt llm*"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM llms"
```

---

## Troubleshooting

### Issue: Migrations Not Applied

**Symptoms:** Tables don't exist, SQL errors

**Solution:**
```bash
# Via Render Shell:
cd /opt/render/project/src
pnpm run db:push
```

### Issue: Build Fails

**Solution:**
```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run build
```

### Issue: Database Connection Error

**Solution:**
```bash
# Verify DATABASE_URL format:
postgresql://username:password@host:5432/database

# Test connection:
psql $DATABASE_URL -c "SELECT 1"
```

---

## Rollback Procedure

### Option 1: Rollback via Render

1. Go to "Events" tab
2. Find previous successful deployment
3. Click "Rollback to this deploy"

### Option 2: Revert Git Changes

```bash
git revert <merge-commit-sha>
git push origin main
```

### Option 3: Rollback Migrations

```bash
# Via Render Shell / psql:
psql $DATABASE_URL
# DROP TABLE IF EXISTS ... (as needed)
```

---

## Security Checklist

- [ ] `DATABASE_URL` uses strong password
- [ ] API keys are rotated and secure
- [ ] No secrets in code or git history
- [ ] Database has backups enabled
- [ ] Database is not publicly accessible
- [ ] Connection uses SSL/TLS
- [ ] Authentication is enabled
- [ ] Rate limiting is active
- [ ] CORS is properly configured
