# AI Types Test Coverage Matrix

| Field | Value |
|-------|-------|
| **Version** | v2.0.0 |
| **Date** | 2026-03-22 |
| **Total Test Files** | 18 |
| **Total Invariants** | 10 |
| **Coverage** | 100% invariant coverage across all 7 layers |

---

## Core Invariants

| ID | Invariant | Description |
|----|-----------|-------------|
| INV-01 | Availability rule | Only `status=active AND reviewState=approved` entries are available for app use |
| INV-02 | Domain separation | Source domains create entities in their OWN table, never in `catalog_entries` |
| INV-03 | Catalog intake ownership | Catalog intake starts from Catalog, not from source domains |
| INV-04 | App selector authority | App selectors show ONLY Catalog-available entries |
| INV-05 | Agent execution gates | Execution requires: entryType=agent + active + approved + published + callable |
| INV-06 | Domain ≠ runtime | Domain deployable status does NOT grant runtime authority |
| INV-07 | FK resolution priority | Structured FK (sourceType/sourceId) preferred over legacy config |
| INV-08 | Rejection is final | Rejected entries are NEVER available regardless of status |
| INV-09 | Terminal states block | Deprecated/disabled entries are NOT available |
| INV-10 | Exhaustive blocking | All 11 invalid status/reviewState combinations are correctly blocked |

---

## Test Layers

### Layer 1 — Contract Tests (`tests/contracts/`)

| File | Tests | Invariants |
|------|-------|------------|
| `domain-contracts.test.ts` | 12 | INV-02 |
| `catalog-contracts.test.ts` | 19 | INV-01, INV-03, INV-10 |
| `runtime-contracts.test.ts` | 8 | INV-01, INV-05, INV-06 |

### Layer 2 — Governance Blocking Tests (`tests/governance/`)

| File | Tests | Invariants |
|------|-------|------------|
| `governance-blocking.test.ts` | 18 | INV-01, INV-02, INV-05, INV-06, INV-07, INV-10 |
| `negative-paths.test.ts` | 22 | INV-01, INV-04, INV-06, INV-08, INV-09 |

### Layer 3 — DB Integrity Tests (`tests/integration/runtime-db/`)

| File | Tests | Invariants | DB Required |
|------|-------|------------|-------------|
| `catalog-lifecycle.db.test.ts` | 6 | INV-01 | Yes |
| `catalog-availability.db.test.ts` | 16 | INV-01, INV-10 | Yes |
| `runtime-authority.db.test.ts` | 8 | INV-01, INV-07 | Yes |
| `fk-migration-safety.db.test.ts` | 6 | INV-07 | Yes |
| `helpers/db-harness.ts` | — | (harness) | — |

### Layer 4 — Cross-Domain Workflow Tests (`tests/integration/ai-types/`)

| File | Scenario | AI Types |
|------|----------|----------|
| `scenario-customer-support-bot.test.ts` | S1: Bot Launch | Provider, Model, LLM, Agent, Bot |
| `scenario-research-assistant.test.ts` | S2: Research LLM | Model, LLM, Agent |
| `scenario-provider-rotation.test.ts` | S3: Provider Swap | Providers, Models, LLMs |
| `scenario-bot-governance-failure.test.ts` | S4: Bot Failure | Bot, Agent, LLM |
| `scenario-fk-migration.test.ts` | S5: FK Migration | All 5 domains |

### Layer 5A — Intake Selector Tests (`tests/ui/catalog-intake/`)

| File | Tests | Invariants |
|------|-------|------------|
| `intake-selectors.test.ts` | 9 | INV-03, INV-06 |

### Layer 5B — Catalog App Selector Tests (`tests/ui/catalog-selectors/`)

| File | Tests | Invariants |
|------|-------|------------|
| `catalog-app-selectors.test.ts` | 13 | INV-04, INV-06 |

### Layer 6 — Runtime Integration Tests (`tests/integration/runtime/`)

| File | Tests | Invariants |
|------|-------|------------|
| `catalog-lifecycle.test.ts` | 5 | INV-01 |
| `governance-authority.test.ts` | 10 | INV-01, INV-05, INV-10 |
| `catalog-state.test.ts` | 12 | INV-01 |

---

## Real-World Scenario Coverage

| Scenario | Narrative | Invariants Tested |
|----------|-----------|-------------------|
| S1 — Customer Support Bot | Full 5-domain lifecycle to production | INV-01 to INV-06 |
| S2 — Research Assistant | LLM pipeline with runtime blocking | INV-01, INV-03, INV-06 |
| S3 — Provider Rotation | Old provider decommissioned, new one activated | INV-01, INV-04, INV-09 |
| S4 — Bot Governance Failure | Activation blocked before approval | INV-01, INV-08, INV-10 |
| S5 — FK Migration Safety | Legacy + structured FK coexistence | INV-07 |

---

## Status/ReviewState Exhaustive Matrix

| Status | needs_review | approved | rejected |
|--------|-------------|----------|----------|
| draft | BLOCKED | BLOCKED | BLOCKED |
| active | BLOCKED | **AVAILABLE** | BLOCKED |
| deprecated | BLOCKED | BLOCKED | BLOCKED |
| disabled | BLOCKED | BLOCKED | BLOCKED |

Tested in: `governance-blocking.test.ts`, `catalog-availability.db.test.ts`

---

## Invariant Coverage Depth

| Invariant | Contract | Governance | DB | Scenario | Selector | Runtime | Total |
|-----------|----------|------------|-----|----------|----------|---------|-------|
| INV-01 | 10 | 6 | 22 | 8 | 2 | 27 | **75** |
| INV-02 | 6 | 2 | — | 1 | — | — | **9** |
| INV-03 | 3 | — | — | 2 | 5 | — | **10** |
| INV-04 | 2 | 4 | — | 4 | 6 | — | **16** |
| INV-05 | 5 | 5 | — | 1 | — | 5 | **16** |
| INV-06 | 3 | 4 | — | 3 | 3 | — | **13** |
| INV-07 | — | 1 | 6 | 6 | — | — | **13** |
| INV-08 | — | 5 | — | 2 | — | — | **7** |
| INV-09 | — | 5 | 2 | 2 | — | — | **9** |
| INV-10 | 1 | 1 | 12 | 1 | — | 1 | **16** |

---

## CI Configuration

**Workflow**: `.github/workflows/run-tests.yml`

```yaml
services:
  postgres:
    image: postgres:16
    env:
      POSTGRES_USER: testuser
      POSTGRES_PASSWORD: testpass
      POSTGRES_DB: testdb
    ports:
      - 5432:5432

steps:
  - name: Apply schema
    run: npx drizzle-kit push --force
    env:
      DATABASE_URL: postgres://testuser:testpass@localhost:5432/testdb

  - name: Run tests
    run: npx vitest run tests/ --reporter=verbose
    env:
      DATABASE_URL: postgres://testuser:testpass@localhost:5432/testdb
```

DB-backed tests use `describe.runIf(hasDb)` — skip when no DATABASE_URL.

---

## Remaining Gaps

| Gap | Reason | Mitigation |
|-----|--------|------------|
| E2E browser tests | No Playwright/Cypress in repo | Structural tests verify component contracts |
| Live tRPC router tests | Requires full server startup in test | Contract tests verify function-level behavior |
| OPA policy integration | OPA not available in CI | Policy scoring tested via contract assertions |
| Concurrent access races | Requires multi-connection harness | DB constraints provide safety net |
