#!/bin/bash
cd /data/data/com.termux/files/home/MyNewAp1Claude
export TMPDIR="$HOME/tmp"
export DATABASE_URL="postgresql://u0_a358@localhost:5432/mynewap1claude"
export OAUTH_SERVER_URL="http://localhost:4000"
export DEV_MODE="true"
export NODE_ENV="development"
mkdir -p "$TMPDIR"
echo "Starting server..."
node --import tsx server/_core/index.ts
