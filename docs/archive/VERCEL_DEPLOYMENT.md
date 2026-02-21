# Deploy to Vercel - Mobile Guide

## What You'll Need

1. **GitHub account** (to store your code)
2. **Vercel account** (free - sign up at vercel.com)
3. **PostgreSQL Database** (we'll use a free cloud database)

---

## Step 1: Set Up Database (Required First!)

Your app needs PostgreSQL. Here are free options:

### Option A: Neon (Recommended - Free Tier)
1. Go to **neon.tech** on your phone browser
2. Sign up for free
3. Create new project
4. Copy the connection string
5. It looks like: `postgresql://username:password@host/dbname`

### Option B: Supabase (Also Free)
1. Go to **supabase.com**
2. Sign up and create new project
3. Go to Settings > Database > Connection string
4. Copy the `DATABASE_URL`

### Option C: Railway
1. Go to **railway.app**
2. Sign up and create new project
3. Add PostgreSQL database
4. Copy the `DATABASE_URL` from settings

**Save this DATABASE_URL** - you'll need it later!

---

## Step 2: Push Code to GitHub

```bash
git add .
git commit -m "Ready for Vercel deployment"
git push
```

---

## Step 3: Deploy to Vercel

1. Go to **vercel.com** in your browser
2. Sign up/login with GitHub
3. Click "**New Project**"
4. Select your `MyNewAp1Claude` repository
5. Click "**Import**"

### Configure Environment Variables:

```
DATABASE_URL = [paste your PostgreSQL URL from Step 1]
JWT_SECRET = your-secret-key-here-make-it-random
NODE_ENV = production
```

6. Click "**Deploy**"
7. Wait 2-3 minutes...

---

## Step 4: Access Your App!

Once deployed, Vercel will give you a URL like:
```
https://my-new-ap1-claude.vercel.app
```

---

## Important Notes

- **Database Migrations**: After first deployment, you may need to run `pnpm db:push` once
- **Free Limits**: Neon/Supabase free tier is generous for personal projects
- Vercel: 100GB bandwidth/month, unlimited deployments

---

## Troubleshooting

**"Build failed"**: Check Vercel build logs - usually missing environment variables

**"Database connection error"**: Double-check your DATABASE_URL in Vercel settings

**"Page not loading"**: Wait 30 seconds after deployment, then try again
