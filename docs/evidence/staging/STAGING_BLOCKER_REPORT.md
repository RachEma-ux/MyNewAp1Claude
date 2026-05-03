# Staging Blocker Report

**Branch:** `test/readiness-staging-preflight`
**Date:** 2026-05-03
**Author:** Claude (Tester per AGENTS.md)
**Companion:** [`STAGING_PREFLIGHT_REPORT.md`](./STAGING_PREFLIGHT_REPORT.md)

## TL;DR

The Production Readiness Blocker Closure Plan (PRs 3–10) cannot proceed from this device. The staging environment named by the plan is **not provisioned**. Per the plan's standing rule (*"If staging is not provisioned enough to run PR 3, stop and produce: docs/evidence/staging/STAGING_BLOCKER_REPORT.md. Then return the exact missing dependencies."*), this report is the stop point.

Per the plan's other standing rules:

- "Do not fake PASS." — no PR 3–10 verdict will be claimed without evidence.
- "Do not convert missing infrastructure into PASS." — every blocker below is named with its exact missing dependency.
- "Do not weaken checks." — `pnpm run staging:preflight:gate` correctly exits 2 against the current env (verified).

## Per-PR blocker matrix

| PR | Phase | Status | Blocker (exact missing dependency) |
|----|-------|:------:|-----------------------------------|
| **PR 3** | DB isolation | **BLOCKED** | `DATABASE_URL_MYNEWAP1CLAUDE`, `DATABASE_URL_ASDB`, `DATABASE_URL_RAGDB`, `DATABASE_URL_WFDB`, plus the four production secrets (`ENCRYPTION_KEY`, `SECRETS_ENCRYPTION_KEY`, `COOKIE_SECRET`, `JWT_SECRET`), plus `OPA_URL`. None present. |
| **PR 4** | Worker runtime | **BLOCKED** | `GRAPHRAG_WORKER_URL`, `DATA_ACQUISITION_WORKER_URL`, `EXTERNAL_ORCHESTRATOR_URL`, `SANDBOX_WF_WORKER_URL`, `KGRA_SERVICE_URL`. None present. Also requires PR 3's preconditions. |
| **PR 5** | Connector verification | **PARTIAL/BLOCKED** | Built-in connectors (`local`, `manual`, `webhook`) can be exercised once the app is reachable on `STAGING_APP_URL`; that env is also missing. External connectors require credentials: `S3_BUCKET` + `S3_REGION` + `S3_ACCESS_KEY_ID` + `S3_SECRET_ACCESS_KEY` (S3); `GDRIVE_CLIENT_ID` + `GDRIVE_CLIENT_SECRET` (GDrive); `GITHUB_APP_ID` + `GITHUB_PRIVATE_KEY` (GitHub connector — note: `GH_PAT` is present but is the repo-auth token, not the connector credential). None of those are present. |
| **PR 6** | UI smoke | **BLOCKED** | `STAGING_APP_URL`, plus a Playwright install with a Chromium browser. Neither present (`./node_modules/.bin/playwright` not installed; no Chromium under `~/.cache/ms-playwright`). |
| **PR 7** | Workflow replay | **BLOCKED** | Same as PR 6, plus `KGRA_SERVICE_URL` for the GraphRAG → KGRA workflow, plus PR 3 + PR 4 preconditions. |
| **PR 8** | E2E sync | **BLOCKED** | Same as PR 6 + PR 4 (real workers needed for sync chain), plus `STAGING_APP_URL`. |
| **PR 9** | Security / RBAC | **BLOCKED** | `STAGING_APP_URL` + Playwright + test accounts (no test-account credential discovery is possible without a reachable app). Auth-flow evidence requires real session cookies, which need a real session, which needs a real app + real DB + real OPA. |
| **PR 10** | Final readiness rerun | **BLOCKED (downstream)** | Cannot run until PRs 3–9 are landed with evidence. The rerun aggregates their verdicts. |

## Aggregated dependency list

Provision the following before re-attempting:

### Required env vars (gate-blocking under PR #91 contract)

```
DATABASE_URL                       # or one/all of the per-DB DSNs below
OPA_URL                            # not opa.example.com
ENCRYPTION_KEY                     # 32 random bytes hex
SECRETS_ENCRYPTION_KEY             # 32 random bytes hex
COOKIE_SECRET                      # 32 random bytes base64url
JWT_SECRET                         # 32 random bytes base64url
```

### Per-DB DSNs (Phase 3)

```
DATABASE_URL_MYNEWAP1CLAUDE
DATABASE_URL_ASDB
DATABASE_URL_RAGDB
DATABASE_URL_WFDB
```

### Worker URLs (Phase 4)

```
GRAPHRAG_WORKER_URL
DATA_ACQUISITION_WORKER_URL
EXTERNAL_ORCHESTRATOR_URL
SANDBOX_WF_WORKER_URL
KGRA_SERVICE_URL
REDIS_URL or WORKER_QUEUE_URL
```

### Connector credentials (Phase 5; PR 5 must report unconfigured connectors as BLOCKED, not PASS)

```
S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET
GITHUB_APP_ID, GITHUB_PRIVATE_KEY    # NOT GH_PAT — the GitHub *App* credentials
```

### Staging app + UI tooling (Phases 8, 9, 10, 11)

```
STAGING_APP_URL                       # base URL of the staging deployment
Playwright + Chromium installed       # `pnpm dlx playwright install chromium` after reachability is confirmed
Test accounts (admin, manager, member, restricted)
```

## What does NOT block PR 3+ (so reviewers know)

- The unit-test cluster (PR 1) is resolved on `main` (PR #90 merged → `584ca86`).
- The staging foundation (PR 2) is on `main` (PR #91 merged → `8081bdf`). `pnpm run staging:preflight:gate` correctly returns 2 against the current bare env (verified in this branch).
- The `tests/staging-foundation/` unit tests (18) pass cleanly under `pnpm run test:unit`.
- The architecture / wiring / ports / AWI / frontend-modularity checks all pass on `main`.

So the platform code is staging-ready in the sense that it is wired to consume staging. The blocker is purely external: nobody has provisioned the staging environment that the platform expects.

## Suggested unblock workflow

1. Provision staging on a real host (Postgres clusters, OPA, workers, secrets manager).
2. Set the env vars listed above on the staging host (NOT on this dev device).
3. From the staging host: `pnpm install && pnpm run staging:preflight:gate` → exit 0.
4. From the staging host: `pnpm run test:integration:staging` → real assertions run.
5. Capture per-phase evidence (DB isolation, worker probes, connector probes, UI smoke, workflow replay, E2E sync, RBAC) into `docs/evidence/<phase>/...` as the plan specifies.
6. Re-resume the closure plan from PR 3 with that evidence in hand.

## What this PR is

This branch / PR ships the two reports above (`STAGING_PREFLIGHT_REPORT.md` and `STAGING_BLOCKER_REPORT.md`) as the auditable record of the stop. It does **not** ship a PR 3 verdict, because no PR 3 evidence exists.

## What this PR is not

- Not a PR 3 implementation.
- Not a verdict change. Current label remains **STAGING-READY**. Target label **PRODUCTION-READY** is unreachable from this device.
- Not a request to weaken the gate; the gate is doing its job.

## Reproduction

```bash
cd /root/MyNewAp1Claude
git checkout test/readiness-staging-preflight
pnpm run staging:preflight           # human-readable
pnpm run staging:preflight:json      # JSON
pnpm run staging:preflight:gate; echo "exit=$?"  # exit=2 (BLOCKED)
```

## Sign-off (per AGENTS.md)

- **Planner:** PRs 3–10 each scoped per the user's plan; no scope changed here.
- **Builder:** No code changes; only `docs/evidence/staging/*.md`.
- **Reviewer:** No source touched, no architectural drift, no checks weakened.
- **Tester:** `pnpm run staging:preflight:gate` exits 2 against current env; foundation tests still 18/18 green.
- **Governance:** Plan's *"Do not fake PASS"* and *"Do not convert missing infrastructure into PASS"* respected. Verdict captured as **BLOCKED** with exact missing dependencies, not silently downgraded to a skip or upgraded to a fake PASS.
