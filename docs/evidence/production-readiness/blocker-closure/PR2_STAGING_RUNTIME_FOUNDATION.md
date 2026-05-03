# PR 2 — Staging Runtime Foundation

**Branch:** `feat/staging-runtime-foundation`
**Date:** 2026-05-03
**Author:** Claude (Builder + Tester per AGENTS.md)
**Companion:** `docs/deployment/staging-runtime-foundation.md`

## Why this PR exists

The 12-PR Production Readiness Remediation Plan landed at the
**STAGING-READY** verdict but left Phases 3–5, 8, 9, 10, and 11
either BLOCKED-for-env-reasons or PARTIAL. The new 10-PR Closure
Plan addresses each of those phases in its own PR (PRs 3–9), then
re-runs the full readiness audit (PR 10).

Every one of those phase PRs needs the same env contract enforced
the same way:
- DATABASE_URL, OPA_URL, ENCRYPTION_KEY, SECRETS_ENCRYPTION_KEY,
  COOKIE_SECRET, JWT_SECRET as gate-blocking required infra;
- worker URLs, queue URL, connector envs as component-scoped
  optional infra (missing → cleanly skipped, not blocked);
- TEST_MODE=staging-integration as the mode flag that flips
  `skipUnlessInfra` from "skip" to "run".

Before this PR the contract lived inline in
`scripts/run-staging-integration-tests.ts` — readable, but with
no shared module, no programmatic access, no JSON output, no
unit tests. This PR centralises and locks it down.

## What landed

| File | Role |
|------|------|
| `scripts/staging-foundation/preflight.ts` | Single source of truth for "is staging ready". `runPreflight(env)` is a pure function; the CLI exposes human, JSON, and gate modes. |
| `scripts/staging-foundation/generate-dev-secrets.ts` | One-shot generator for `.env.staging.local` — random 32-byte hex/base64url values for the four secret keys. **Dev-only**; real staging hosts pull from secrets manager. |
| `tests/staging-foundation/preflight.test.ts` (12 tests) | Lock the env contract in unit tests. Empty env → all required missing. Full env → no missing. opa.example.com → missing. Optional envs cleared → no deferred components. |
| `tests/staging-foundation/generate-dev-secrets.test.ts` (6 tests) | Generated env shape contract. Encryption keys are 64 hex chars. Back-to-back calls produce different values. Round-trip: a generated env (with DATABASE_URL + OPA_URL filled) satisfies the preflight gate. |
| `scripts/run-staging-integration-tests.ts` | Refactored to delegate to the shared `runPreflight` / `formatHuman`. Behaviour preserved (still exits 2 on missing infra, still launches vitest). Code dedup'd, single source of truth. |
| `docs/deployment/staging-runtime-foundation.md` | Usage docs, env contract, exit-code semantics, quickstart for local + staging hosts. |
| `package.json` scripts | `staging:preflight`, `staging:preflight:json`, `staging:preflight:gate`, `staging:generate-secrets`. |
| `.gitignore` | Adds `.env.staging.local` so the dev-secrets generator output never lands in git. |

## Foundation tests

Both new test files run under `pnpm run test:unit` — they assert
against pure functions that take a synthetic env, with no actual
filesystem or network I/O. Result on `feat/staging-runtime-foundation`:

```
✓ tests/staging-foundation/preflight.test.ts (12 tests) 50ms
✓ tests/staging-foundation/generate-dev-secrets.test.ts (6 tests) 40ms

Test Files  2 passed (2)
     Tests  18 passed (18)
```

## Gate behaviour smoke test

| Scenario | Command | Expected exit | Got |
|----------|---------|---------------|-----|
| Empty env | `pnpm run staging:preflight:gate` | 2 (BLOCKED) | 2 ✓ |
| All required filled | `DATABASE_URL=… OPA_URL=… ENCRYPTION_KEY=… SECRETS_ENCRYPTION_KEY=… COOKIE_SECRET=… JWT_SECRET=… pnpm run staging:preflight:gate` | 0 (PASS) | 0 ✓ |
| `opa.example.com` placeholder | same as above with `OPA_URL=http://opa.example.com:8181` | 2 (BLOCKED, OPA_URL missing) | unit-tested in `preflight.test.ts:rejects opa.example.com placeholder` ✓ |

## Device constraint disclosure

This branch was authored on a device that has **only PostgreSQL
client tools** (`psql`, `pg_isready`) — no `initdb`, no Docker, no
Redis. That means we cannot stand up a real local Postgres cluster
to dry-run the full integration suite from this device.

Per the standing rules ("do not fake readiness"), this PR therefore:

- **Does not** claim PR 3 / PR 4 / PR 5 evidence.
- **Does** ship the foundation those PRs need — preflight, generator,
  contract, exit-code semantics, docs, locked-in unit tests for the
  pure-function core.
- **Does** invite each subsequent phase PR to import `runPreflight`
  from `scripts/staging-foundation/preflight.ts` rather than
  re-implementing the env check.

## Standing rules check

- ☑ **Do not fake readiness.** Empty env still produces a BLOCKED
  exit with the exact unfilled-env list. The gate cannot be silently
  satisfied by a placeholder — opa.example.com is explicitly rejected.
- ☑ **Do not weaken any check.** The pre-existing
  `run-staging-integration-tests.ts` gate behaviour is preserved
  byte-for-byte from the user's perspective; we only swapped the
  inline checks for shared imports.
- ☑ **Do not change capsule architecture.** No capsule files touched.
- ☑ **Local unit tests must be clean without staging infra.** The 18
  new tests run under `pnpm run test:unit` against synthetic envs.
- ☑ **Staging tests must surface BLOCKED, not silent skip.** The gate
  exit code is 2 on missing required infra and the missing keys are
  named in the output.

## Validation chain

| Command | Result |
|---------|--------|
| `pnpm run check` | TypeScript clean |
| `pnpm run check:architecture` | Boundaries / SQL / DB-ownership / coordinator / governance-actions / markdown-imports — all OK |
| `pnpm run check:wiring` | 0 findings |
| `pnpm run check:ports` | 11 declarations valid, 0 conflicts |
| `pnpm run check:awi` | 133 nodes, 124 edges, 0 cycles |
| `pnpm run check:frontend-modularity` | 0 failures, 0 baseline warnings |
| `pnpm run build` | Built; bundle within budget |
| `pnpm run test:unit` | 144 files passed, 23 skipped |
| `pnpm run staging:preflight:gate` | exit 2 on bare env (BLOCKED, as designed) |
| `pnpm run staging:preflight:gate` (full env) | exit 0 (PASS) |

## What unblocks next

PR 3 (DB isolation) can now `import { runPreflight, hasRealStagingDb }`
helpers and consume them rather than rolling its own checks. Same for
PRs 4–9.
