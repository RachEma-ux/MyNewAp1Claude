#!/usr/bin/env bash
#
# Staging connection — placeholder template.
#
# Replace every <…> placeholder with the real value from
# docs/deployment/STAGING_CONNECTION_DETAILS.md before running.
# Never commit a filled-in version of this script — it would
# leak host names, ports, and key paths.
#
# This script does not run anything by default; it just prints
# the command sequence so the operator can review and execute
# manually.

set -euo pipefail

cat <<'TEMPLATE'
# 1) SSH into the staging host
ssh <user>@<staging-host>
# Variants:
#   ssh -i <key-path> -p <port> <user>@<staging-host>
#   ssh -J <jump-user>@<jump-host> <user>@<staging-host>

# 2) On the staging host: sync the repo
cd <repo-path>
git checkout main
git pull --ff-only origin main

# 3) Source staging env (presence only — never echoed)
set -a
source <path-to-staging-env-file>
set +a

# 4) Run the preflight gate
pnpm run staging:preflight:gate
# exit 0 = ready  → resume PR 3
# exit 2 = BLOCKED → capture missing dep in STAGING_BLOCKER_REPORT.md, stop
# exit 1 = FAIL    → a service is reachable but unhealthy; fix and retry
TEMPLATE
