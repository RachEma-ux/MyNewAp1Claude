# 🚀 Deployment Guide - LLM Control Plane

## Overview

This guide covers deploying the complete LLM Control Plane implementation to Render.com.

**Branch:** `claude/evaluate-repo-7Aa4C`
**Status:** Ready for deployment
**Date:** 2026-01-08

---

## 📦 What's Being Deployed

### **Features Added:**
- ✅ LLM Dashboard - Statistics and activity feed
- ✅ LLM Control Plane - Admin interface for managing LLMs
- ✅ LLM Wizard - 3-step creation workflow with policy validation
- ✅ LLM Promotions - Approval workflow for environment promotions
- ✅ LLM Detail Page - Version history and promotion management
- ✅ Policy Validation Engine - OPA-style governance rules
- ✅ Agent Versioning - Snapshot-based agent version control

### **Database Changes:**
- 7 new tables added (see migration `0017_add_llm_control_plane.sql`)
- No existing tables modified
- All changes are additive and safe

### **Routes Added:**
- `/llm` - Dashboard
- `/llm/control-plane` - Admin interface
- `/llm/wizard` - LLM creation wizard
- `/llm/promotions` - Promotion management
- `/llm/:id` - LLM detail page

---

## ✅ Prerequisites

### **Required Environment Variables:**

The following environment variables MUST be set in Render:

```bash
# Database (REQUIRED)
DATABASE_URL=mysql://user:password@host:port/database

# Node Environment (REQUIRED)
NODE_ENV=production

# Optional: API Keys (if using cloud LLM providers)
ANTHROPIC_API_KEY=sk-...         # For Claude models
OPENAI_API_KEY=sk-...             # For GPT models
GOOGLE_API_KEY=...                # For Gemini models
```

### **Verify Environment Variables:**

1. Log in to Render Dashboard
2. Go to your web service
3. Click "Environment" tab
4. Verify `DATABASE_URL` is set correctly
5. Verify `NODE_ENV` is set to `production`

---

## 🔄 Deployment Steps

### **Option A: Merge to Main (Recommended)**

This option deploys via your main branch and triggers automatic deployment on Render.

#### **Step 1: Create Pull Request**

```bash
# If using GitHub/GitLab UI:
1. Go to your repository
2. Create a Pull Request from claude/evaluate-repo-7Aa4C → main
3. Title: "Add LLM Control Plane System"
4. Review the changes:
   - 9 files created/modified
   - ~4,090 lines added
   - 1 migration file (0017)
5. Merge the PR
```

#### **Step 2: Automatic Deployment**

Once merged, Render will automatically:
1. Detect the new commit on `main`
2. Pull the latest code
3. Run `pnpm install`
4. Run `pnpm run build` (which includes database migrations)
5. Start the server with `pnpm start`

#### **Step 3: Verify Deployment**

```bash
# Check Render Logs:
1. Go to Render Dashboard → Your Service → Logs
2. Look for:
   ✓ "Build successful"
   ✓ "Migration 0017 applied" (or similar)
   ✓ "Server listening on port..."
3. Verify no errors in logs
```

#### **Step 4: Manual Migration (If Needed)**

If migrations didn't run automatically:

```bash
# In Render Shell:
cd /opt/render/project/src
pnpm run db:push
```

Or via Render Dashboard:
1. Go to "Shell" tab
2. Run: `pnpm run db:push`
3. Wait for migrations to complete

---

### **Option B: Deploy from Feature Branch**

Deploy directly from `claude/evaluate-repo-7Aa4C` without merging.

#### **Step 1: Change Render Branch Setting**

```bash
# Via Render Dashboard:
1. Go to your web service
2. Click "Settings"
3. Find "Branch" setting
4. Change from "main" to "claude/evaluate-repo-7Aa4C"
5. Click "Save Changes"
```

#### **Step 2: Manual Deploy**

```bash
# Via Render Dashboard:
1. Go to "Manual Deploy" tab
2. Click "Deploy latest commit"
3. Select branch: claude/evaluate-repo-7Aa4C
4. Confirm deployment
```

#### **Step 3: Monitor Deployment**

Follow same verification steps as Option A (Step 3-4).

---

### **Option C: Local Testing First**

Test the deployment locally before pushing to production.

#### **Step 1: Set Up Local Environment**

```bash
# 1. Ensure you're on the correct branch
git checkout claude/evaluate-repo-7Aa4C
git pull origin claude/evaluate-repo-7Aa4C

# 2. Install dependencies (if not done)
pnpm install

# 3. Set up local DATABASE_URL
export DATABASE_URL="mysql://user:password@localhost:3306/mydb"

# 4. Run migrations
pnpm run db:push

# Expected output:
# > drizzle-kit generate && drizzle-kit migrate
# ✓ Migration 0017_add_llm_control_plane.sql applied
```

#### **Step 2: Build and Test**

```bash
# 1. Build the application
pnpm run build

# Expected output:
# vite build && esbuild...
# ✓ built in XXXms

# 2. Start the server
pnpm start

# Expected output:
# Server listening on port 3000...

# 3. Test in browser
# Navigate to http://localhost:3000/llm
# Verify all pages load correctly
```

#### **Step 3: Deploy to Render**

Once local testing passes, follow Option A or B above.

---

## 📋 Post-Deployment Checklist

### **1. Verify Application Health**

```bash
# Check Render Dashboard:
✓ Service status: "Live"
✓ Recent logs show no errors
✓ Build completed successfully
✓ Migrations applied
```

### **2. Test Core Functionality**

Navigate to your Render URL and test:

```bash
# Dashboard
https://your-app.onrender.com/llm
✓ Page loads
✓ Stats display (may show 0 if no LLMs created yet)
✓ Activity feed loads

# Control Plane
https://your-app.onrender.com/llm/control-plane
✓ Page loads
✓ Empty state shows "Create LLM" button

# Wizard
https://your-app.onrender.com/llm/wizard
✓ Step 1 (Identity) loads
✓ Can fill out form
✓ Can navigate to Step 2
✓ Can navigate to Step 3
✓ Policy validation button works

# Promotions
https://your-app.onrender.com/llm/promotions
✓ Page loads
✓ Empty state shows correctly
```

### **3. Create Test LLM**

```bash
# Via Wizard:
1. Go to /llm/wizard
2. Fill Step 1:
   - Name: test-executor
   - Role: executor
   - Description: Test LLM for verification
   - Owner Team: dev-team
3. Fill Step 2:
   - Runtime: Cloud
   - Provider: Anthropic (Claude)
   - Model Name: claude-sonnet-4-5-20250929
   - Temperature: 0.7
   - Max Tokens: 4096
4. Step 3:
   - Click "Validate Policy"
   - Verify: "Policy validation passed"
   - Click "Create LLM"
5. Verify:
   - Success toast appears
   - Redirected to /llm
   - New LLM shows in stats
```

### **4. Verify Database Tables**

```bash
# Via Render Shell or MySQL client:
mysql> USE your_database;
mysql> SHOW TABLES LIKE 'llm%';

# Expected output:
+---------------------------+
| Tables_in_db (llm%)       |
+---------------------------+
| llm_attestations          |
| llm_audit_events          |
| llm_drift_events          |
| llm_promotions            |
| llm_versions              |
| llms                      |
+---------------------------+

mysql> SELECT COUNT(*) FROM llms;
# Should show 1 if you created a test LLM

mysql> SELECT COUNT(*) FROM llm_versions;
# Should show 1 (version 1 in sandbox)

mysql> SELECT COUNT(*) FROM llm_audit_events;
# Should show 2+ (LLM created, version created events)
```

---

## 🐛 Troubleshooting

### **Issue: Migrations Not Applied**

**Symptoms:**
- Tables don't exist
- SQL errors: "Table 'llms' doesn't exist"

**Solution:**
```bash
# Via Render Shell:
cd /opt/render/project/src
pnpm run db:push

# Or manually:
DATABASE_URL="your-connection-string" pnpm drizzle-kit migrate
```

---

### **Issue: Build Fails**

**Symptoms:**
- Render shows "Build failed"
- Error: "Cannot find module..."

**Solution:**
```bash
# Check package.json scripts:
"build": "vite build && esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist"

# Verify all dependencies installed:
pnpm install --frozen-lockfile

# Check for TypeScript errors:
pnpm run check
```

---

### **Issue: Pages Return 404**

**Symptoms:**
- /llm returns 404
- Other new routes not found

**Solution:**
```bash
# Verify routes in App.tsx:
grep -A 5 "llm/wizard" client/src/App.tsx

# Verify build included client code:
ls dist/assets/*.js

# Check Render logs for routing errors:
# Look for "Cannot GET /llm"
```

---

### **Issue: Database Connection Error**

**Symptoms:**
- Error: "DATABASE_URL is required"
- Error: "Access denied for user..."

**Solution:**
```bash
# Verify DATABASE_URL format:
mysql://username:password@host:port/database

# Example:
mysql://admin:MyP@ssw0rd@db.example.com:3306/myapp_prod

# Test connection from Render Shell:
mysql -h db.example.com -u admin -p myapp_prod
```

---

### **Issue: Policy Validation Fails**

**Symptoms:**
- "Policy validation error" in wizard
- Server logs show policy engine errors

**Solution:**
```bash
# Check if policy engine file exists:
ls server/policies/llm-policy-engine.ts

# Verify it's included in build:
grep -r "LLMPolicyEngine" dist/

# Check for runtime errors in Render logs:
tail -f /var/log/render.log
```

---

## 🔐 Security Checklist

### **Before Production:**

✅ **Environment Variables:**
- [ ] `DATABASE_URL` uses strong password
- [ ] API keys are rotated and secure
- [ ] No secrets in code or git history

✅ **Database:**
- [ ] Database has backups enabled
- [ ] Database is not publicly accessible
- [ ] Connection uses SSL/TLS

✅ **Application:**
- [ ] Authentication is enabled
- [ ] User permissions are configured
- [ ] Rate limiting is active
- [ ] CORS is properly configured

---

## 📊 Monitoring

### **Key Metrics to Watch:**

```bash
# Render Dashboard:
- CPU usage
- Memory usage
- Response times
- Error rates

# Database:
- Connection count
- Query performance
- Table sizes (llm_audit_events will grow)

# Application Logs:
- LLM creation events
- Policy validation results
- Promotion approvals
- Error stack traces
```

### **Set Up Alerts:**

```bash
# Recommended Render Alerts:
1. Service down
2. High memory usage (>90%)
3. High CPU usage (>80%)
4. Build failures
5. Deployment failures
```

---

## 🔄 Rollback Procedure

### **If Deployment Fails:**

#### **Option 1: Rollback via Render**

```bash
# Via Render Dashboard:
1. Go to "Events" tab
2. Find previous successful deployment
3. Click "Rollback to this deploy"
4. Confirm rollback
```

#### **Option 2: Revert Git Changes**

```bash
# Revert merge commit:
git revert <merge-commit-sha>
git push origin main

# Or reset branch:
git reset --hard HEAD~1
git push --force origin main
```

#### **Option 3: Rollback Migrations**

```bash
# CAUTION: Only if tables were created but app is broken

# Via Render Shell:
mysql -h host -u user -p database

mysql> DROP TABLE IF EXISTS llm_audit_events;
mysql> DROP TABLE IF EXISTS llm_drift_events;
mysql> DROP TABLE IF EXISTS llm_attestations;
mysql> DROP TABLE IF EXISTS llm_promotions;
mysql> DROP TABLE IF EXISTS llm_versions;
mysql> DROP TABLE IF EXISTS llms;
mysql> DROP TABLE IF EXISTS agentVersions;
```

---

## 📞 Support

### **If You Encounter Issues:**

1. **Check Render Logs:**
   - Dashboard → Logs tab
   - Look for errors in last 100 lines

2. **Verify Environment:**
   - Settings → Environment tab
   - Ensure all required vars are set

3. **Test Database Connection:**
   - Shell tab → `mysql -h...`
   - Run: `SHOW TABLES;`

4. **Review Commits:**
   - Check git log: `git log --oneline -10`
   - Verify branch: `git branch -vv`

---

## ✅ Success Criteria

Deployment is successful when:

- ✅ Render shows "Live" status
- ✅ All 7 new tables exist in database
- ✅ `/llm` dashboard loads without errors
- ✅ Can create a test LLM via wizard
- ✅ Policy validation works
- ✅ No errors in Render logs
- ✅ All routes return 200 status

---

## 📚 Additional Resources

- **Implementation Docs:** `LLM_WIZARD_IMPLEMENTATION.md`
- **Repository Evaluation:** `REPOSITORY_EVALUATION.md`
- **Migration File:** `drizzle/0017_add_llm_control_plane.sql`
- **Policy Engine:** `server/policies/llm-policy-engine.ts`
- **API Router:** `server/routers/llm.ts`

---

**Last Updated:** 2026-01-08
**Version:** 1.0
**Author:** Claude
**Status:** Production Ready ✅
