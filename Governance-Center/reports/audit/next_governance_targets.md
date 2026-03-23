# Next Governance Targets — Top 15 Highest-Risk Ungoverned Mutations

**Date:** 2026-02-24
**Status:** ALL 15 COMPLETED (Phase 5)
**Previous coverage:** 82/205 = 40%
**New coverage:** 97/205 = 47% (threshold ratcheted to 45%)

---

## Ranked by Risk Category

| # | Entrypoint | File | Line | Risk Category | Status |
|---|-----------|------|------|---------------|--------|
| 1 | `configureProvider` | `server/routers/llm-providers.ts` | 131 | external connection | GOVERNED (Phase 5) |
| 2 | `deleteProviderCredentials` | `server/routers/llm-providers.ts` | 181 | secret lifecycle | GOVERNED (Phase 5) |
| 3 | `create` (provider) | `server/providers/router.ts` | 83 | external connection | GOVERNED (Phase 5) |
| 4 | `update` (provider) | `server/providers/router.ts` | 161 | external connection | GOVERNED (Phase 5) |
| 5 | `delete` (provider) | `server/providers/router.ts` | 197 | external connection | GOVERNED (Phase 5) |
| 6 | `testConnection` | `server/providers/router.ts` | 220 | external connection | GOVERNED (Phase 5) |
| 7 | `stageTransition` | `server/governance/router.ts` | 533 | lifecycle transitions | GOVERNED (Phase 5) |
| 8 | `driftToggle` | `server/governance/router.ts` | 636 | policy mutation | GOVERNED (Phase 5) |
| 9 | `approve` (catalog) | `server/routers/catalog-manage.ts` | 498 | lifecycle transitions | GOVERNED (Phase 5) |
| 10 | `reject` (catalog) | `server/routers/catalog-manage.ts` | 602 | lifecycle transitions | GOVERNED (Phase 5) |
| 11 | `activate` (catalog) | `server/routers/catalog-manage.ts` | 622 | lifecycle transitions | GOVERNED (Phase 5) |
| 12 | `publish` (catalog) | `server/routers/catalog-manage.ts` | 689 | deployment | GOVERNED (Phase 5) |
| 13 | `recall` (catalog) | `server/routers/catalog-manage.ts` | 937 | deployment | GOVERNED (Phase 5) |
| 14 | `startTraining` | `server/routers/llm-creation.ts` | 382 | automation | GOVERNED (Phase 5) |
| 15 | `startQuantization` | `server/routers/llm-creation.ts` | 590 | automation | GOVERNED (Phase 5) |

---

## Risk Category Distribution (All Resolved)

| Category | Count | Status |
|----------|-------|--------|
| External connection | 5 | All governed |
| Secret lifecycle | 1 | Governed |
| Lifecycle transitions | 4 | All governed |
| Deployment | 2 | All governed |
| Policy mutation | 1 | Governed |
| Automation | 2 | All governed |

---

## Phase 5 Summary

- **Mutations governed:** 15
- **Files modified:** 5 router files + coverage-map threshold
- **Threshold ratcheted:** 30% → 45%
- **New total governed:** 97/205 = 47%
