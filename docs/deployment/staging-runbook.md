# Staging Runbook

Operational procedures for the staging runtime introduced by
`infra/staging-runtime`. For the architecture overview see
[`staging-runtime.md`](./staging-runtime.md).

## Bring up / tear down

```bash
pnpm run staging:up        # docker compose up -d (4 PG + Redis + OPA + 5 mock workers)
pnpm run staging:logs      # tail recent logs
pnpm run staging:down      # docker compose down (preserves volumes)
pnpm run staging:down -v   # ALSO destroys named volumes — use sparingly
```

The four Postgres named volumes (`mynewap1claude-data`, `asdb-data`,
`ragdb-data`, `wfdb-data`) and `redis-data` persist across `up`/`down`
cycles unless you explicitly pass `-v`.

## Set env vars

```bash
cp .env.staging.example .env.staging          # template
# edit .env.staging:
#   ENCRYPTION_KEY        — pull from secrets manager (32 bytes hex)
#   SECRETS_ENCRYPTION_KEY — pull from secrets manager (32 bytes hex)
#   COOKIE_SECRET         — pull from secrets manager (32 bytes base64url)
#   JWT_SECRET            — pull from secrets manager (32 bytes base64url)
set -a; source .env.staging; set +a
```

For local-developer-only use, `pnpm run staging:generate-secrets`
emits `.env.staging.local` with random values. NEVER use those in
real staging.

## Run migrations

```bash
DATABASE_URL=$DATABASE_URL_MYNEWAP1CLAUDE pnpm run db:push
DATABASE_URL=$DATABASE_URL_ASDB         pnpm run db:push
DATABASE_URL=$DATABASE_URL_RAGDB        pnpm run db:push
DATABASE_URL=$DATABASE_URL_WFDB         pnpm run db:push
```

Re-runs are safe — Drizzle no-ops when migrations are already applied.

## Seed

```bash
pnpm run staging:seed           # currently a dispatcher / plan; per-module seeders are in follow-ups
```

See [`staging-seed-data.md`](./staging-seed-data.md) for the seed
plan and per-module dependency order.

## Health check the stack

```bash
pnpm run staging:health         # human output
pnpm run staging:health:json    # JSON
```

Expected behaviour:
- All seven URLs reachable → exit 0.
- One or more URL env unset → exit 2.
- One or more URL reachable but unhealthy → exit 1.

## Run the preflight gate

```bash
pnpm run staging:preflight:gate; echo "exit=$?"
```

Exit-code contract:
- `0` — staging ready to run PRs 3–10.
- `1` — runtime FAIL (a service is reachable but unhealthy).
- `2` — BLOCKED with exact missing dependencies (printed and written to evidence reports).

Evidence is written to:
- `docs/evidence/staging/STAGING_PREFLIGHT_REPORT.md`
- `docs/evidence/staging/STAGING_BLOCKER_REPORT.md` (when verdict ≠ PASS)

## Run the production-readiness PRs 3–10 evidence commands

Once `staging:preflight:gate` exits 0:

```bash
pnpm run test:integration:staging                 # Phase 3 / 4 / 5 / 10 / 11
pnpm exec playwright test tests/e2e/ui-smoke      # Phase 8 (after `pnpm dlx playwright install chromium`)
pnpm exec playwright test tests/e2e/workflows     # Phase 9
pnpm exec playwright test tests/e2e/sync          # Phase 10 UI side
pnpm exec playwright test tests/e2e/security      # Phase 11
```

Per-PR evidence files land under `docs/evidence/<phase>/...` per the
plan; this runbook does not enumerate them — see the per-PR sections
in `docs/evidence/production-readiness/...`.

## Interpret BLOCKED vs FAIL

| Verdict | What it means | Action |
|---------|---------------|--------|
| **BLOCKED** | A required env or tooling dependency is missing. The runtime didn't get a chance to fail. | Provision the missing dependency; nothing in the platform code is broken. |
| **FAIL** | A service is reachable but reports unhealthy (or returns non-2xx on `/health`). | The runtime IS broken. Fix it before re-attempting. |

A BLOCKED row never silently turns into a PASS — the gate's design
explicitly rejects placeholder values like `opa.example.com` and
empty strings.

## Mock vs real services

Every mock-worker `/health` payload includes `mode: "staging-mock"`.
PR 4 / PR 9 / PR 10 evidence MUST capture this field. A row whose
recorded `mode` is `staging-mock` cannot claim PASS — strongest
verdict is PARTIAL with the named dependency on a real worker URL.

To swap a mock for a real worker:

```bash
# 1. Stop the mock service (or just unset its env var).
docker stop staging-mock-graphrag-worker

# 2. Point the env var at the real worker.
export GRAPHRAG_WORKER_URL=https://real-graphrag.staging.internal

# 3. Re-run health.
pnpm run staging:health
```

## Connectors

External connectors (S3 / GDrive / GitHub App) are BLOCKED by
default — preflight reports them as `blocked` until the relevant
credentials are set. There is no override; the design forbids
silently downgrading missing credentials to PASS.

`GH_PAT` (used for repo push / PR open) is **not** the GitHub
*connector* credential. The connector requires `GITHUB_APP_ID`
+ `GITHUB_PRIVATE_KEY` (a GitHub App, not a PAT).

## Avoid committing secrets

`.gitignore` blocks:

```
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
.env.staging
.env.staging.local
```

Tracked templates: `.env.example` (if present) and
`.env.staging.example` only. The preflight, health, seed, and
print-missing-env scripts never echo secret values — they print
presence yes/no and URL probe results only.

## Known constraints

- **App is not containerised** in the stack. Start it separately
  with `pnpm run dev` or `pnpm run build && pnpm run start`. That
  decision is in `docs/deployment/staging-runtime.md`.
- **Mock workers are not real workers.** Phase 4 evidence collected
  against mocks is at most PARTIAL.
- **Playwright + Chromium not installed** by default. Install when
  needed: `pnpm dlx playwright install chromium`.
