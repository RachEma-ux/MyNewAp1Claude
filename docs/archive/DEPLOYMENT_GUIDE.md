# Deployment Guide - LLM Control Plane

## Overview

This guide covers deploying the LLM Control Plane.

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

---

## Deployment Steps

### Option A: Merge to Main (Recommended)

#### Step 1: Create Pull Request

1. Go to your repository
2. Create a Pull Request to `main`
3. Review the changes
4. Merge the PR

#### Step 2: Build and Start

```bash
pnpm install
pnpm run build
pnpm start
```

#### Step 3: Run Migrations (If Needed)

```bash
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
curl https://your-app.example.com/api/health
```

### 2. Test Core Functionality

- `/llm` - Dashboard loads, stats display
- `/llm/control-plane` - Page loads, empty state shows "Create LLM" button
- `/llm/wizard` - All 3 steps work, policy validation works
- `/llm/promotions` - Page loads

### 3. Verify Database Tables

```bash
psql $DATABASE_URL -c "\dt llm*"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM llms"
```

---

## Troubleshooting

### Issue: Migrations Not Applied

**Symptoms:** Tables don't exist, SQL errors

**Solution:**
```bash
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

### Option 1: Revert Git Changes

```bash
git revert <merge-commit-sha>
git push origin main
```

### Option 2: Rollback Migrations

```bash
# Via psql:
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
