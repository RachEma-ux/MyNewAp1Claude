# ADR: Register name-based identity for self-registered system agents

**Status:** Proposed (Phase 37.0).
**Captured:** 2026-05-08.
**Supersedes:** Phase 25's strict sealed-identity invariant `(sourceType, sourceId)` numeric-only; relaxes to "exactly one of sourceId/sourceName, dispatcher uses whichever is present."
**Tracking:** **PMT self-registration identity mismatch** architectural exception (named in `docs/evidence/provider-model-binding/PHASE_34_CLOSURE_REPORT.md`).

---

## Context

Phase 34's caller-body audit surfaced that PMT agents (`server/modules/pmt/context-translator-agent.ts` + `idea-builder-agent.ts`) are **self-registered system agents** identified by `name === AGENT_CATALOG_ID` (a constant string per agent). They have no domain-table row, no numeric `sourceId`. Phase 25's `aiTypes.catalog.register` action requires `sourceType + sourceId` (numeric) per its sealed-identity invariant — there's no clean way to map "name-based system agent" onto that input contract.

§34 paused-and-surfaced the migration; PMT agents stayed on direct `createCatalogEntry` (intra-platform, boundary-lint compliant). The architectural exception was named **"PMT self-registration identity mismatch"** with future scope: **"PMB Phase X — register name-based identity for self-registered system agents"** + ADR.

This is that ADR.

## Decision

**Extend `RegisterCatalogEntryInput` to accept either `sourceId` (numeric) or `sourceName` (string), with "exactly one of" validation.** The duplicate guard dispatches by whichever is present.

Updated input shape:

```ts
export interface RegisterCatalogEntryInput {
  entryType: string;
  sourceType: string;
  /** Numeric source-of-record id. Required for domain-backed entries; omit for self-registered system agents. */
  sourceId?: number;
  /** String source-of-record key. Required for self-registered system agents (e.g. PMT context-translator); omit for domain-backed entries. */
  sourceName?: string;
  fields: Omit<InsertCatalogEntry, "entryType" | "sourceType" | "sourceId">;
  registeredBy: number;
  // ... existing fields unchanged
}
```

`registerCatalogEntry` validates "exactly one of `sourceId`/`sourceName`" at top of function; throws if neither or both.

The duplicate guard (`checkDuplicateLegacyImport`) gains a parallel signature:

```ts
checkDuplicateLegacyImport(db, { sourceType, sourceId? , sourceName? })
```

- When `sourceId` is provided: existing behavior unchanged. Three possible outcomes: `would_duplicate_legacy`, `modern_row_update_path`, `no_existing_row`.
- When `sourceName` is provided: skip legacy-import lookup (legacy imports always had numeric IDs from domain tables; self-registered agents have no legacy concept). Look up modern row by `(sourceType, name === sourceName)`. Two outcomes: `modern_row_update_path` or `no_existing_row`.

## Phase 25 invariant after redesign

The original Phase 25 invariant (verbatim): "every register call must have a source-of-record numeric ID for duplicate detection."

The Phase 37 invariant: **"every register call must have a source-of-record (numeric `sourceId` for domain-backed entries, or string `sourceName` for self-registered system agents); the duplicate guard uses whichever is present."**

Strictly weaker than the original, but **explicit**. The downgrade is justified by:

1. The original invariant was tighter than reality — PMT agents existed before Phase 25 and had no domain row to provide a numeric ID. Phase 25's invariant was implicitly assuming "all catalog entries have domain backing," which §34 surfaced as wrong.
2. The relaxation is bounded — exactly two shapes (numeric or string), not arbitrary identity types.
3. Backwards compatibility — every existing numeric-ID caller (Phases 32, 34) continues to work unchanged.

## Alternatives considered

### Alt 1 — Separate canonical action `aiTypes.catalog.registerSystemAgent`

**Rejected.** Two canonical actions for catalog writes:

- Pros: preserves Phase 25 strict invariant; clean shape per action; smaller diff per action.
- Cons: inflates manifest surface; forces caller-side branching ("do I have a domain row? choose action accordingly"); duplicates audit + event emission infrastructure (or requires factoring out a shared internal helper that becomes the *real* canonical, just with two thin wrappers).

The single-canonical-with-conditional-input is the more discoverable shape. Future readers find ONE canonical write path; the dispatcher logic is encapsulated.

### Alt 2 — Synthetic identity (`sourceId: 0` sentinel + `sourceType: "self_registered"`)

**Rejected.** **Synthetic-identity anti-pattern** explicitly called out in:

- §34 lesson #3: "Synthetic identity values are an anti-pattern. Tempting alternatives like `sourceId: 0` (sentinel) or `sourceId: hash(name)` would have allowed PMT to fit register's input shape. They hide the architectural mismatch."
- §35 lesson #3: "Pause-and-surface scales. Pause-and-surface is now the standing pattern."

Synthetic identity values hide the architectural mismatch from future readers. Document the asymmetry explicitly via the `sourceName` field instead.

### Alt 3 — Don't migrate; keep PMT as a documented permanent exception (like `catalog-manage-bespoke-publish-machinery`)

**Rejected.** The §34 closure proposed a future scope explicitly because PMT is a generalizable case (any future self-registered system agent will hit the same wall). Solving it once at the canonical level prevents N future "Phase Y — second self-registered agent" deferrals. catalog-manage's bespoke layers are workflow logic that doesn't generalize — that's why it's permanent. PMT's name-identity is a generic primitive that does.

## Implementation

Phase 37.1 will:

- Extend `RegisterCatalogEntryInput` with `sourceId?` + `sourceName?` (relaxing `sourceId: number` requirement).
- Validate "exactly one" at top of `registerCatalogEntry`.
- Extend `checkDuplicateLegacyImport` to accept the union shape and dispatch accordingly.
- Update `CatalogRegisteredPayload.sourceRefId` to accept numeric or string.
- Add unit tests for the name-path (guard + register).

Phase 37.2/37.3 will migrate the two PMT agents:

```ts
// Migration shape:
const result = await gatewayCall<RegisterCatalogEntryInput, RegisterCatalogEntryResult>({
  ctx: {
    sourceModule: "pmt",
    targetModule: "aiTypes",
    actionKey: "aiTypes.catalog.register",
    governanceReceiptId: `pmt-context-translator-bootstrap-${AGENT_CATALOG_ID}-${Date.now()}`,
    actorId: 0, // system actor
  },
  input: {
    entryType: "agent",
    sourceType: "self_registered_agent",
    sourceName: AGENT_CATALOG_ID,  // ← name-path
    fields: { /* same as direct createCatalogEntry */ },
    registeredBy: 0,
    sourceModule: "pmt",
  },
});
```

The find-or-update pre-flight in PMT stays — its runtime-config-drift patching is more granular than register's "modern row update" semantics. Register is called only in the `no_existing_row` path of the existing pre-flight.

## Consequences

### Positive

- PMT migrates to canonical write path; all catalog-write call sites flow through `aiTypes.catalog.register`.
- Future self-registered system agents (any module that needs to register a name-keyed system agent) reuse the established pattern.
- Architectural-exception register reaches finalist state — only one permanent exception (`catalog-manage-bespoke-publish-machinery`) remains.

### Neutral

- Phase 25 sealed-identity invariant is weakened (but explicitly documented in this ADR).
- Duplicate guard logic gets a second branch (cost: ~10 LOC).

### Negative

- Two input shapes for `RegisterCatalogEntryInput`. "Exactly one of" validation is the cost of the unified canonical.

## `sourceType` convention

Self-registered system agents use `sourceType: "self_registered_agent"`. This is an explicit type marker that:

- Distinguishes from domain-backed agent entries (`sourceType: "agent"`)
- Signals to the duplicate guard that the name-path is in effect
- Future system-agent registrations (PS Wizard, project-context translator, etc.) reuse this marker

If a future caller has a different "self-registered" semantic that doesn't fit `self_registered_agent`, it can introduce its own marker (`self_registered_workflow`, etc.). The pattern generalizes without requiring further canonical changes.

---

## Cross-references

- `docs/evidence/provider-model-binding/PHASE_34_CLOSURE_REPORT.md` — original surfacing of the mismatch.
- `docs/architecture/provider-model-binding/PHASE_37_EXECUTION_PLAN.md` — implementation plan.
- `server/ai-types/register.ts` — handler being extended.
- `server/ai-types/legacy-import.ts` — duplicate guard being extended.
- `server/modules/pmt/context-translator-agent.ts` — first PMT caller to migrate.
- `server/modules/pmt/idea-builder-agent.ts` — second PMT caller to migrate.
