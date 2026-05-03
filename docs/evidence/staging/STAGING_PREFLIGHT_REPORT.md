# Staging Preflight Report

**Branch:** `test/readiness-staging-preflight`
**Date:** 2026-05-03
**Author:** Claude (Tester per AGENTS.md)
**Companion:** [`STAGING_BLOCKER_REPORT.md`](./STAGING_BLOCKER_REPORT.md)
**Reproduction:** `pnpm run staging:preflight:json` (foundation from PR #91)

This report captures the state of the staging environment at the moment the user authorized resumption of the Production Readiness Blocker Closure Plan (PRs 3–10). It exists to make the "go / no-go for PR 3" decision auditable.

## Verdict

**BLOCKED — staging environment is not provisioned.**

Every required env variable is missing. There is no staging app, OPA, worker, or DB reachable from this device. Per the plan's standing rule ("If staging is not provisioned enough to run PR 3, stop and produce: `docs/evidence/staging/STAGING_BLOCKER_REPORT.md`"), execution stops here. The detail of *exactly* what's missing is in the companion report.

## Method

The preflight is the one shipped in PR #91 (`scripts/staging-foundation/preflight.ts`). It is a pure read of `process.env` — no network calls, no side effects — followed by a set of `curl --max-time 5` health probes against the URL envs the plan enumerates.

Three layers were probed:

1. **Required infra** (gate-blocking per PR #91 contract): `DATABASE_URL`, `OPA_URL`, `ENCRYPTION_KEY`, `SECRETS_ENCRYPTION_KEY`, `COOKIE_SECRET`, `JWT_SECRET`.
2. **Component-scoped infra** (skip cleanly when missing): worker URLs, queue URLs, connector credentials.
3. **Extended staging env** named in the user's plan but not yet wired into the foundation preflight: `STAGING_APP_URL`, `DATABASE_URL_MYNEWAP1CLAUDE`, `DATABASE_URL_ASDB`, `DATABASE_URL_RAGDB`, `DATABASE_URL_WFDB`, `KGRA_SERVICE_URL`, `SANDBOX_WF_WORKER_URL`.

For env probes, the report records **presence only** — never values. For URL probes, the report records reachability.

## Required infra (gate)

| Variable | Present | Status |
|----------|:-------:|--------|
| `DATABASE_URL` | no | **BLOCKED — missing** |
| `OPA_URL` | no | **BLOCKED — missing** |
| `ENCRYPTION_KEY` | no | **BLOCKED — missing** |
| `SECRETS_ENCRYPTION_KEY` | no | **BLOCKED — missing** |
| `COOKIE_SECRET` | no | **BLOCKED — missing** |
| `JWT_SECRET` | no | **BLOCKED — missing** |

`pnpm run staging:preflight:gate` exits **2** (BLOCKED, by design). Verified in this session.

## Component-scoped infra

| Variable | Present | Component / Phase |
|----------|:-------:|-------------------|
| `GRAPHRAG_WORKER_URL` | no | graphrag-worker (Phase 4) |
| `DATA_ACQUISITION_WORKER_URL` | no | data-acquisition-worker (Phase 4) |
| `EXTERNAL_ORCHESTRATOR_URL` | no | external-orchestrator (Phase 4) |
| `REDIS_URL` | no | worker-queue (Phase 4) |
| `WORKER_QUEUE_URL` | no | worker-queue alt (Phase 4) |
| `S3_BUCKET` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | no | s3-connector (Phase 5) |
| `GDRIVE_CLIENT_ID` / `GDRIVE_CLIENT_SECRET` | no | gdrive-connector (Phase 5) |
| `GITHUB_APP_ID` / `GITHUB_PRIVATE_KEY` | no | github-connector (Phase 5) |

Note: `GH_PAT` is present in the shell but is the GitHub auth token used for repo operations (push, PR open). It is **not** the GitHub *connector* credential — the connector requires `GITHUB_APP_ID` + `GITHUB_PRIVATE_KEY` (a GitHub App, not a PAT).

## Extended staging env (from the user's plan, not yet wired into the foundation preflight)

| Variable | Present | Phase used |
|----------|:-------:|------------|
| `STAGING_APP_URL` | no | UI smoke (Phase 8), workflow replay (Phase 9), E2E sync (Phase 10), security (Phase 11) |
| `DATABASE_URL_MYNEWAP1CLAUDE` | no | DB isolation (Phase 3) |
| `DATABASE_URL_ASDB` | no | DB isolation (Phase 3, ASDB) |
| `DATABASE_URL_RAGDB` | no | DB isolation (Phase 3, RAGDB) |
| `DATABASE_URL_WFDB` | no | DB isolation (Phase 3, WFDB) |
| `KGRA_SERVICE_URL` | no | Workflow replay (Phase 9) |
| `SANDBOX_WF_WORKER_URL` | no | Worker verification (Phase 4) |

## URL health probes (`curl -fsS --max-time 5 …/health`)

| URL var | Probed? | Result |
|---------|:-------:|--------|
| `STAGING_APP_URL/api/health` | no | URL empty → not probed |
| `OPA_URL/health` | no | URL empty → not probed |
| `GRAPHRAG_WORKER_URL/health` | no | URL empty → not probed |
| `DATA_ACQUISITION_WORKER_URL/health` | no | URL empty → not probed |
| `EXTERNAL_ORCHESTRATOR_URL/health` | no | URL empty → not probed |
| `KGRA_SERVICE_URL/health` | no | URL empty → not probed |

Each URL var is empty, so `curl` was correctly skipped. Probing an empty URL would not produce useful evidence — the missing URL itself is the failure mode.

## Tooling on the execution host

| Tool | Available | Notes |
|------|:---------:|-------|
| `curl` | yes | — |
| `psql` (client) | yes | `/usr/lib/postgresql/17/bin/psql` (Linux side) |
| `pg_isready` | yes | — |
| `initdb` (server-side bootstrap) | yes via Termux | `/data/data/com.termux/files/usr/bin/initdb`. Linux-side `postgresql-17` server package is in `rc` state (removed; only client tools present). Cannot bootstrap a "real staging" cluster from the Termux binary inside the proot Linux distro without a network-reachable Postgres that the rest of the platform also sees. |
| `docker` | no | Cannot run dockerised dependencies. |
| `redis-cli` | no | Cannot probe a Redis queue. |
| `playwright` | no | UI smoke (Phase 8), workflow replay (Phase 9), E2E sync (Phase 10), security (Phase 11) all need this. |
| Chromium browser | no | Same as above. |

## Test accounts / seed data

Not applicable — the staging app is not reachable, so test-account presence is moot until the app is provisioned.

## Why this stops PR 3

Phase 3 acceptance per the plan: *"Phase 3 PASS only with real DB evidence."*

Real DB evidence requires:
- One or more of `DATABASE_URL_MYNEWAP1CLAUDE`, `DATABASE_URL_ASDB`, `DATABASE_URL_RAGDB`, `DATABASE_URL_WFDB` (none set).
- A reachable Postgres cluster behind those DSNs.
- An OPA endpoint to authorise the queries (none set).
- The four production-mode secrets so the app boots in non-dev mode (none set).

Standing up a fresh local Postgres cluster on this device with the Termux `initdb` would be a developer-device simulation, not real staging. The plan explicitly forbids that path: *"Do not fake PASS"*, *"Do not convert missing infrastructure into PASS"*. So this report stops at preflight and defers PR 3 evidence to a real staging host.

## Reproduction

```bash
cd /root/MyNewAp1Claude
git checkout test/readiness-staging-preflight
pnpm run staging:preflight           # human-readable
pnpm run staging:preflight:json      # machine-readable
pnpm run staging:preflight:gate      # exit 2 if BLOCKED
```

The JSON output is the evidence; this report is the human summary. They will not drift because the JSON is the contract that `tests/staging-foundation/preflight.test.ts` locks in (18 tests, all green on `main` post-#90/#91).

## Next steps

See [`STAGING_BLOCKER_REPORT.md`](./STAGING_BLOCKER_REPORT.md) for the per-PR dependency matrix. PR 3 cannot proceed until the listed dependencies are provisioned.
