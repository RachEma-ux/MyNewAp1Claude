# Catalog Lifecycle Event Decision — `aiTypes.catalog.published` and `aiTypes.catalog.deprecated`

**Owner:** AI Types module
**Direction B step:** B2a (decision doc)
**Status:** Adopted (informs B2b emitter implementation)
**Authority:** Plan v3 Phase 39/40, Direction B verification PR #152

---

## 1. Problem statement

Plan v3 Phase 40 declared two catalog lifecycle event types but never emitted them:

| Event | Declared in | Subscriber wired in | Emitter |
| --- | --- | --- | --- |
| `aiTypes.catalog.registered` | `server/ai-types/events.ts:21` | `server/agent-studio/boot.ts:538` | `server/ai-types/register.ts:273` ✓ |
| `aiTypes.catalog.published` | `server/ai-types/events.ts:22` | `server/agent-studio/boot.ts:549` | **MISSING** |
| `aiTypes.catalog.deprecated` | `server/ai-types/events.ts:23` | `server/agent-studio/boot.ts:556` | **MISSING** |

The B1 audit (PR #152) confirmed:

- `publishCatalogEntry` (`server/ai-types/publishing.ts:88-94`) flips `catalog_entries.status` to `"published"` and writes a `catalog.publish` audit event, but does **not** call `publishEvent("aiTypes.catalog.published", ...)`. Adding the call is mechanical.
- There is **no formal deprecate transition** in production code. The only paths that produce `status="deprecated"` on `catalog_entries` are tests calling `updateCatalogEntry(id, { status: "deprecated" })` directly. `LIFECYCLE_ACTIONS` in `shared/catalog-lifecycle.ts:21` enumerates `register / activate / validate / approve_validation / publish` — no `deprecate`.

That asymmetry is what forced the B2 PR to split: B2b cannot "add the deprecate emitter at the existing transition" because the transition does not exist yet.

This decision record locks the contract before B2b code lands.

---

## 2. Decisions (D-LC-1 … D-LC-5)

### D-LC-1 — `aiTypes.catalog.published` is emitted from `publishCatalogEntry`, post-write, best-effort

The published event MUST be emitted from `server/ai-types/publishing.ts` after the catalog row update succeeds and after the audit row is written.

- **Trigger point.** Immediately after the `await createCatalogAuditEvent({eventType: "catalog.publish", ...})` call at `publishing.ts:96-103`.
- **Failure model.** Wrapped in try/catch like the `registered` emitter (`register.ts:283-288`). A failed `publishEvent` MUST log via `console.warn` and MUST NOT roll back the publish — the catalog row plus audit row are the source of truth, the event is a downstream notification.
- **Idempotency.** `publishCatalogEntry` may be called when `entry.status === "published"` (the no-op branch at `publishing.ts:88`). The event MUST still emit in that case — every call to `publishCatalogEntry` represents a publish action (a new bundle is always created), so subscribers expect a notification per call, not per status flip.

This matches the contract in `events.ts:14-17`: "Events are emitted *after* the DB write succeeds."

### D-LC-2 — `aiTypes.catalog.published` payload shape

The payload is `CatalogPublishedPayload` declared at `events.ts:94-106`. B2b MUST populate every field:

| Field | Source |
| --- | --- |
| `catalogEntryId` | `input.catalogEntryId` |
| `publishBundleId` | `bundle.id` (from the just-created bundle) |
| `versionLabel` | `versionLabel` (computed earlier in `publishCatalogEntry`) |
| `sourceModule` | `deriveSourceModule(entry.sourceType)` — same helper `register.ts` uses |
| `sourceRefId` | `entry.sourceId` |
| `performedByActorId` | `input.publishedBy` |
| `performedByActorType` | `"user"` (publish is human-only today; system publish is not in scope) |
| `workspaceId` | `null` (catalog_entries is app-scoped — no workspace column exists on the row; matches `register.ts:266` fallback) |
| `publishedAt` | `new Date().toISOString()` at emit time |

**Open extension:** if a future phase adds a `workspaceId` column to `catalog_entries`, swap the literal `null` to `entry.workspaceId ?? null`. Not in scope for B2b.

### D-LC-3 — Deprecate is a NEW formal transition: `deprecateCatalogEntry`

Direction B requires a deprecate **emitter**. The minimal honest implementation is to introduce a dedicated transition function that owns the contract — same pattern as `publishCatalogEntry`. Bare `updateCatalogEntry({ status: "deprecated" })` calls remain possible (no DB constraint forbids them) but they will NOT emit the event. Only the formal transition emits.

**Function:** `deprecateCatalogEntry(input)` in `server/ai-types/deprecate.ts` (NEW file, parallel to `publishing.ts`).

**Input shape:**

```ts
export interface DeprecateCatalogEntryInput {
  catalogEntryId: number;
  deprecatedBy: number;
  /** Free-form reason or short reason code; persisted on the audit row and on the event payload. */
  reason?: string;
}
```

**Behavior:**

1. Load the row via `getCatalogEntryById(input.catalogEntryId)`. Throw `Error("Catalog entry {id} not found")` if missing.
2. Guard: if `entry.status === "deprecated"`, return early **without** an event emit and **without** a new audit row. Repeated deprecate calls are no-ops; this prevents subscriber storms when retries land on the same entry.
3. Otherwise, call `updateCatalogEntry(input.catalogEntryId, { status: "deprecated" }, input.deprecatedBy)`.
4. Write a `catalog.deprecate` audit event via `createCatalogAuditEvent` — payload `{ reason: input.reason ?? null, priorStatus: entry.status }`.
5. Emit `aiTypes.catalog.deprecated` with payload per D-LC-4. Same try/catch + console.warn pattern.

**Why a new file:** keeps the deprecate transition discoverable from the file tree, mirrors `publishing.ts`, and avoids inflating `register.ts` (which is already 290 lines and owns a different concept). `register.ts` is the canonical writer; `publishing.ts` and `deprecate.ts` are state-transition owners stacked on top of it.

**Why not a `LIFECYCLE_ACTIONS` entry:** the existing `LIFECYCLE_ACTIONS` array in `shared/catalog-lifecycle.ts` drives client-side `getAvailableActions` (which UI surfaces the buttons). Adding `deprecate` to that array is a UX decision out of scope here — the lifecycle UI work belongs in B3 or a later UX-focused phase. The transition function exists in B2b for **server-callable** use; UI can opt in later by adding the entry to `LIFECYCLE_ACTIONS`.

### D-LC-4 — `aiTypes.catalog.deprecated` payload shape

The payload is `CatalogDeprecatedPayload` declared at `events.ts:109-119`. B2b MUST populate every field:

| Field | Source |
| --- | --- |
| `catalogEntryId` | `input.catalogEntryId` |
| `reason` | `input.reason ?? null` |
| `sourceModule` | `deriveSourceModule(entry.sourceType)` |
| `sourceRefId` | `entry.sourceId` |
| `performedByActorId` | `input.deprecatedBy` |
| `performedByActorType` | `"user"` |
| `workspaceId` | `null` (same justification as D-LC-2) |
| `deprecatedAt` | `new Date().toISOString()` at emit time |

### D-LC-5 — Public-API exposure of `deprecateCatalogEntry` is OUT OF SCOPE for B2

B2b ships the transition function and emitter only. It does NOT register `aiTypes.catalog.deprecate` as a Module Gateway action, does NOT add a tRPC procedure that calls it, and does NOT add a `deprecate` button to any UI. The function is **server-internal** for B2b, callable from future PRs that wire UI/UX or scheduled-task callers.

This is intentional: registering a new gateway action triggers the governance descriptor + receipt-required machinery (see Plan v3 Stage 6). That's a non-trivial sub-track on its own. B2b's job is to close the missing-emitter defect from B1, not to introduce a new public API surface.

The first concrete caller will land in B3 (or later) when a deprecate path is needed to support the AS Candidate Pipeline reconcile flow. That caller will either:

- call `deprecateCatalogEntry` directly from another server module (intra-server is allowed without a gateway action), **or**
- promote the function to a gateway action with full receipt machinery if cross-module callers need it.

Either path is open; B2 does not need to resolve it.

---

## 3. Subscriber alignment

The current Agent Studio subscribers in `server/agent-studio/boot.ts:538-560` route all three events to `processCatalogSyncEvent` in `services/catalog-sync.ts`. Those subscribers were registered in Plan v3 Phase 40 (PR #140) ahead of any emitter being wired. After B2b lands:

- `published` events will trigger sync log entries with `eventType="published"`.
- `deprecated` events will trigger sync log entries with `eventType="deprecated"`.

No subscriber-side change is required for B2b — the consumer side already accepts both. B2b's tests must still cover the round trip: emit → subscriber recorded → sync log row inserted.

---

## 4. Test strategy for B2b

Three test files, in this order of importance:

1. **`server/ai-types/publishing.test.ts`** — extend the existing publish tests:
   - emit-on-success: a successful publish call results in exactly one `aiTypes.catalog.published` envelope on the event bus, with the payload shape from D-LC-2.
   - no-emit-on-row-failure: simulate `getCatalogEntryById` returning null → no event emitted.
   - emit-survives-bus-failure: stub `publishEvent` to throw → publish still completes, console.warn observed.
   - idempotent-emit: calling publish twice on a row already at `status="published"` emits twice (per D-LC-1).

2. **`server/ai-types/deprecate.test.ts`** — NEW file:
   - happy path: row at `active` → deprecate → row at `deprecated`, audit row exists with `eventType="catalog.deprecate"`, exactly one `aiTypes.catalog.deprecated` envelope on the bus with payload per D-LC-4.
   - already-deprecated guard: row at `deprecated` → deprecate → no DB write, no audit row, **no event emit** (per D-LC-3 step 2).
   - missing-entry: throw shape matches `Error("Catalog entry {id} not found")`.
   - emit-survives-bus-failure: stub `publishEvent` to throw → DB write + audit row still committed, console.warn observed.

3. **`tests/pmb/wiring.test.ts`** (or equivalent) — extend the existing 13-assertion suite:
   - `aiTypes.catalog.published` is in the AI Types manifest's emitted-events list.
   - `aiTypes.catalog.deprecated` is in the AI Types manifest's emitted-events list.
   - (subscriber side already covered by Phase 40 tests.)

---

## 5. Non-goals

- **Bundle re-publish semantics.** `publishCatalogEntry` always creates a new bundle even if called against an already-published entry. This decision doc does NOT change that — it just ensures every such call emits.
- **Publish rollback events.** "Un-publish" / revert flow is a separate concern; not in scope for B2.
- **Workspace-scoped catalogs.** The payload's `workspaceId` field is `null` for now (D-LC-2/4). If catalog rows ever become workspace-scoped, both emitters update in lockstep.
- **Deprecate UI.** No button, no tRPC procedure, no gateway action — see D-LC-5.
- **Cascading deprecates.** Deprecating a parent entry does NOT cascade to child entries. Subscribers may choose to react that way (Agent Studio's `processCatalogSyncEvent` is the right place), but the AI Types side stays single-row.

---

## 6. Risk assessment

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Subscriber storm when an old row mass-flips to deprecated | Low | D-LC-3 step 2 short-circuits repeat calls; only formal transitions emit, raw `updateCatalogEntry` writes do not. |
| Event bus failure during publish | Medium | Best-effort try/catch (D-LC-1 / register.ts pattern). Audit row is the durable record. |
| Subscriber expects a field that emit doesn't populate | Low | Payload contracts in `events.ts:94-119` are typed; `processCatalogSyncEvent` is the only consumer and reads from the typed envelope. |
| Tests added in B2b conflict with existing publish tests | Low | publishing.test.ts already exists and is small; we extend, not rewrite. |

---

## 7. Acceptance criteria for B2b

B2b's PR is ready when:

- [ ] `server/ai-types/publishing.ts` calls `publishEvent` per D-LC-1/D-LC-2.
- [ ] `server/ai-types/deprecate.ts` exists and exports `deprecateCatalogEntry` per D-LC-3/D-LC-4.
- [ ] `publishing.test.ts` covers all four cases listed in §4 item 1.
- [ ] `deprecate.test.ts` exists and covers all four cases listed in §4 item 2.
- [ ] `pnpm run check`, `pnpm run check:architecture`, `pnpm run check:wiring`, `pnpm run check:frontend-modularity`, `pnpm run build` all exit 0.
- [ ] `tests/pmb/` 61/61 stays green.
- [ ] No public API surface added (D-LC-5).

---

## 8. References

- `server/ai-types/events.ts:14-119` — event declarations and payload contracts.
- `server/ai-types/register.ts:235-289` — reference emit pattern for `registered`.
- `server/ai-types/publishing.ts:44-106` — current publish without emit.
- `server/agent-studio/boot.ts:538-560` — subscriber wiring for all three events.
- `shared/catalog-lifecycle.ts:9-29` — lifecycle states and the (today) deprecate-less actions list.
- `docs/evidence/ai-types-agent-studio-import/DIRECTION_B_VERIFICATION_REPORT.md` (PR #152) — B1 findings that triggered this decision.
- Plan v3 PRs #139 (registered emitter), #140 (subscribers landed without emitters), #143 (wiring tests).
