# Staging Preflight Report

**Generated:** 2026-05-03T15:13:20.592Z
**Verdict:** BLOCKED
**Mode:** default

## Required infra (foundation gate)

- [BLOCKED] DATABASE_URL (mynewap1claude staging DSN)
- [BLOCKED] OPA_URL (real endpoint, not opa.example.com placeholder)
- [BLOCKED] ENCRYPTION_KEY
- [BLOCKED] SECRETS_ENCRYPTION_KEY
- [BLOCKED] COOKIE_SECRET
- [BLOCKED] JWT_SECRET

## Extended required env

- [BLOCKED] STAGING_APP_URL (app)
- [BLOCKED] DATABASE_URL_MYNEWAP1CLAUDE (db)
- [BLOCKED] DATABASE_URL_ASDB (db)
- [BLOCKED] DATABASE_URL_RAGDB (db)
- [BLOCKED] DATABASE_URL_WFDB (db)
- [BLOCKED] SANDBOX_WF_WORKER_URL (worker)
- [BLOCKED] KGRA_SERVICE_URL (worker)

## URL probes

- [skipped] STAGING_APP_URL
- [skipped] OPA_URL
- [skipped] GRAPHRAG_WORKER_URL
- [skipped] DATA_ACQUISITION_WORKER_URL
- [skipped] EXTERNAL_ORCHESTRATOR_URL
- [skipped] SANDBOX_WF_WORKER_URL
- [skipped] KGRA_SERVICE_URL

## Browser tooling

- [BLOCKED] playwright
- [BLOCKED] chromium-browser

## Connectors

- [BLOCKED] github — missing: GITHUB_APP_ID, GITHUB_PRIVATE_KEY
- [BLOCKED] s3 — missing: S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
- [BLOCKED] gdrive — missing: GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET
