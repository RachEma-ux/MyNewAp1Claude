# Staging Runtime

**Status:** infra/staging-runtime PR.
**Audience:** anyone provisioning staging to run production-readiness PRs 3–10.

This document is the canonical "how to bring up staging" reference.
For the env-contract foundation (preflight, dev-secret generator),
see [`staging-runtime-foundation.md`](./staging-runtime-foundation.md)
(shipped by PR #91). This file extends that with the actual runtime
stack — Postgres × 4, Redis, OPA, mock workers — needed to run the
phase evidence chains.

## Quickstart

```bash
# 1. Copy the env template and fill in real secrets from the secrets manager.
cp .env.staging.example .env.staging
# (edit .env.staging — replace every `replace-with-secret` placeholder)

# 2. Source it.
set -a; source .env.staging; set +a

# 3. Bring up the stack.
pnpm run staging:up

# 4. Verify the env contract + service health.
pnpm run staging:preflight:gate     # exit 0 = ready, 2 = blocked, 1 = unhealthy
pnpm run staging:health             # per-URL health

# 5. Boot the app pointing at the stack (separate terminal).
pnpm run dev      # or `pnpm run build && pnpm run start`

# 6. Run the staging integration suite.
pnpm run test:integration:staging

# 7. Tear down.
pnpm run staging:down
```

## Stack overview

`docker-compose.staging.yml` brings up:

| Service | Port | Image | Purpose |
|---------|------|-------|---------|
| `postgres-mynewap1claude` | 5432 | `postgres:16-alpine` | Primary app DB |
| `postgres-asdb` | 5433 | `postgres:16-alpine` | Agent Studio DB |
| `postgres-ragdb` | 5434 | `postgres:16-alpine` | RAG / GraphRAG DB |
| `postgres-wfdb` | 5435 | `postgres:16-alpine` | Sandbox WF DB |
| `redis` | 6379 | `redis:7-alpine` | Worker queue |
| `opa` | 8181 | `openpolicyagent/opa:1.4.0` | Policy decisions; mounts `infra/staging/opa/` (read-only) |
| `mock-graphrag-worker` | 4101 | local build | Mock; `/health`, `/run` |
| `mock-data-acquisition-worker` | 4102 | local build | Mock |
| `mock-external-orchestrator` | 4103 | local build | Mock |
| `mock-sandbox-wf-worker` | 4104 | local build | Mock |
| `mock-kgra-service` | 4105 | local build | Mock |

The **app itself is not containerised** in this stack — start it
separately with `pnpm run dev` (or `pnpm run build && pnpm run start`).
That's a deliberate choice: the dev iteration loop is far smoother
when the app runs on the host with HMR, and containerising the app
would require a full Dockerfile that this PR is intentionally not
introducing.

## Mock vs real

Every mock worker labels itself `mode: "staging-mock"` in its
`/health` and `/run` JSON payloads. Phase 4 / Phase 9 / Phase 10
evidence MUST record this field. A row that records `mode:
staging-mock` cannot be claimed PASS — the strongest verdict it can
carry is PARTIAL with the dependency on a real worker URL named
explicitly.

Real workers ship from their own repos. To swap in a real worker,
unset the env var pointing at the mock and set it to the real URL,
then re-run `pnpm run staging:health` to verify.

## Migrations

Once the four Postgres instances are reachable:

```bash
DATABASE_URL=$DATABASE_URL_MYNEWAP1CLAUDE pnpm run db:push
DATABASE_URL=$DATABASE_URL_ASDB pnpm run db:push
DATABASE_URL=$DATABASE_URL_RAGDB pnpm run db:push
DATABASE_URL=$DATABASE_URL_WFDB pnpm run db:push
```

The Postgres init scripts in `infra/staging/postgres-init/<db>/` run
once on first container start and create the extensions Drizzle's
migrations expect (`uuid-ossp`, `pgcrypto`).

## Browser tooling for Phase 8 / 9 / 10 / 11

Playwright + Chromium are NOT installed by default on the staging
host — they are heavy and only needed when actually running the
browser evidence chains. Install when needed:

```bash
pnpm dlx playwright install chromium
```

`pnpm run staging:preflight:gate` reports browser tooling as
BLOCKED when not installed.

## What this stack does NOT provide

- **Real production OPA bundle.** The mounted policies in
  `infra/staging/opa/` are staging-only (just enough for Phase 11
  to have something to query). Production bundles come from the
  policy repo.
- **Real cloud connector credentials.** S3 / GDrive / GitHub App
  connectors stay BLOCKED until real credentials are set in the env.
  PR 5 must report unconfigured external connectors as BLOCKED, not
  PASS.
- **The app server.** Start the app separately (see Quickstart).

## Standing rules respected

- **No fake PASS.** Mock workers self-label `mode: staging-mock`;
  every evidence chain that touches a mock is at most PARTIAL.
- **No checks weakened.** The PR #91 foundation gate is preserved
  unchanged; the extended gate only adds new checks on top of it.
- **No secrets committed.** `.env.staging` is gitignored;
  `.env.staging.example` carries placeholders only.
- **Capsule architecture untouched.** No source changes to module
  capsules; only infrastructure scaffolding.

See also: [`staging-runbook.md`](./staging-runbook.md) for
operational procedures, [`staging-seed-data.md`](./staging-seed-data.md)
for the seed plan.
