# Plan v3 PMB — Test Outputs

**Captured:** 2026-05-04 against main@8517385 (post-Phase 45).

Combined run across the 16 PMB-relevant test files.

---

## Combined PMB test suite

```
$ npx vitest run \
    server/agent-studio/bindings.test.ts \
    server/openrouter/model-access/execute.test.ts \
    server/agent-studio/services/test-run-binding.test.ts \
    server/agent-studio/services/chat-binding.test.ts \
    server/agent-studio/services/export-catalog.test.ts \
    server/agent-studio/services/export-eligibility.test.ts \
    server/agent-studio/services/governance-adapter.test.ts \
    server/agent-studio/services/readiness.test.ts \
    server/agent-studio/services/catalog-sync-subscribers.test.ts \
    server/ai-types/import-from-agent-studio.test.ts \
    server/ai-types/register.test.ts \
    server/ai-types/legacy-import.test.ts \
    server/ai-types/catalog-schema.test.ts \
    tests/pmb/boundary.test.ts \
    tests/pmb/wiring.test.ts \
    tests/pmb/runtime-coverage.test.ts

 Test Files  16 passed (16)
      Tests  222 passed (222)
   Duration  ~68s
```

---

## Per-file breakdown

| File | Tests | Phase landed |
|---|---:|---|
| `server/agent-studio/bindings.test.ts` | (binding lifecycle) | Phase 11–12 |
| `server/openrouter/model-access/execute.test.ts` | (D4 facade) | Phase 4 |
| `server/agent-studio/services/test-run-binding.test.ts` | 10 | Phase 16 |
| `server/agent-studio/services/chat-binding.test.ts` | (chat-binding wiring) | Phase 16 |
| `server/agent-studio/services/export-catalog.test.ts` | 31 | Phases 30 + 41 |
| `server/agent-studio/services/export-eligibility.test.ts` | (9-gate verdict) | Phase 31 |
| `server/agent-studio/services/governance-adapter.test.ts` | (export verdict) | Phase 27 |
| `server/agent-studio/services/readiness.test.ts` | 5 | Phase 28 |
| `server/agent-studio/services/catalog-sync-subscribers.test.ts` | 15 | Phase 40 |
| `server/ai-types/import-from-agent-studio.test.ts` | 10 | Phase 36 |
| `server/ai-types/register.test.ts` | 16 | Phases 25 + 38 + 39 |
| `server/ai-types/legacy-import.test.ts` | (classifier + reconcile) | Phase 24 |
| `server/ai-types/catalog-schema.test.ts` | 6 | Phase 23 |
| `tests/pmb/boundary.test.ts` | 12 | Phase 42 |
| `tests/pmb/wiring.test.ts` | 13 | Phase 43 |
| `tests/pmb/runtime-coverage.test.ts` | 33 | Phase 44 |

**Total:** 222 tests, all green.

---

## Notable expected stderr lines

These are intentional test exercises of the best-effort error
paths — not failures. They appear in the run output and are
documented here so future readers don't mistake them for
regressions:

```
[register] event 'aiTypes.catalog.registered' failed for entry 999: event bus down
   ↑ register.test.ts Phase 39 — verifies bus failures don't block the register

[register] audit event 'catalog.register.created' failed for entry 999: audit DB down
   ↑ register.test.ts Phase 38 — verifies audit failures don't block the register

[reconcile-sync] repair failed for agent 1 (missing_registered): ASDB write failed
   ↑ export-catalog.test.ts Phase 41 — verifies one repair failure doesn't stop scan
```

All three test cases assert `expect(...).toBe(...)` after the
expected-failure stderr; the framework treats them as passes.
