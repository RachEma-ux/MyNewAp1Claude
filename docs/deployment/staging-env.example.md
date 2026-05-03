# Staging Environment Variables (template)

This file is the **structural template** for the staging
environment. It is committed to the repo so deployments have a
canonical reference and reviewers can spot drift.

The actual values live in your secrets manager (Vault / AWS SM /
1Password infra vault / equivalent). **Never commit real
credentials, secrets, or tokens to this repo.**

To consume this template, copy it to `.env.staging` (gitignored)
or render it via your secret-injection tooling, populate the
right-hand sides, then export it before running
`pnpm run test:integration:staging` or starting the app in
production mode.

---

## Required for `pnpm run test:integration:staging`

The runner at `scripts/run-staging-integration-tests.ts` asserts
every variable in this block. Missing any one of them produces
exit code `2` (`BLOCKED`).

```bash
# --- Primary platform DB ----------------------------------------
# Used by all non-modular tables (users, workspaces, governance,
# audit, agents, conversations, …). The control-plane DB.
DATABASE_URL=postgres://USER:PASS@HOST:5432/mynewap1claude

# --- OPA policy engine ------------------------------------------
# Real OPA endpoint (centrally hosted or local sidecar).
# The placeholder host `opa.example.com` is rejected.
OPA_URL=https://opa.staging.internal/v1/data
# Optional: OPA_BASE_URL is accepted as a legacy alias of OPA_URL.

# --- Production secrets -----------------------------------------
# Source these from the secrets manager — never commit values.
ENCRYPTION_KEY=
SECRETS_ENCRYPTION_KEY=
COOKIE_SECRET=
JWT_SECRET=
```

## Required when staging mirrors production

```bash
# --- Per-module owned databases ---------------------------------
# Each defaults to DATABASE_URL when unset. Set the dedicated
# DSN if you want isolation between control plane and module data.
DATABASE_URL_ASDB=postgres://USER:PASS@HOST:5432/asdb
DATABASE_URL_RAGDB=postgres://USER:PASS@HOST:5432/ragdb
DATABASE_URL_WFDB=postgres://USER:PASS@HOST:5432/wfdb

# Optional module-level overrides (also default to DATABASE_URL):
DATABASE_URL_CODEDB=
DATABASE_URL_PRMDB=
DATABASE_URL_PSMDB=
DATABASE_URL_PMDB=
DATABASE_URL_COMMUNICATIONDB=
DATABASE_URL_DATA_ANALYSISDB=
DATABASE_URL_DW=

# --- OAuth (control-plane sign-in) ------------------------------
# Without these the app boots in demo mode with auth bypass.
VITE_APP_ID=
APP_ID=
OAUTH_SERVER_URL=

# --- Worker queue / Redis ---------------------------------------
# REDIS_URL is required by production-hardening for distributed
# rate limiting. WORKER_QUEUE_URL is accepted as an alternative
# signal that workers are reachable.
REDIS_URL=redis://USER:PASS@HOST:6379/0
WORKER_QUEUE_URL=

# --- Component workers ------------------------------------------
DATA_ACQUISITION_WORKER_URL=http://data-acquisition.staging.internal:8485
GRAPHRAG_WORKER_URL=http://graphrag.staging.internal:8484

# --- External agent orchestrator (optional) ---------------------
# Setting this forces the external orchestrator and external
# runtime test suites to run as real assertions in staging mode.
EXTERNAL_ORCHESTRATOR_URL=
```

## Optional / feature-scoped

```bash
# --- OPA bundle signing -----------------------------------------
OPA_AUTH_TOKEN=
OPA_COSIGN_PUBLIC_KEY=

# --- Object storage (uploads, evidence bundles) -----------------
S3_ENDPOINT=
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=

# --- LLM providers (set only the ones you actually use) ---------
OPENAI_API_KEY=
OLLAMA_BASE_URL=
OPENLLM_AGENT_URL=

# --- OmniRAG (optional alternative RAG backend) -----------------
OMNIRAG_ENABLED=false
OMNIRAG_URL=
OMNIRAG_API_KEY=

# --- Hardening toggles ------------------------------------------
NODE_ENV=production
GOVERNANCE_STRICT=true
# DEV_MODE must NEVER be true in production. The env-guard at
# server/_core/env.ts will throw if both are set, unless the
# CI-only escape hatch ALLOW_DEV_MODE_IN_PROD=true is also set.
DEV_MODE=false
```

---

## Notes on rotation

* `SECRET_LAST_ROTATED` (ISO date) — optional, surfaced by the
  hardening dashboard. Set whenever any of the four production
  secrets above is rotated.
* `ENCRYPTION_KEY` rotation requires re-encryption of existing
  payloads; do **not** rotate without running the
  re-encrypt migration first.

## See also

* `docs/deployment/staging-readiness.md` — the gating checklist
  this template fulfils.
* `tests/_helpers/test-modes.ts` — the predicates that read these
  env vars at test-collection time.
* `scripts/run-staging-integration-tests.ts` — the BLOCKED reporter.
