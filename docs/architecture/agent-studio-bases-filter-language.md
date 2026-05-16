# Agent Studio — Bases Filter Language

**Status:** Accepted (T-F.99 / T-F.2-filter-α, 2026-05-16)
**Owner:** Agent Studio V1+ track-F (Bases MVP)
**Scope:** Bases (`agsVaultSavedViews` rows with `viewKind="base"`)

## Context

The T-F.2 Bases MVP opening arc (PRs #1292–#1303) closed the operator
loop end-to-end: create → list (filtered) → inspect → use. The "use
the base" path (ζ slice, PR #1302) renders an inline preview of
notes matching the base's `filters` JSON, but only enforces the
single `folderId` key — the one filter `vault.listNotes` understands
today. Other JSON keys are surfaced in the β detail view and named
in the ζ honesty banner as "not yet enforced".

`agsVaultSavedViews.filters` was originally an opaque
`json("filters")` column with no server-side semantics — the
Phase 16 saved-view docblock states:

> Filters / sort / columns are stored as opaque JSON. The view-
> rendering layer (UI) decodes them; the service is unopinionated
> about shape so future view kinds can ship without DB churn.

This was the right call for Phase 16, where saved views were
operator-personal note-list configurations. Bases extends this with
a richer operator promise — a base is a **shared, named, persistent
filtered view** that any operator can apply consistently. That
promise needs the filter to be:

1. **Server-enforceable** — bases ship in workspace_shared form; the
   server must apply identical narrowing for every viewer, not just
   the operator who wrote the JSON.
2. **Operator-authorable** — operators (not just curators or
   developers) must be able to compose filters via UI without
   editing raw JSON.
3. **Evolvable** — new condition kinds (tag-equals, title-contains,
   updated-after) must land additively without breaking existing
   bases.
4. **Auditable** — the filter document must be readable by humans
   (in the β detail view + version history) and machines
   (server-side parser + permission filter post-application).

The opaque-JSON shape satisfies (4) trivially but blocks (1)–(3).

## Decision

**Adopt a typed declarative filter DSL.** Bases' `filters` column
will continue to be `json("filters")` at the DB layer, but every
write path will validate the payload against a versioned Zod schema
before persisting, and every read path will parse the payload back
into a typed `FilterDocument` before applying it.

### Schema (V1)

```ts
type FilterCondition =
  | { field: "folderId";         op: "eq";       value: number }
  | { field: "slug";             op: "eq";       value: string }
  | { field: "title";            op: "contains"; value: string }
  | { field: "governanceStatus"; op: "in";       value: string[] }
  | { field: "updatedAt";        op: "gte" | "lte"; value: string };
  // value for gte/lte is an ISO-8601 timestamp string

interface FilterDocument {
  readonly version: 1;           // schema version (Zod-locked)
  readonly conditions: readonly FilterCondition[]; // implicit AND
}
```

Initial condition kinds cover the practical V1 filter surface for
vault notes (id-eq, slug-eq, title-substring, status-in, time
window). All conditions in a single `FilterDocument` are AND-joined
implicitly. Empty `conditions` = match everything (no narrowing).

### Why each property

- **`version: 1` literal** — Zod schema asserts a literal version
  number, so future V2 schemas (with OR groups, NOT, nested
  conditions) can ship as `FilterDocument_v2` without breaking V1
  callers. Parser dispatches by version.
- **Discriminated union on `field` + `op`** — every condition is
  exactly one of N kinds. Zod's `z.discriminatedUnion("field", […])`
  is the canonical shape; adding a new field is one new union
  variant, fully type-safe at every call site.
- **Implicit AND, no `op: "and" | "or"` field at V1** — V1 ships
  AND-only for simplicity. V2 introduces `{ groups: ConditionGroup[] }`
  for nested AND/OR with explicit logical operators. Shipping AND-only
  first keeps the parser, UI, and server-side query builder all
  trivially testable.

### Persistence and migration

- Existing rows with opaque JSON `filters` remain readable. The
  parser returns `null` for any payload that doesn't validate
  against the V1 schema; the consumer (server-side query builder)
  treats `null` as "no narrowing applied".
- Legacy `{ folderId: number }` shape from pre-ADR T-F.98 is
  **explicitly admitted** by the V1 schema via the
  `field: "folderId", op: "eq"` condition, so ζ-preview already-
  shipped behavior is preserved without migration.
- A one-time backfill from legacy `{ folderId: N }` JSON into
  `{ version: 1, conditions: [{ field: "folderId", op: "eq", value: N }] }`
  is OUT OF SCOPE for this ADR — the parser handles both shapes
  transparently. Operators editing existing bases through the UI
  (next slice) will save the typed shape on first edit.

## Rationale (alternatives considered + why rejected)

### Alternative 1: Operator-blessed-but-opaque

> Curators (developers) author filter JSON; operators consume bases
> read-only.

- **Rejected.** Violates the Bases MVP acceptance "Bases MVP works
  (create / share / version)" — operators MUST be able to author,
  not just consume. The Phase 16 saved-views surface already lets
  operators author their own filters via the UI (the create-save-
  view path). Bases inheriting a weaker model would be a regression.

### Alternative 2: Raw JSON edit by power users

> Operators edit `filters` as a free-text JSON blob via a textarea in
> the UI; client-side `JSON.parse` validates syntax only.

- **Rejected.** Three problems: (1) JSON edit errors are silent —
  typoing `"folder_id"` instead of `"folderId"` leaves the base
  matching everything with no operator feedback, (2) the editor
  cannot offer field autocomplete, (3) shareability suffers — a
  workspace_shared base with malformed filters confuses every other
  operator who tries to use it. The raw-JSON shape is acceptable as
  an **escape hatch** in the V1.5+ admin UI, but not as the primary
  authoring path.

### Alternative 3: Server-side AST as primary persistence

> Parse the operator's UI input into an AST in the browser; persist
> the AST as JSON; never serialize back to a "filter language" form.

- **Rejected.** This is effectively what V1 does — but the framing
  matters. Calling it an "AST" suggests a richer surface (visitors,
  optimizers, plan trees) we don't need at V1. Calling it a "filter
  document" with a versioned schema and a flat list of conditions
  keeps the contract minimal. We can grow to AST shapes if V2's
  OR-groups demand it.

## Consequences

### Positive

- **Server-enforceable filters** unblock the ζ-preview full coverage
  (PR #1302's "not yet enforced" banner items become enforceable in
  follow-up slices).
- **UI filter editor** can land as a structured form (field picker
  + op picker + value input) instead of a raw-JSON textarea. Each
  condition is operator-friendly.
- **Type-safe migration path** to V2 (OR-groups, NOT, nested
  conditions) via `version: 2` schema dispatch.
- **Permission post-filter** can re-validate the filter document
  per-viewer if any condition kind needs viewer-scoped narrowing
  (e.g., `field: "ownerUserId"` would behave differently for
  workspace_shared bases).

### Negative

- **Schema evolution overhead** — every new condition kind requires
  (1) Zod schema variant, (2) server-side query builder update,
  (3) UI condition editor update, (4) ζ-preview enforcement update.
  V1 schema is intentionally narrow to amortize this cost.
- **Backwards compatibility** — the parser MUST tolerate both legacy
  `{ folderId: N }` and typed `{ version: 1, conditions: [...] }`
  shapes indefinitely. Removing the legacy shape requires a backfill
  migration (deferred to V2 or post-V2 schema bumps).
- **Type generation lock-in** — clients (the BasesPanel UI) import
  the typed schema, coupling client and server to a shared schema
  module. Mitigated by exporting only the Zod schema + inferred
  types from `server/agent-studio/services/vault/filter-language.ts`
  with no runtime dependencies.

## Implementation slices (forward-looking)

This ADR (T-F.99) ships:

- The ADR document itself (this file).
- `shared/bases-filter-language.ts` (moved to `shared/` in γ slice
  for client + server reuse without crossing the server/client
  boundary) — exported `FilterConditionSchema`, `FilterDocumentSchema`,
  inferred types `FilterCondition` + `FilterDocument`, helper
  `parseFilterDocument(input: unknown): FilterDocument | null`.
- Unit tests for the parser (`tests/agent-studio/vault-filter-
  language.test.ts`).

Follow-up slices in the filter-language arc:

- **β (server enforcement):** `applyFilterDocument(notes,
  filterDoc, viewerUserId)` helper or a new
  `vault.listNotesByFilter` tRPC that consumes a typed
  `FilterDocument` input. Hooks the ζ-preview path to honor every
  condition kind.
- **γ (UI condition editor):** Per-condition row in the β detail
  view becomes editable — field picker + op picker + value input.
  Saves the typed shape via `updateSavedView({ id, filters })`.
- **δ (preview enforcement):** ζ-preview's honesty banner shrinks
  to zero unenforced keys; every condition is applied server-side.
  T-F.98's `bases-row-preview-unenforced-${id}` testid disappears
  for V1-compliant filter documents.

After δ, the Bases MVP filter language is end-to-end operator-
authorable + server-enforced + UI-renderable.

## References

- `docs/implementation/agent-studio-native-graph-workspace-v1-v2-execution-plan.md`
  §6.1.bis (T-F.91–T-F.98 ledger + filter-language standing-pattern
  menu item)
- `drizzle/tables/agent-studio-vault.ts:452` —
  `agsVaultSavedViews` table definition
- `server/agent-studio/services/vault/view-kind-blueprints.ts` —
  `viewKind="base"` blueprint (T-F.91)
- `server/agent-studio/services/vault/saved-views.ts` —
  CRUD service that persists `filters` JSON
- Phase 16 saved-views original ADR:
  `docs/architecture/agent-studio-markdown-profile.md`
- T-F.98 PR #1302 — ζ apply-filter preview (the "honesty banner"
  surface this ADR closes the gap behind)
