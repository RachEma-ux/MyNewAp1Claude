# Staging Readiness Checklist

This document defines the infrastructure and configuration that
must exist before `pnpm run test:integration:staging` (and, by
extension, the Phase 8/9/10 production-readiness gates) can run
against the staging environment.

The runner intentionally **does not silently skip** when infra is
missing — it exits with status `2` and prints `BLOCKED`. The only
ways out of `BLOCKED` are (a) provision the missing piece or (b)
explicitly mark a finding as out-of-scope at the readiness-report
level. Do not edit the helpers to weaken the predicate.

---

## 1. Required infrastructure

### 1.1 Databases — module-owned schemas

The platform fans out across **four primary owned databases**
plus several module-private schemas that fall back to the primary
when their dedicated DSN is unset.

| Role | Env var (required for prod) | Owner | Notes |
|---|---|---|---|
| Primary platform DB | `DATABASE_URL` | platform-core | All non-modular tables (users, workspaces, governance, audit, agents, conversations, …). The control-plane DB. |
| Agent Studio DB | `DATABASE_URL_ASDB` | `agent-studio` | Required at production scale; falls back to `DATABASE_URL` in dev. |
| RAG knowledge graph DB | `DATABASE_URL_RAGDB` | `rag` | Vector + KG metadata. Falls back to `DATABASE_URL` in dev. |
| Workflow DB | `DATABASE_URL_WFDB` | `sandbox-wf` | Per-tenant workflow execution state. Falls back to `DATABASE_URL` in dev. |

Module-private DSNs that exist as opt-in overrides (currently
fall back to `DATABASE_URL`):

| Env var | Owner |
|---|---|
| `DATABASE_URL_CODEDB` | `code-studio` |
| `DATABASE_URL_PRMDB` | `prm` |
| `DATABASE_URL_PSMDB` | `psm` |
| `DATABASE_URL_PMDB` | `pm-central` |
| `DATABASE_URL_COMMUNICATIONDB` | `communication` |
| `DATABASE_URL_DATA_ANALYSISDB` | `data-analysis` |
| `DATABASE_URL_DW` | `data-analysis/data-warehouse` |

Each owned DB must be:

1. Reachable from the staging app host (network ACLs, security group).
2. Migrated with `pnpm run db:push` (drizzle generate + migrate)
   against the corresponding DSN — once per DB.
3. Seeded with a known-good fixture so Phase 9 synthetic-user
   replay can run end-to-end. Treat the seed as part of the
   environment, not the test.

The staging-integration runner asserts only `DATABASE_URL`
because that is the lowest common denominator — modules with
their own DSN unset will fall back to it. If you provision per-module
DBs separately, set their dedicated env vars too.

### 1.2 Open Policy Agent (OPA)

Governance evaluates policies via OPA. There are two acceptable
deployment shapes:

* **Centrally-hosted OPA service** — point `OPA_URL` at the
  staging hostname (e.g. `https://opa.staging.internal/v1/data`).
* **Local OPA container** — run `openpolicyagent/opa:latest` as a
  sidecar and point `OPA_URL` at `http://localhost:8181`.

The placeholder `opa.example.com` is **rejected** by both the
runtime and the staging-integration runner. It exists as a
default in dev fallbacks only so unit tests have a non-null
URL to construct clients against.

If your deployment uses signed bundles, also set:

* `OPA_AUTH_TOKEN` — bearer token for the OPA service.
* `OPA_COSIGN_PUBLIC_KEY` — public key the policy bundle was
  signed with. Required when `GOVERNANCE_STRICT=true`.

### 1.3 Worker queue / Redis

Some platform-level concerns require a shared queue:

| Concern | Env var | Notes |
|---|---|---|
| Distributed rate limiting | `REDIS_URL` | Production hardening expects this when `NODE_ENV=production`. Without it the system falls back to per-process in-memory rate limiting (works for staging, fails at scale). |
| Generic worker queue (alt) | `WORKER_QUEUE_URL` | Accepted by the test-mode helper as an alternative signal that workers are reachable. |
| Data Acquisition worker | `DATA_ACQUISITION_WORKER_URL` | Required for `data-analysis/data-acquisition` flows. Defaults to `http://localhost:8485` in dev. |
| GraphRAG worker | `GRAPHRAG_WORKER_URL` | Required for KGRA and `data-analysis/graphrag` flows. Defaults to `http://localhost:8484` in dev. |

For the readiness gate to flip the worker predicate from skip to
run, set either `REDIS_URL` or `WORKER_QUEUE_URL`. The
worker-specific URLs are component-level requirements; they are
verified by the per-feature integration tests.

### 1.4 External agent orchestrator (optional)

If the staging environment exercises the external agent runtime,
set:

* `EXTERNAL_ORCHESTRATOR_URL` — HTTPS endpoint of the orchestrator.

Without this, `server/services/externalOrchestrator.test.ts` and
`server/services/__tests__/external-runtime.test.ts` are skipped
in unit mode. Setting it under `TEST_MODE=staging-integration`
forces them to run as real assertions.

### 1.5 Production secrets

The four secrets below are mandatory whenever `NODE_ENV=production`.
The runner asserts all four up front; missing any one is a hard
`BLOCKED`.

| Env var | Used for |
|---|---|
| `ENCRYPTION_KEY` | App-level data encryption (workspace-scoped values, audit payloads). |
| `SECRETS_ENCRYPTION_KEY` | The Secrets module — encrypts user-provided third-party API keys at rest. |
| `COOKIE_SECRET` | Session cookie signing. Falls back to `JWT_SECRET` if unset. |
| `JWT_SECRET` | Session JWT signing. |

The values come from the secrets manager (Vault / AWS SM / 1Password
infra vault / equivalent) — never commit them and never paste
them into this repo. The example file `staging-env.example.md`
is structural only.

If your deployment does **not** stand up these secrets, the
production-mode env-guard at `server/_core/env.ts` will throw
at server boot:

```
[FATAL] Missing required environment variables for production: ENCRYPTION_KEY, SECRETS_ENCRYPTION_KEY, …
```

That's intentional — it's the fail-closed behaviour the readiness
report relies on.

### 1.6 OAuth (control-plane sign-in)

For staging that mirrors the production sign-in path, set:

* `VITE_APP_ID` (build-time) **or** `APP_ID` (runtime)
* `OAUTH_SERVER_URL`
* `COOKIE_SECRET` or `JWT_SECRET` (already covered above)

Without these the app boots in **demo mode** with auth bypass.
That is acceptable for unit-mode CI but **not** for
staging-integration mode — Phase 8/9 manual smoke and synthetic-user
replay both require real auth.

---

## 2. Pre-flight verification

Run these in order against the staging environment:

```bash
# 1. Confirm every required env var is present.
pnpm run test:integration:staging
# → If anything is missing, you'll see "BLOCKED — required infra
#   is missing" and exit code 2. Fix and re-run.

# 2. Migrate every owned DB.
DATABASE_URL=$STAGING_DATABASE_URL pnpm run db:push
DATABASE_URL=$STAGING_DATABASE_URL_ASDB pnpm run db:push
DATABASE_URL=$STAGING_DATABASE_URL_RAGDB pnpm run db:push
DATABASE_URL=$STAGING_DATABASE_URL_WFDB pnpm run db:push

# 3. Boot the app against staging and confirm the env-guard
#    does NOT throw.
NODE_ENV=production pnpm run start

# 4. Hit /api/health/hardening (or run runHardeningCheck() via
#    the platform router) and confirm `allCriticalPassed: true`.
```

Only proceed to Phase 8/9/10 once steps 1-4 are clean.

---

## 3. What `BLOCKED` means in the readiness pipeline

Per `scripts/run-staging-integration-tests.ts`, missing infra is
**not downgraded to a skip**. The runner exits `2` so CI can
distinguish three states:

| Exit | Meaning | Phase verdict |
|---|---|---|
| `0` | All env present, vitest ran, all assertions passed. | PASS |
| `1` | All env present, vitest ran, at least one test failed. | FAIL |
| `2` | Required env missing — vitest never started. | BLOCKED |

Do not paper over `BLOCKED` by silencing the script or by setting
fake values. The whole point of separating the unit and integration
modes (see PR #81) is that real failures surface as failures.

---

## 4. Worker runtime verification

Phase 4 of the readiness report flagged worker verification as
PARTIAL because static manifests pass but no test exercises a
live worker. The fix lives at
`tests/integration/workers/worker-runtime.test.ts`:

* Probes `/health` on each declared worker (GraphRAG,
  Data Acquisition, External Orchestrator) when its env var is
  set.
* Excluded from local-unit mode by the `tests/integration/**`
  exclude rule.
* Each worker block uses a plain `skipIf(!hasWorker)` predicate,
  not `skipUnlessInfra` — workers are component-scoped optional
  infra. A staging environment without GraphRAG simply runs in
  degraded mode for that subdomain; we want the test to skip
  cleanly there, not BLOCK the whole suite.

To run the live worker probes against staging:

```bash
GRAPHRAG_WORKER_URL=https://graphrag.staging.internal \
DATA_ACQUISITION_WORKER_URL=https://data-acquisition.staging.internal \
EXTERNAL_ORCHESTRATOR_URL=https://orchestrator.staging.internal \
pnpm run test:integration:staging
```

## 5. Outstanding gaps (tracked elsewhere)

| Item | Status | Owner |
|---|---|---|
| Phase 8 manual smoke matrix (15 capsules × representative paths) | Pending staging stand-up | TL |
| Phase 9 synthetic-user replay | Pending staging stand-up | TL |
| Phase 10 E2E sync suite | Pending staging stand-up | TL |
| Bundle-size split (Phase 12 caveat) | Tracked in Tier 5 | FE |

These do not block PR #7 from merging — PR #7 is the doc
deliverable that unblocks the rest.
