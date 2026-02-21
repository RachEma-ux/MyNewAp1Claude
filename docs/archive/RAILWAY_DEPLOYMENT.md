# Deploy to Railway - Mobile Guide

## Why Railway?
Railway is a good fit for this app because:
- Runs your Express server natively
- **FREE PostgreSQL database included!**
- Simple deployment from mobile
- Connect GitHub and go

---

## Step-by-Step Deployment (5 minutes)

### Step 1: Go to Railway
1. Open **railway.app** in your phone browser
2. Click "**Start a New Project**"
3. Sign in with **GitHub**

### Step 2: Deploy Your App
1. Click "**Deploy from GitHub repo**"
2. Select: `RachEma-ux/MyNewAp1Claude`
3. Railway will auto-detect it's a Node.js app

### Step 3: Add PostgreSQL Database
1. In your project, click "**+ New**"
2. Select "**Database**" > "**Add PostgreSQL**"
3. Railway automatically creates a database and sets `DATABASE_URL`

### Step 4: Add Environment Variables
Railway auto-sets DATABASE_URL, but you need to add:

1. Click on your **app service** (not the database)
2. Go to "**Variables**" tab
3. Add these:

```
JWT_SECRET = random-secret-key-12345
NODE_ENV = production
PORT = 3000
```

### Step 5: Deploy!
1. Railway automatically builds and deploys
2. Wait 2-3 minutes...
3. Click "**Settings**" > "**Generate Domain**"
4. You'll get a URL like: `your-app.up.railway.app`

### Step 6: Run Database Migrations
After first deploy, migrations should auto-run on startup. If not:
- Use the Railway CLI or Shell to run `pnpm run db:push`

---

## Done!

Your app is live at:
```
https://your-app-name.up.railway.app
```

---

## Free Tier Limits

Railway gives you **$5 credit per month** (free):
- Enough for ~500 hours of runtime
- 1GB database storage
- Perfect for personal projects

---

## Troubleshooting

**Build fails?**
- Check the build logs in Railway dashboard
- Make sure all dependencies are in package.json

**Database errors?**
- Railway auto-connects DATABASE_URL
- Migrations run automatically when app starts

**Can't access app?**
- Make sure you generated a domain in Settings
- Wait 30 seconds after deployment

---

## Why Railway for This App?

| Feature | Railway | Vercel |
|---------|---------|---------|
| Express servers | Yes | No (serverless only) |
| Included database | Free PostgreSQL | Need external |
| Easy mobile deploy | Super easy | Complex setup |
| Your app type | Perfect fit | Wrong tool |
