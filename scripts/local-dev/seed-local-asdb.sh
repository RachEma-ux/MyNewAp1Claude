#!/usr/bin/env bash
#
# seed-local-asdb.sh — single-shot local ASDB seed wrapper.
#
# Runs the documented sequence in
#   docs/operations/local-development-termux-asdb.md §2
# so a developer running integration tests on a Termux device (or any
# environment whose default Postgres role is not `root`) can:
#
#   1. Set DATABASE_URL_ASDB to the working role+socket form
#   2. Apply the Drizzle schema
#   3. Seed provider connections from env
#   4. Seed golden questions for Phase 22/23-touching suites
#
# This is local-developer convenience only. CI provisions the schema
# and seeds via the workflow steps in run-tests.yml.
#
# Usage:
#   PGUSER=u0_a296 ./scripts/local-dev/seed-local-asdb.sh
#   # or supply DATABASE_URL_ASDB explicitly:
#   DATABASE_URL_ASDB="postgresql://u0_a296@/asdb?host=/data/data/com.termux/files/usr/tmp" \
#     ./scripts/local-dev/seed-local-asdb.sh
#
# Idempotent: each underlying step is idempotent (drizzle-kit push --force,
# provider seed merges on conflict, golden-questions seed upserts).

set -euo pipefail

if [[ -z "${DATABASE_URL_ASDB:-}" ]]; then
  if [[ -n "${PGUSER:-}" ]]; then
    DATABASE_URL_ASDB="postgresql://${PGUSER}@/asdb?host=/data/data/com.termux/files/usr/tmp"
    export DATABASE_URL_ASDB
    echo "[seed-local-asdb] DATABASE_URL_ASDB derived from PGUSER=${PGUSER}"
  else
    echo "[seed-local-asdb] ERROR: neither DATABASE_URL_ASDB nor PGUSER is set." >&2
    echo "[seed-local-asdb] See docs/operations/local-development-termux-asdb.md §1." >&2
    exit 2
  fi
fi

echo "[seed-local-asdb] 1/3 Applying Drizzle schema (drizzle-kit push --force)..."
npx drizzle-kit push --force

echo "[seed-local-asdb] 2/3 Seeding provider connections from env..."
pnpm tsx scripts/provider-connections/seed-from-env.ts

echo "[seed-local-asdb] 3/3 Seeding golden questions..."
if [[ -f scripts/agent-studio/seed-golden-questions.ts ]]; then
  pnpm tsx scripts/agent-studio/seed-golden-questions.ts
else
  echo "[seed-local-asdb] (skipped: scripts/agent-studio/seed-golden-questions.ts not present)"
fi

echo "[seed-local-asdb] OK — local ASDB seeded against ${DATABASE_URL_ASDB%%\?*}"
