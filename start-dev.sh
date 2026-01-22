#!/bin/bash
cd /data/data/com.termux/files/home/MyNewAp1Claude
export DATABASE_URL="postgresql://u0_a358@localhost:5432/mynewap1claude"
export OAUTH_SERVER_URL="http://localhost:4000"
export DEV_MODE="true"
export NODE_ENV="development"
echo "DATABASE_URL is: $DATABASE_URL"
node -e "console.log('Node sees DATABASE_URL:', process.env.DATABASE_URL)"
./node_modules/.bin/tsx watch server/_core/index.ts
