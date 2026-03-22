# AI Types Governance Standard

| Field   | Value |
|---------|-------|
| **Status**  | Locked (Governance Hardened) |
| **Version** | v1.0.0 |
| **Scope**   | All AI Types (Agents, LLMs, Models, Bots, Providers) |
| **Date**    | 2026-03-22 |

---

## 1. Core Invariant

The governance architecture enforces a strict three-layer separation:

```
Domain
  -> creates entity (agent, LLM, model, bot, provider)
  -> computes deployable status

Catalog
  -> owns intake (New Entry)
  -> owns candidate creation
  -> owns lifecycle (review -> publish -> activate)

Runtime
  -> ONLY from Catalog (approved + active entries)
```

No layer may assume the responsibilities of another. Domain entities are raw definitions. The Catalog is the single authority for lifecycle state. Runtime resolution depends exclusively on Catalog authority.

---

## 2. Rules (MUST / MUST NOT)

### MUST

| # | Rule |
|---|------|
| M1 | All imports start from Catalog -> New Entry |
| M2 | Catalog is the only creator of `catalog_entries` rows |
| M3 | Runtime authority is resolved only from Catalog (`server/catalog/availability.ts`) |
| M4 | Availability is determined by the shared helper `isCatalogEntryAvailableForAppUse()` |
| M5 | All lifecycle transitions (approve, publish, activate) go through `catalog-manage` router |
| M6 | All governance mutations produce a blocking audit event |
| M7 | Publishing creates an immutable snapshot bundle with SHA-256 hash |
| M8 | Domain routers use `governedProcedure` for all mutations |
| M9 | App-usage selectors consume ONLY the `catalogManage.available` endpoint |
| M10 | All AI Type domains use the same availability rule consistently |

### MUST NOT

| # | Rule |
|---|------|
| N1 | Domain routers MUST NOT create `catalog_entries` directly |
| N2 | Deployable status MUST NOT imply runtime-ready |
| N3 | App MUST NOT consume raw domain entities for AI binding |
| N4 | Runtime code MUST NOT check `status === "active"` without using the shared availability helper |
| N5 | Lifecycle transitions MUST NOT skip audit logging |
| N6 | Published bundles MUST NOT be mutated after creation |
| N7 | Agents/workflows MUST NOT import provider SDK clients directly |

---

## 3. Selector Types

Two distinct selector patterns exist and must not be confused:

### 3.1 Source Selectors (Catalog Intake)

- **Purpose**: Select domain entities eligible for import into the Catalog
- **Filter**: Domain entity is "deployable" (domain-specific readiness criteria)
- **Consumer**: Catalog import / `importToCatalog` mutations in domain routers
- **Authority**: Domain-level (e.g., model status = "ready" or "active")

### 3.2 Catalog Selectors (App Usage)

- **Purpose**: Select Catalog entries available for runtime / app usage
- **Filter**: `status === "active" AND reviewState === "approved"`
- **Consumer**: `catalogManage.available` endpoint; app-level selectors and pickers
- **Authority**: Catalog-level (`server/catalog/availability.ts`)

Source selectors determine what CAN enter the Catalog.
Catalog selectors determine what the app CAN use at runtime.

---

## 4. Availability Definition

An AI Type entry is **Catalog-available** if and only if:

```
status === "active"  AND  reviewState === "approved"
```

This rule is the single source of truth, defined in:

```
server/catalog/availability.ts
```

The module exports three interfaces:

| Export | Purpose |
|--------|---------|
| `checkCatalogAvailability()` | Detailed check returning `{ available, reasons }` |
| `isCatalogEntryAvailableForAppUse()` | Boolean shortcut |
| `CATALOG_AVAILABILITY_FILTERS` | DB-level filter constants for query pre-filtering |

All runtime availability checks MUST use one of these exports. No code may inline or duplicate the availability condition.

---

## 5. Runtime Authority Rule

**Only Catalog-approved + active entries are usable at runtime.**

The enforcement chain:

1. Domain creates entity and marks it deployable
2. `importToCatalog` creates a Catalog candidate (`status: "draft"`, `reviewState: "needs_review"`)
3. Admin reviews and approves (`reviewState: "approved"`)
4. Admin activates (`status: "active"`)
5. App-usage selectors query `catalogManage.available`, which applies `CATALOG_AVAILABILITY_FILTERS`
6. Only entries passing both conditions are returned

At no point may the app bypass steps 3-5 to use a raw domain entity directly.

---

## 6. Lifecycle States

```
draft -> active -> deprecated -> disabled
         ^                |
         |                v
         +--- (re-activate) ---+

Review states: needs_review -> approved | rejected
```

Full lifecycle to availability:

```
draft + needs_review  (candidate)
  -> approved         (review passed, still draft)
  -> published        (immutable bundle created, tag added)
  -> active           (status flipped)
  -> available        (active + approved = runtime-ready)
```

---

## 7. Test-Backed Guarantees

This architecture is enforced and validated by real-database integration tests:

```
tests/integration/runtime-db/
  catalog-availability.db.test.ts   — 4x3 matrix of all status/reviewState combos
  catalog-lifecycle.db.test.ts      — Full lifecycle: draft -> approved -> published -> active -> available
  runtime-authority.db.test.ts      — Runtime authority resolution, duplicate prevention, lineage integrity
  helpers/db-harness.ts             — Shared test harness with real PostgreSQL
```

These tests:
- Run against a real PostgreSQL database (CI PostgreSQL service)
- Validate every combination of `status` x `reviewState`
- Confirm availability toggles correctly through state transitions
- Verify cross-domain consistency (same rule for agents, models, bots, LLMs, providers)
- Test bundle lifecycle and version tracking
- Ensure deleted entries are excluded from availability queries

**CI enforcement**: These tests run in the `run-tests.yml` workflow and fail the build if any governance invariant is violated.

---

## 8. Key File References

| File | Role |
|------|------|
| `server/catalog/availability.ts` | Shared availability authority |
| `server/routers/catalog-manage.ts` | Catalog lifecycle router (intake, review, publish, activate) |
| `server/routers/agents.ts` | Agent domain router |
| `server/routers/llm.ts` | LLM domain router (reference implementation) |
| `server/routers/models.ts` | Model domain router |
| `server/routers/bots.ts` | Bot domain router |
| `server/routers/llm-providers.ts` | Provider registry router |
| `shared/catalog-state.ts` | Unified catalog state helper |
| `tests/integration/runtime-db/` | Governance invariant test suite |

---

## 9. Change Control

Any modification to the files listed above must:

1. Preserve all invariants defined in this document
2. Pass the runtime-db integration test suite
3. Pass the static governance invariant check (`scripts/governance/check-invariants.ts`)
4. Include a governance impact assessment in the PR description
5. Be reviewed against the criteria in `docs/governance/REVIEW_GUIDELINES.md`

This document is **LOCKED**. Changes require explicit architectural review and must not weaken any invariant.
