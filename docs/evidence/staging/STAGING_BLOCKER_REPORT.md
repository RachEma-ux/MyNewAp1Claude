# Staging Blocker Report

**Generated:** 2026-05-03T15:13:20.592Z
**Verdict:** BLOCKED

## Missing dependencies

- DATABASE_URL
- OPA_URL
- ENCRYPTION_KEY
- SECRETS_ENCRYPTION_KEY
- COOKIE_SECRET
- JWT_SECRET
- STAGING_APP_URL
- DATABASE_URL_MYNEWAP1CLAUDE
- DATABASE_URL_ASDB
- DATABASE_URL_RAGDB
- DATABASE_URL_WFDB
- SANDBOX_WF_WORKER_URL
- KGRA_SERVICE_URL

## Missing tooling

- playwright
- chromium-browser

## What this blocks

- PR 3 — Phase 3 DB isolation evidence
- PR 4 — Phase 4 worker runtime verification
- PR 5 — Phase 5 connector verification
- PR 6 — Phase 8 UI smoke
- PR 7 — Phase 9 workflow replay
- PR 8 — Phase 10 E2E sync
- PR 9 — Phase 11 Security/RBAC
- PR 10 — Final readiness rerun (downstream)

## Reproduction

```bash
pnpm run staging:preflight:gate; echo "exit=$?"
```
