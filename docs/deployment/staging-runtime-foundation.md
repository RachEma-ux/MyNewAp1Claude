# Staging Runtime Foundation

**Status:** Phase 2 of the Production Readiness Blocker Closure Plan.
**Owner:** Tester / DevOps. **Audience:** anyone who needs to exercise
the staging integration suite (Phases 3, 4, 5, 8, 9, 10, 11).

This document is the *foundation* — the scripts, contracts, and exit-code
semantics that make the rest of the plan auditable. The actual phase
exercises (DB isolation evidence, worker probes, UI smoke, …) live in
their own evidence docs and reference back here for env contract.

## What this PR ships

| Surface | Path | Purpose |
|---------|------|---------|
| Preflight reporter | `scripts/staging-foundation/preflight.ts` | Single source of truth for "is staging ready". JSON / human / gate modes. |
| Dev-secret generator | `scripts/staging-foundation/generate-dev-secrets.ts` | Emits `.env.staging.local` with random per-developer values for the four secret keys the gate requires. |
| Foundation tests | `tests/staging-foundation/preflight.test.ts`, `tests/staging-foundation/generate-dev-secrets.test.ts` | Lock the env-contract in unit tests so future drift surfaces locally. |
| pnpm scripts | `staging:preflight`, `staging:preflight:json`, `staging:preflight:gate`, `staging:generate-secrets` | Stable command surface. |

## The env contract

Two tiers. The preflight enforces both, but with very different
semantics — the goal is that **a developer can never accidentally turn
a real BLOCKED state into a silent skip**.

### Required (gate-blocking)

If any of these is missing or empty, `pnpm run staging:preflight:gate`
exits **2** and `pnpm run test:integration:staging` refuses to run.

| Key | Notes |
|-----|-------|
| `DATABASE_URL` | Postgres DSN for the staging copy of `mynewap1claude`. |
| `OPA_URL` | Real OPA endpoint. The literal placeholder host `opa.example.com` is rejected — the gate treats it as missing. |
| `ENCRYPTION_KEY` | 32 random bytes, hex-encoded (64 chars). |
| `SECRETS_ENCRYPTION_KEY` | 32 random bytes, hex-encoded (64 chars). |
| `COOKIE_SECRET` | 32 random bytes, base64url. |
| `JWT_SECRET` | 32 random bytes, base64url. |

### Optional (component-scoped)

If any of these is missing, the corresponding integration test
**skips cleanly** via `describe.skipIf(!hasComponent())`. It does
**not** block the gate. The preflight reports the missing keys as
`deferredComponents` so reviewers can see exactly what was not
exercised in a given run.

| Component | Keys |
|-----------|------|
| `graphrag-worker` | `GRAPHRAG_WORKER_URL` |
| `data-acquisition-worker` | `DATA_ACQUISITION_WORKER_URL` |
| `external-orchestrator` | `EXTERNAL_ORCHESTRATOR_URL` |
| `worker-queue` | `REDIS_URL` or `WORKER_QUEUE_URL` |
| `s3-connector` | `S3_BUCKET` (gate key for the connector group) |
| `gdrive-connector` | `GDRIVE_CLIENT_ID` |
| `github-connector` | `GITHUB_APP_ID` |

### Mode flag

`TEST_MODE=staging-integration` flips two things at once:

1. `tests/_helpers/test-modes.ts::skipUnlessInfra` returns `false`
   (run, don't skip), so env-dependent tests assert against the live
   stack rather than reporting as skipped.
2. The preflight returns `mode: "staging-integration"` in its
   structured report.

## Quickstart for a local developer

```bash
# 1. Generate per-developer dev secrets (one-time, gitignored).
pnpm run staging:generate-secrets

# 2. Edit .env.staging.local to add real DATABASE_URL and OPA_URL.

# 3. Source it.
set -a; source .env.staging.local; set +a

# 4. Confirm preflight is green.
pnpm run staging:preflight:gate    # exit 0 ⇒ ready, exit 2 ⇒ blocked

# 5. Run the staging integration suite.
pnpm run test:integration:staging
```

`pnpm run staging:preflight:json` emits the same data as
`PreflightReport` (see `scripts/staging-foundation/preflight.ts`),
suitable for piping into `jq` or another evidence pipeline.

## Quickstart for a staging host

Real staging never sources from `.env.staging.local`. Instead:

1. Pull `DATABASE_URL` and `OPA_URL` from the deployment manifest.
2. Pull `ENCRYPTION_KEY`, `SECRETS_ENCRYPTION_KEY`, `COOKIE_SECRET`,
   `JWT_SECRET` from the secrets manager.
3. Set the optional component envs only for components that staging
   actually owns. Leave the rest unset; the suite will report them
   as deferred, which is the correct outcome for a non-load test.
4. `pnpm run staging:preflight:gate` → exit 0.
5. `pnpm run test:integration:staging`.

## Exit-code semantics (the contract this PR locks down)

| Command | Exit 0 | Exit 1 | Exit 2 |
|---------|--------|--------|--------|
| `pnpm run staging:preflight` | always (informational) | — | — |
| `pnpm run staging:preflight:gate` | required infra all ok | — | required infra missing (BLOCKED) |
| `pnpm run staging:preflight:json` | always | — | — |
| `pnpm run staging:generate-secrets` | wrote `.env.staging.local` | file already exists, no `--force` | — |
| `pnpm run test:integration:staging` | suite passed | suite failed | required infra missing (BLOCKED) |

## Why this is a "foundation"

Every PR after this one (PR 3 DB isolation evidence, PR 4 worker
probes, PR 5 connector probes, PR 6 UI smoke, PR 7 workflow replay,
PR 8 E2E sync, PR 9 RBAC) needs the same env contract enforced the
same way. Centralising that in one preflight + one secret generator
means:

- **No silent drift** — if PR 4 starts requiring a new env key, the
  preflight learns about it once and every subsequent runner picks
  it up.
- **No fake passes** — every phase exercise that runs the suite goes
  through the gate, and every gate failure is surfaced with the
  exact unfilled-env list.
- **No fake blocked** — if a component-scoped env is missing, the
  test skips cleanly and the report names the deferred component;
  reviewers can tell the difference between "we ran it and it
  passed" and "we never ran it".
