# Render Configuration Summary

## Configuration Status

### Configuration Files:
- `render.yaml` - Auto-deployment config
- `DEPLOYMENT_GUIDE.md` - Complete deployment instructions
- `package.json` - Verified (correct build/start scripts)
- `drizzle.config.ts` - Verified (PostgreSQL database config)

### Build Configuration:
```json
{
  "build": "vite build && esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist",
  "start": "NODE_ENV=production node dist/index.js",
  "db:push": "drizzle-kit generate && drizzle-kit migrate"
}
```

### Render Service Type:
- **Type:** Web Service
- **Environment:** Node.js
- **Package Manager:** pnpm
- **Build Command:** `pnpm install --frozen-lockfile && pnpm run build && pnpm run db:push`
- **Start Command:** `pnpm start`

---

## Required Environment Variables

### 1. DATABASE_URL (REQUIRED)
PostgreSQL connection string for your database.

**Format:**
```
postgresql://username:password@host:5432/database
```

**Example:**
```
postgresql://admin:MySecureP@ssw0rd@mydatabase.render.com:5432/mynewap1claude_prod
```

**Set in Render:**
1. Go to Dashboard > Your Service > Environment
2. Click "Add Environment Variable"
3. Key: `DATABASE_URL`
4. Value: Your PostgreSQL connection string
5. Click "Save Changes"

### 2. NODE_ENV (REQUIRED)
**Value:** `production`

### 3. Optional API Keys
```bash
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
```

---

## Deployment Methods

### Method 1: Automatic (via render.yaml)

1. Push render.yaml to repository
2. Connect to Render (Dashboard > New+ > Blueprint)
3. Set environment variables (DATABASE_URL)
4. Render will automatically deploy

### Method 2: Manual Dashboard Setup

1. Create Web Service (Dashboard > New+ > Web Service)
2. Configure:
   ```
   Name: mynewap1claude
   Environment: Node
   Branch: main
   Build Command: pnpm install --frozen-lockfile && pnpm run build && pnpm run db:push
   Start Command: pnpm start
   ```
3. Set environment variables
4. Click "Create Web Service"

---

## Database Migration Strategy

### During Build (Recommended):

```bash
pnpm install --frozen-lockfile && pnpm run build && pnpm run db:push
```

### Manual Migration:

```bash
# Via Render Shell:
cd /opt/render/project/src
pnpm run db:push

# Or via psql:
psql $DATABASE_URL -f drizzle/migrations/0017_add_llm_control_plane.sql
```

### Verify Migrations:

```bash
psql $DATABASE_URL -c "\dt"
# Should show all application tables
```

---

## Health Check

**Endpoint:** `/api/health`

---

## Common Issues & Solutions

### "DATABASE_URL is required"
Set `DATABASE_URL=postgresql://...` in Render environment.

### "Migration not applied"
Run `pnpm run db:push` via Render Shell.

### "pnpm: command not found"
Update build command to include corepack enable.

---

**Status:** Ready for Deployment
