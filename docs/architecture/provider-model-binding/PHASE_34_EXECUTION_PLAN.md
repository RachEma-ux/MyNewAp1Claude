# Phase 34 — Execution Plan

**Captured:** 2026-05-07 against `main@ca5b3c8` (post-Phase-33 closure).
**Branch (this doc):** `docs/pmb-phase-34-0-execution-plan`.
**Owner:** Planner role per AGENTS.md; full autonomous-execution authority granted by user 2026-05-07 standing instruction (continuous phase execution after each closure).

---

## 1. Why Phase 34 exists

Phase 32's closure report listed 3 catalog-write call-sites as **explicitly out-of-scope** for that migration: `server/modules/pmt/context-translator-agent.ts`, `server/modules/pmt/idea-builder-agent.ts`, and `server/sandbox-wf/seed-orchestrator.ts`. They use the same direct `createCatalogEntry` pattern Phase 32 migrated for the 5 `<domain>.importToCatalog` mutations, but were deferred because:

1. **PMT agents** are boot-time system-actor self-registrations (different actor shape than user-driven UI mutations).
2. **PMT agents** use real taxonomy classifications (via `resolveTaxonomyNodeIds`), not the auto-classify-first-axis heuristic that Phase 32 dropped.
3. **sandbox-wf seed** is dev-only fixture loading; production never runs it.

Phase 34 closes these out. The migration shape is a pragmatic variant of Phase 32's: replace `createCatalogEntry` with `gatewayCall("aiTypes.catalog.register", ...)`, **keep** `setEntryClassifications` (the real-taxonomy classifications are an intra-platform write that public-api permits), drop the custom `agent_registered` audit event (no consumers — audit-confirmed), keep idempotency via the existing find-or-create pre-flight.

Phase 34 is **NOT** a new D1-violation closure phase. The boundary lint stays in strict mode; no exceptions added; no surfaces changed beyond the 3 files.

---

## 2. Pre-flight audit findings (in this PR's §2)

### Custom audit event consumers

```
=== PMT custom event types ===
server/modules/pmt/idea-builder-agent.ts:685:        eventType: "agent_registered",
server/modules/pmt/context-translator-agent.ts:1268:    eventType: "agent_registered",

=== Consumers of those event types (excluding emitter directories) ===
(zero matches)
```

**Zero downstream consumers** filter on `agent_registered`. Same finding pattern as Phase 32. Behavior preservation is mechanical — register's canonical `catalog.register.created` event replaces the legacy custom event without breaking anyone.

### Real taxonomy classifications

PMT agents call `resolveTaxonomyNodeIds()` (a per-agent helper that returns specific node IDs by walking the taxonomy tree) and pass the result to `setEntryClassifications`. This is not the auto-classify-first-axis heuristic Phase 32 dropped — it's intentional, semantic classification. Preserve this call after the gateway register.

### Sandbox-wf seed: register + publish

`seed-orchestrator.ts:186-234` does both `createCatalogEntry` + `createPublishBundle`. The platform exposes `aiTypes.catalog.register` (Phase 25) and `aiTypes.catalog.publish` (Phase 30) as separate gateway actions. For Phase 34 minimal scope, migrate the register call only; keep `createPublishBundle` as a direct intra-platform call. Migrating publish to gateway is a follow-up if needed (the migration's value is full symmetry vs. mechanical risk; the latter is currently zero so we accept the asymmetry).

### Idempotency invariant

Both PMT agents have a "find-or-update existing" pre-flight (e.g., `context-translator-agent.ts:1180-1191`):

```ts
const found = existingEntries.find(e => e.name === AGENT_CATALOG_ID);
if (found) {
  // re-classify if needed; return existing.id
  return found.id;
}
```

Like Phase 32's `<domain>.importToCatalog` migration, the legacy "no-op-on-duplicate-with-classification-refresh" semantics differ from register's "update-on-duplicate" semantics. Preserve the find-or-update pre-flight; only call register when no row exists.

---

## 3. Sub-phase decomposition

### 34.0 — Plan freeze (this PR)

- [ ] Land `PHASE_34_EXECUTION_PLAN.md` (this doc).
- [ ] Memory: create `project_phase_34_authority.md`; `MEMORY.md` index update.
- [ ] **Acceptance:** doc lands; CI 5/5 green.

### 34.1 — Bulk migration of 3 catalog-write callers

Single PR; the 3 files share the shape "find existing → if missing, create via canonical register → continue with intra-platform writes (classify / publish)."

- [ ] **Per file**, replace the `createCatalogEntry({...})` call with:
  ```ts
  const result = await gatewayCall<RegisterCatalogEntryInput, RegisterCatalogEntryResult>({
    ctx: {
      sourceModule: "pmt" /* or "sandbox-wf" */,
      targetModule: "aiTypes",
      actionKey: "aiTypes.catalog.register",
      governanceReceiptId: `<source>-bootstrap-${name}-${Date.now()}`,
      actorId: 1,  // system actor (PMT bootstrap path; sandbox-wf seed)
    },
    input: {
      entryType: "agent",
      sourceType: "agent",
      sourceId: <agent.id>,
      fields: {/* same fields as legacy createCatalogEntry call */},
      registeredBy: 1,
      sourceModule: "pmt" /* or "sandbox-wf" */,
    },
  });
  const entry = await getCatalogEntryById(result.entryId);
  ```
- [ ] **Drop** the custom `createCatalogAuditEvent({eventType: "agent_registered"})` calls in PMT agents (zero consumers).
- [ ] **Keep** `setEntryClassifications(entry.id, nodeIds)` calls AFTER register — real-taxonomy classifications, intra-platform write, public-api permits this.
- [ ] **Keep** `createPublishBundle` in sandbox-wf — intra-platform write; migrating to gateway publish is a follow-up.
- [ ] **Receipt sourcing:** deterministic system-actor IDs (no user actor in these flows). Pattern: `<sourceModule>-bootstrap-<resource>-${Date.now()}`.
- [ ] **Acceptance:** the 3 files no longer call `createCatalogEntry` directly; existing tests pass; `tsc --noEmit` clean; CI 5/5 green.
- [ ] **Estimate:** 1 PR, ~120 LOC removed, ~80 LOC added (similar to Phase 32's −53 LOC net).
- [ ] **Pause if:** any caller has a state-transition gate that doesn't fit register's flow — surface and decide.

### 34.2 — Closure report

- [ ] Author `docs/evidence/provider-model-binding/PHASE_34_CLOSURE_REPORT.md`.
- [ ] Update memory: `project_phase_34_authority.md` → CLOSED; `project_pmb_phase_34_complete.md` created with PR ledger + carry-forward lessons; `MEMORY.md` index update.
- [ ] **Acceptance:** all 3 PRs merged; CI fingerprint stable.
- [ ] **Estimate:** 1 PR, ~150 LOC docs.

---

## 4. Decision matrix

Cap: **zero new TEMPORARY_EXCEPTION_WITH_DEADLINE entries.**

| # | Item | Decision | Sub-phase | Risk |
|---|---|---|---|---|
| 1 | Bulk vs per-file PRs | **Bulk** — same shape × 3; consistent diff easier to review | 34.1 | Low |
| 2 | `setEntryClassifications` post-register | **Keep** — real taxonomy classifications, intra-platform write | 34.1 | Low |
| 3 | Custom `agent_registered` event | **Drop** — zero consumers | 34.1 | Low |
| 4 | `createPublishBundle` in sandbox-wf | **Keep direct** — gateway publish migration is a separate concern | 34.1 | Low |
| 5 | Receipt sourcing for system actors | **Deterministic ID** `<source>-bootstrap-<resource>-${Date.now()}` | 34.1 | Low |
| 6 | Idempotency: find-or-update pre-flight | **Preserve** — same as Phase 32; register's "update-on-duplicate" differs from legacy "no-op" | 34.1 | Low |
| 7 | sandbox-wf in scope | **Yes** — dev-only but worth ONE codebase pattern | 34.1 | Low — production never runs sandbox-wf |

---

## 5. Test strategy

### Per sub-phase

- **34.0 (this):** docs only.
- **34.1 (migration):** `tsc --noEmit`; existing tests cover migrated paths (PMT agents have integration coverage; sandbox-wf seed has fixture-load tests).
- **34.2 (closure):** docs only.

### Cross-cutting

- **CI fingerprint:** Phase 34 baseline is **5/5 green** at `ca5b3c8`. No matrix-shape changes.

---

## 6. Sizing

| Sub-phase | PRs | LOC code | LOC docs |
|---|---|---|---|
| 34.0 (this) | 1 | — | ~150 |
| 34.1 (migration) | 1 | -40 net (~120 removed, ~80 added) | ~10 |
| 34.2 (closure report) | 1 | — | ~150 |
| **Total** | **3** | **-40 net** | **~310** |

Smaller than Phase 32 (-53 LOC) because PMT classifications stay vs. Phase 32 dropping the auto-classify heuristic.

---

## 7. CI fingerprint expectation

Phase 34 baseline is **5/5 green** as of `ca5b3c8` (post-Phase-33.2 close-out). No changes expected.

---

## 8. Authority and pause conditions

**Authority:** full autonomous commit/push/merge for any PR scoped inside this plan. Phase 34 is the first phase under the **continuous-execution standing instruction** (memory: `feedback_continuous_phase_execution.md`) — picked autonomously after Phase 33 closed.

**Pause and surface for sign-off if:**

1. Any caller has bespoke state-transition logic that doesn't fit register's canonical flow.
2. Idempotency semantics in PMT agents need different handling than Phase 32's pre-flight pattern.
3. Custom `agent_registered` event turns out to have a downstream consumer the §2 audit missed.
4. Pre-existing red CI on a sub-phase PR not on the known-flaky-shard list.
