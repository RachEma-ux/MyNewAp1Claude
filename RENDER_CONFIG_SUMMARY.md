# Render Configuration Summary

## 📋 Configuration Status

### **Configuration Files:**
- ✅ `render.yaml` - Created (auto-deployment config)
- ✅ `DEPLOYMENT_GUIDE.md` - Created (complete deployment instructions)
- ✅ `package.json` - Verified (correct build/start scripts)
- ✅ `drizzle.config.ts` - Verified (database config)

### **Build Configuration:**
```json
{
  "build": "vite build && esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist",
  "start": "NODE_ENV=production node dist/index.js",
  "db:push": "drizzle-kit generate && drizzle-kit migrate"
}
```

### **Render Service Type:**
- **Type:** Web Service
- **Environment:** Node.js
- **Package Manager:** pnpm (v10.4.1)
- **Build Command:** `pnpm install --frozen-lockfile && pnpm run build && pnpm run db:push`
- **Start Command:** `pnpm start`

---

## 🔐 Required Environment Variables

### **1. DATABASE_URL** (REQUIRED)
MySQL connection string for your database.

**Format:**
```
mysql://username:password@host:port/database
```

**Example:**
```
mysql://admin:MySecureP@ssw0rd@mydatabase.render.com:3306/mynewap1claude_prod
```

**Set in Render:**
1. Go to Dashboard → Your Service → Environment
2. Click "Add Environment Variable"
3. Key: `DATABASE_URL`
4. Value: Your MySQL connection string
5. Click "Save Changes"

### **2. NODE_ENV** (REQUIRED)
Node environment setting.

**Value:** `production`

**Set in Render:**
- Usually auto-set by `render.yaml`
- Verify it's set to `production`

### **3. Optional API Keys**
Only required if using cloud LLM providers.

```bash
# Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI GPT
OPENAI_API_KEY=sk-...

# Google Gemini
GOOGLE_API_KEY=...
```

---

## 🚀 Deployment Methods

### **Method 1: Automatic (via render.yaml)**

1. **Push render.yaml to repository:**
   ```bash
   git add render.yaml
   git commit -m "Add Render deployment configuration"
   git push origin main
   ```

2. **Connect to Render:**
   - Go to https://dashboard.render.com
   - Click "New +" → "Blueprint"
   - Connect your GitHub/GitLab repository
   - Render will auto-detect `render.yaml`
   - Click "Apply"

3. **Set Environment Variables:**
   - Dashboard → Your Service → Environment
   - Add `DATABASE_URL` (see above)
   - Add optional API keys

4. **Deploy:**
   - Render will automatically deploy
   - Future git pushes to `main` will auto-deploy

### **Method 2: Manual Dashboard Setup**

1. **Create Web Service:**
   - Go to https://dashboard.render.com
   - Click "New +" → "Web Service"
   - Connect repository

2. **Configure:**
   ```
   Name: mynewap1claude
   Environment: Node
   Region: Oregon (or your choice)
   Branch: main
   Build Command: pnpm install --frozen-lockfile && pnpm run build && pnpm run db:push
   Start Command: pnpm start
   ```

3. **Set Environment Variables** (same as Method 1, step 3)

4. **Deploy:** Click "Create Web Service"

### **Method 3: Deploy from Feature Branch**

Deploy directly from `claude/evaluate-repo-7Aa4C` without merging.

1. **Change Branch Setting:**
   - Dashboard → Settings
   - Branch: `claude/evaluate-repo-7Aa4C`
   - Save Changes

2. **Manual Deploy:**
   - Dashboard → Manual Deploy
   - Deploy latest commit

---

## 📊 Database Migration Strategy

### **During Build (Recommended):**

The build command includes `pnpm run db:push`:
```bash
pnpm install --frozen-lockfile && pnpm run build && pnpm run db:push
```

This will:
1. Install dependencies
2. Build the application
3. Generate migration files (if needed)
4. Apply migration 0017_add_llm_control_plane.sql
5. Create 7 new tables

### **Manual Migration (If Build Doesn't Run It):**

```bash
# Via Render Shell:
cd /opt/render/project/src
pnpm run db:push

# Or connect to database directly:
mysql -h host -u user -p database < drizzle/0017_add_llm_control_plane.sql
```

### **Verify Migrations Applied:**

```bash
# Via Render Shell:
mysql -h host -u user -p database

mysql> SHOW TABLES LIKE 'llm%';
# Should show 6 tables: llms, llm_versions, llm_promotions,
# llm_attestations, llm_drift_events, llm_audit_events

mysql> SHOW TABLES LIKE 'agent%';
# Should show agentVersions table
```

---

## 🔍 Health Check

### **Endpoint:** `/`
- Render will ping this endpoint to verify app is running
- Should return HTTP 200 status

### **Custom Health Check (Optional):**

Add to `server/_core/index.ts`:
```typescript
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    database: db ? 'connected' : 'disconnected'
  });
});
```

Then update `render.yaml`:
```yaml
healthCheckPath: /health
```

---

## 📈 Monitoring & Logs

### **Access Logs:**
- Dashboard → Your Service → Logs
- Real-time log streaming
- Filter by severity (info, warn, error)

### **Key Log Messages to Watch:**
```bash
# Success:
✓ Server listening on port 10000
✓ Database connected
✓ Migration 0017 applied

# Warnings:
⚠ DATABASE_URL not set
⚠ Migration already applied

# Errors:
✗ Database connection failed
✗ Table 'llms' doesn't exist
✗ Build failed
```

### **Set Up Alerts:**

Dashboard → Settings → Notifications:
- [ ] Build failures
- [ ] Deploy failures
- [ ] Service down
- [ ] High CPU/Memory usage

---

## 🐛 Common Issues & Solutions

### **Issue: "DATABASE_URL is required"**

**Cause:** Environment variable not set

**Solution:**
```bash
1. Dashboard → Environment
2. Add: DATABASE_URL=mysql://...
3. Save Changes
4. Redeploy
```

### **Issue: "Migration 0017 not applied"**

**Cause:** Build command didn't include db:push

**Solution:**
```bash
# Via Render Shell:
pnpm run db:push

# Or update build command:
pnpm install && pnpm run build && pnpm run db:push
```

### **Issue: "pnpm: command not found"**

**Cause:** Render using npm instead of pnpm

**Solution:**
```bash
# Update render.yaml or dashboard settings:
Build Command: corepack enable && corepack prepare pnpm@latest --activate && pnpm install && pnpm run build
```

### **Issue: Tables already exist**

**Cause:** Migration 0017 already applied

**Solution:**
```bash
# This is OK! Migration is idempotent.
# Verify tables exist:
mysql> SHOW TABLES;

# If tables DON'T exist but migration says "already applied":
# Re-run migration:
pnpm run db:push --force
```

---

## ✅ Pre-Deployment Checklist

Before deploying to production:

- [ ] `DATABASE_URL` is set in Render
- [ ] Database is accessible from Render's IP range
- [ ] `NODE_ENV=production` is set
- [ ] API keys are set (if needed)
- [ ] `render.yaml` is committed to repository
- [ ] Migration file `0017_add_llm_control_plane.sql` is committed
- [ ] Local testing passed (optional but recommended)
- [ ] Backup of existing database (if applicable)

---

## 🚀 Quick Start Command Summary

### **For First-Time Deployment:**

```bash
# 1. Commit deployment files
git add render.yaml DEPLOYMENT_GUIDE.md RENDER_CONFIG_SUMMARY.md drizzle/0017_add_llm_control_plane.sql
git commit -m "Add Render deployment configuration and migrations"
git push origin main

# 2. Set up on Render (via Dashboard)
# - Connect repository
# - Set DATABASE_URL
# - Deploy

# 3. Verify
# - Check logs for successful deployment
# - Visit https://your-app.onrender.com/llm
# - Create test LLM via wizard
```

### **For Subsequent Deployments:**

```bash
# Just push to main:
git push origin main

# Render will automatically:
# - Pull latest code
# - Run build (includes migrations)
# - Restart service
```

---

## 📞 Next Steps

1. **Review:** `DEPLOYMENT_GUIDE.md` for detailed instructions
2. **Deploy:** Choose deployment method (auto/manual/branch)
3. **Verify:** Follow post-deployment checklist
4. **Monitor:** Set up alerts and check logs
5. **Test:** Create test LLM and verify all features work

---

**Status:** Ready for Deployment ✅
**Last Updated:** 2026-01-08
**Configuration Version:** 1.0
