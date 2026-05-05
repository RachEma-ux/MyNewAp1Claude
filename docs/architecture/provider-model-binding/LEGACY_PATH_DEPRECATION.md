# Plan v3 Phase 47 — Legacy Path Deprecation

**Status:** Active. Plan v3 Phase 47 marks the per-domain
`<domain>.importToCatalog` tRPC procedures as legacy and surfaces
deprecation warnings on each invocation. The procedures continue
to work; the warning steers new callers to `aiTypes.catalog.register`.

---

## Why this exists

Five tRPC procedures across five routers all share the same shape:
read a domain row, build a catalog payload, call
`createCatalogEntry()` directly. They predate Plan v3's canonical
write path:

| Procedure | Router | Source row |
|---|---|---|
| `agents.importToCatalog` | `server/routers/agents.ts` | `agents` |
| `bots.importToCatalog` | `server/routers/bots.ts` | `bots` |
| `models.importToCatalog` | `server/routers/models.ts` | `models` |
| `llm.importToCatalog` | `server/routers/llm.ts` | `llm_providers` |
| `providers.importToCatalog` | `server/providers/router.ts` | `providers` |

Plan v3 Phase 25 introduced `aiTypes.catalog.register` as the
canonical, gated, receipt-required write path:

- Runs the Phase 24 duplicate-prevention guard.
- Uses sealed `(sourceType, sourceId)` for identity.
- Emits `aiTypes.catalog.registered` (Phase 39, best-effort).
- Writes a `catalog.register.created`/`updated` audit row.
- Receipt-required descriptor enforces governance receipts.

The `<domain>.importToCatalog` procedures bypass all of those
controls. Phase 47 deprecates them.

---

## What "deprecated" means here

Three signals are wired:

1. **JSDoc `@deprecated` tag** on each procedure declaration —
   IDE-visible warning when callers reference the route.
2. **First-call console.warn** the first time each procedure
   executes in a process. Keeps server logs clean while still
   alerting that a legacy path was hit.
3. **Audit-event `deprecated: true` payload field** on every call.
   Auditors querying `catalog_audit_events` can filter to spot
   legacy-path use without server-log scraping.

The procedures still work and return their original shapes. No
caller is broken. The deprecation is a steering signal, not a
removal.

---

## Migration recipe

Replace this:

```ts
// ❌ Legacy — bypasses register guard, no governance receipt, no event
const r = await trpc.agents.importToCatalog.mutate({ id: agentId });
```

With this, called from the agent's owning module's backend:

```ts
// ✅ Plan v3 canonical write path
const result = await gatewayCall<RegisterCatalogEntryInput, RegisterCatalogEntryResult>({
  ctx: {
    sourceModule: "<callerModule>",
    targetModule: "aiTypes",
    actionKey: "aiTypes.catalog.register",
    governanceReceiptId: receiptId,    // required — descriptor flag
  },
  input: {
    entryType: "agent",
    sourceType: "agent",
    sourceId: agentId,
    fields: { name, displayName, description, scope: "app",
              status: "draft", origin: "<caller>",
              reviewState: "needs_review",
              activeSourceVersionId, config, tags, createdBy },
    registeredBy: actorId,
    sourceModule: "<callerModule>",   // Phase 39 event payload
  },
});
```

The `aiTypes.catalog.register` action handles:

- Duplicate detection (legacy_imported, manually_reconciled,
  legacy_imported_unresolved → throws `RegisterDuplicateError`
  with a guidance message).
- Modern-row update path (existing `(sourceType, sourceId)` row
  with `legacy_import_state = NULL` → updates instead of duplicates).
- Audit + event emission.

---

## Related migrations

The five legacy procedures live in `server/routers/` and
`server/providers/`. None are owned by Plan v3 modules:

- `agents.importToCatalog` is owned by the legacy "agents" router
  (not Agent Studio). Agent Studio has never written to
  `catalog_entries` and uses `agentStudio.exportCatalog.exportCandidate`
  (which calls `aiTypes.catalog.register` via the gateway internally).
- `models.importToCatalog`, `bots.importToCatalog`,
  `llm.importToCatalog`, `providers.importToCatalog` are similar
  patterns from earlier admin import flows.

Migrating each caller fully is **Phase 26.1** (the AI Types barrel-strip
+ caller migration follow-up PR). Phase 47's scope is the deprecation
markers and the steering signals — not the per-caller rewrite.

---

## When the procedures are removed

The procedures stay until **all five** of their callers have
migrated to `aiTypes.catalog.register`. That happens in
Phase 26.1 (barrel-strip follow-up PR, currently tracked as
in-progress in the Legacy Exception Register: rows LA-01 + LA-02).

When the last caller is migrated, a follow-up PR will:

1. Delete the `<domain>.importToCatalog` procedure body.
2. Remove the entry from `server/governance/action-key-map.ts`.
3. Update the `LEGACY_EXCEPTION_REGISTER.md` rows to `removed`.

Until then, the procedures continue to function with the
deprecation warning surfacing on every call.

---

## Where to read more

- `docs/architecture/provider-model-binding/CATALOG_WRITER_MIGRATION_MATRIX.md`
  — full caller fate matrix from Phase 25.
- `docs/architecture/provider-model-binding/PROVIDER_MODEL_BINDING_BRIDGE.md`
  — overview of the canonical write path.
- `docs/architecture/provider-model-binding/LEGACY_EXCEPTION_REGISTER.md`
  — LA-01 + LA-02 track the broader migration.
