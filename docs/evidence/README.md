# Evidence Index — Production Readiness Verification

This index maps every evidence artifact captured for the
Production Readiness Verification Protocol run against
`main@86a1ffe` (post-PR #75, all 15 RTLMs migrated).

The full report is at
[`PRODUCTION_READINESS_VERIFICATION_REPORT.md`](./PRODUCTION_READINESS_VERIFICATION_REPORT.md).

## Snapshot

- **Branch under test:** `main`
- **Commit:** `86a1ffe4c2b5d17dad82fa81000ba4d8e7cee0d9`
- **Mode:** `production-readiness` (gate unblocked by 15 / 15 migration)
- **Run by:** Claude Opus 4.7 (verification only — no application code changed)

## Evidence files

Each file under `docs/evidence/commands/` follows the same shape:

```
# <command>
timestamp: <ISO-8601>
commit: 86a1ffe
command: <pnpm invocation>
---
<command output>
exit=<exit code>
```

| File | Phase | Command | Exit |
|---|---|---|---|
| `commands/check.txt` | 3 | `pnpm run check` (TypeScript) | 0 |
| `commands/check-modules.txt` | 3 | `pnpm run check:modules` | 0 |
| `commands/check-boundaries.txt` | 3 | `pnpm run check:boundaries` | 0 |
| `commands/check-sql-boundaries.txt` | 3 | `pnpm run check:sql-boundaries` | 0 |
| `commands/check-db-ownership.txt` | 3 | `pnpm run check:db-ownership` | 0 |
| `commands/check-coordinator-boundaries.txt` | 4 | `pnpm run check:coordinator-boundaries` | 0 |
| `commands/check-ports.txt` | 5 | `pnpm run check:ports` | 0 |
| `commands/check-architecture-full.txt` | 6 | `pnpm run check:architecture:full` | 0 |
| `commands/check-wiring.txt` | 7 | `pnpm run check:wiring` (7 sub-checks) | 0 |
| `commands/check-wiring-inventory.txt` | 7 | `pnpm run check:wiring-inventory` | 0 |
| `commands/check-awi.txt` | 7 | `pnpm run check:awi` | 0 |
| `commands/check-dependency-graph.txt` | 7 | `pnpm run check:dependency-graph` | 0 |
| `commands/check-module-readiness.txt` | 7 | `pnpm run check:module-readiness` | 0 |
| `commands/check-db-roles.txt` | 11 | `pnpm run check:db-roles` | 0 |
| `commands/check-governance-actions.txt` | 11 | `pnpm run check:governance-actions` | 0 |
| `commands/build.txt` | 12 | `pnpm build` | 0 |
| `commands/route-ownership-summary.txt` | 6 | `pnpm run generate:route-ownership-map` | 0 |
| `commands/test-capsules.txt` | 6, 7 | scoped vitest (15 capsule suites + AWI) | 0 |
| `commands/test-full.txt` | 8 (partial) | `pnpm run test` (full vitest) | 1 |

## Mechanized check tally

- 16 architecture / wiring / boundary / RBAC / governance / build commands: **all PASS** (exit 0)
- 1 baseline warning across all strict checks: KGRA Agent's nested baseRoute under Data Analysis (resolved by longest-first matching, expected)
- 1 full-suite vitest run: 3169 passing / 312 failing — failures triaged in the report
- 1 scoped capsule + AWI suite: 35 files / 809 tests / **100% pass**

## Live-environment gates not exercised on this device

- **DB**: no PostgreSQL running locally; integration tests that hit `mynewap1claude` / `asdb` / `ragdb` / `wfdb` BLOCKED
- **OPA**: `opa.example.com` is a placeholder hostname (no DNS resolution); policy-evaluation tests BLOCKED
- **Production secrets**: `ENCRYPTION_KEY`, `SECRETS_ENCRYPTION_KEY`, `COOKIE_SECRET`, `JWT_SECRET` not set in this shell; production-mode boot tests BLOCKED
- **Live UI**: no dev server / browser session run — Phases 8 / 9 / 10 BLOCKED

These BLOCKED states are environment, not code defects, and are
called out individually in the verification report.

## Sanitization

No file under `docs/evidence/commands/` contains secrets, tokens,
cookies, authorization headers, customer data, raw production
records, full DB dumps, or private keys. Every artifact is plain
command output. The `getaddrinfo ENOTFOUND opa.example.com`
strings that appear in `test-full.txt` are from the test suite's
placeholder hostname — not a real OPA endpoint.
