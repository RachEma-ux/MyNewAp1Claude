# Next Governance Targets — Top 15 Highest-Risk Ungoverned Mutations

**Date:** 2026-02-24
**Current coverage:** 82/205 = 40%
**Remaining ungoverned:** 123 mutations

---

## Ranked by Risk Category

| # | Entrypoint | File | Line | Risk Category | Justification | Recommended Wrapper |
|---|-----------|------|------|---------------|---------------|-------------------|
| 1 | `configureProvider` | `server/routers/llm-providers.ts` | 146 | external connection | Stores provider API credentials; controls external service access | `governedProcedure` |
| 2 | `deleteProviderCredentials` | `server/routers/llm-providers.ts` | 183 | secret lifecycle | Removes stored credentials; irreversible data loss | `governedProcedure` |
| 3 | `create` (provider) | `server/providers/router.ts` | 92 | external connection | Creates new provider registration; establishes trust boundary | `governedProcedure` |
| 4 | `update` (provider) | `server/providers/router.ts` | 170 | external connection | Modifies provider config; can change routing behavior | `governedProcedure` |
| 5 | `delete` (provider) | `server/providers/router.ts` | 201 | external connection | Removes provider; can break dependent agents/workflows | `governedProcedure` |
| 6 | `testConnection` | `server/providers/router.ts` | 224 | external connection | Sends credentials to external service; network side-effect | `governedProcedure` |
| 7 | `stageTransition` | `server/governance/router.ts` | 540 | lifecycle transitions | Governs lifecycle stage changes; already has inline freeze check but no middleware gate | `governedProcedure` |
| 8 | `driftToggle` | `server/governance/router.ts` | 642 | policy mutation | Enables/disables drift detection; can disable safety monitoring | `governedAdminProcedure` |
| 9 | `approve` (catalog) | `server/routers/catalog-manage.ts` | 504 | lifecycle transitions | Approves catalog entry for production use; admin gate but no governance middleware | `governedAdminProcedure` |
| 10 | `reject` (catalog) | `server/routers/catalog-manage.ts` | 606 | lifecycle transitions | Rejects catalog entry; admin gate but no governance middleware | `governedAdminProcedure` |
| 11 | `activate` (catalog) | `server/routers/catalog-manage.ts` | 626 | lifecycle transitions | Activates catalog entry for live use | `governedAdminProcedure` |
| 12 | `publish` (catalog) | `server/routers/catalog-manage.ts` | 695 | deployment | Publishes catalog bundle; makes artifacts available to all users | `governedAdminProcedure` |
| 13 | `recall` (catalog) | `server/routers/catalog-manage.ts` | 941 | deployment | Recalls published entry; affects running systems | `governedAdminProcedure` |
| 14 | `startTraining` | `server/routers/llm-creation.ts` | 394 | automation | Initiates model training job; resource-intensive, potentially costly | `governedProcedure` |
| 15 | `startQuantization` | `server/routers/llm-creation.ts` | 601 | automation | Initiates model quantization; resource-intensive operation | `governedProcedure` |

---

## Risk Category Distribution (Ungoverned)

| Category | Count | Severity |
|----------|-------|----------|
| External connection | 6 | Critical |
| Secret lifecycle | 0 (fixed in Phase 4) | Critical |
| Lifecycle transitions | 4 | High |
| Deployment | 2 | High |
| Policy mutation | 1 | High |
| Automation | 2 | Medium |

---

## Notes

- Secrets lifecycle (create/update/delete) was addressed in this phase
- Agent lifecycle transitions (admitToSandbox/promote/disable) were addressed in this phase
- Discovery ops admin operations (markInReview/accept/reject/cleanup) were addressed in this phase
- catalog-manage.ts has governance on authoring ops but NOT on authority ops (approve/reject/activate/publish/recall) — these use `adminProcedure` without governance middleware
- governance/router.ts `stageTransition` has inline freeze checks but lacks the `governedProcedure` middleware gate — inconsistent enforcement path
