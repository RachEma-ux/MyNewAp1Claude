# Governance Freeze — Release v1.0.0-governance-locked

| Field | Value |
|-------|-------|
| **Tag** | `v1.0.0-governance-locked` |
| **Date** | 2026-03-22 |
| **Status** | FROZEN |
| **Scope** | AI Types governance: Agents, LLMs, Models, Bots, Providers |

---

## What Is Frozen

### Source Files (7 governed modules)
All carry the `GOVERNANCE CONTRACT (LOCKED)` header:

| File | Role |
|------|------|
| `server/catalog/availability.ts` | Shared availability authority |
| `server/routers/catalog-manage.ts` | Catalog intake + lifecycle |
| `server/routers/agents.ts` | Agent domain router |
| `server/routers/llm.ts` | LLM domain router |
| `server/routers/models.ts` | Model domain router |
| `server/routers/bots.ts` | Bot domain router |
| `server/routers/llm-providers.ts` | Provider domain router |

### Invariants (10 formal rules)

| ID | Rule |
|----|------|
| INV-01 | Availability = `status=active AND reviewState=approved` |
| INV-02 | Domain separation — source domains own their tables, not catalog_entries |
| INV-03 | Catalog intake ownership — only catalog-manage creates catalog_entries |
| INV-04 | App selectors show ONLY catalog-available entries |
| INV-05 | Agent execution requires entryType=agent + active + approved + published + callable |
| INV-06 | Domain deployable ≠ runtime authority |
| INV-07 | Structured FK (sourceType/sourceId) preferred over legacy config |
| INV-08 | Rejection is final — rejected entries never available |
| INV-09 | Terminal states (deprecated/disabled) block availability |
| INV-10 | All 11 invalid status/reviewState combinations are blocked |

### Enforcement Layers

| Layer | Mechanism | Location |
|-------|-----------|----------|
| Contract headers | `GOVERNANCE CONTRACT (LOCKED)` in source | 7 governed files |
| CI test gate | 5-layer test pipeline | `.github/workflows/run-tests.yml` |
| Static guard | Forbidden pattern scanner | `scripts/governance/check-invariants.ts` |
| PR template | Governance impact checklist | `.github/pull_request_template.md` |
| CODEOWNERS | Owner approval required | `.github/CODEOWNERS` |
| Governance gate | Architecture boundary scan | `.github/workflows/governance-gate.yml` |
| Review guidelines | Rejection criteria for reviewers | `docs/governance/REVIEW_GUIDELINES.md` |

### Test Coverage at Freeze

| Layer | Path | Tests |
|-------|------|-------|
| Layer 1 — Contracts | `tests/contracts/` | 39 |
| Layer 2 — Governance | `tests/governance/` | 40 |
| Layer 3a — Scenarios | `tests/integration/ai-types/` | 7 scenarios |
| Layer 3b — DB Integrity | `tests/integration/runtime-db/` | 36 |
| Layer 4 — UI Selectors | `tests/ui/` | 22 |
| Static Guard | `scripts/governance/check-invariants.ts` | pattern scan |

Full matrix: `docs/testing/AI_TYPES_TEST_COVERAGE_MATRIX.md`

---

## Rules After Freeze

1. **No governance-critical file may be modified** without passing all 5 CI test layers + static guard
2. **CODEOWNERS** requires `@RachEma-ux` approval for all governed paths
3. **PR template** requires explicit governance impact disclosure
4. **Contract headers** must remain intact — removal is a merge-blocking violation
5. **New invariants** may be added but existing invariants may NOT be weakened or removed
6. **The availability rule** (`status=active AND reviewState=approved`) is immutable at this version

---

## How to Verify Freeze Integrity

```bash
# 1. Check all contract headers are present
grep -l "GOVERNANCE CONTRACT (LOCKED)" \
  server/catalog/availability.ts \
  server/routers/catalog-manage.ts \
  server/routers/agents.ts \
  server/routers/llm.ts \
  server/routers/models.ts \
  server/routers/bots.ts \
  server/routers/llm-providers.ts

# 2. Run static governance guard
npx tsx scripts/governance/check-invariants.ts

# 3. Run full test suite
npx vitest run tests/contracts/ tests/governance/ tests/integration/ tests/ui/

# 4. Verify CODEOWNERS protects governed paths
cat .github/CODEOWNERS
```
