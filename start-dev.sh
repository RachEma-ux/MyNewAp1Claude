#!/bin/bash
export NODE_ENV=development
export TMPDIR="$HOME/tmp"
mkdir -p "$TMPDIR"
npx tsx server/_core/index.ts
