# MR-3 — `getAsDb()` Caller Inventory + First-Batch Plan

**Status:** Active (2026-05-14). Authoritative for MR-3 caller-migration scope per `docs/implementation/agent-studio-native-graph-workspace-v1-v2-execution-plan.md`.

**Goal:** Replace direct `getAsDb()` calls at workspace-scoped service-layer sites with a workspace-aware shim, preserving the single-region operational baseline while making the codebase multi-region-ready. **Do NOT mass-edit.** Bounded per-file batches.

---

## 1. Inventory (151 call sites across 44 files)

### Classification

| Category | Rule | Count (files) |
|---|---|---|
| **A. should migrate now** | Workspace-scoped service file; `workspaceId` is in scope at the call point (or trivially plumbable). | 6 |
| **B. requires plumbing** | Workspace-scoped service file; `workspaceId` is NOT in scope at the call point. Migration needs the caller chain to thread `workspaceId` through. Separate PR per chain. | 11 |
| **C. already acceptable** | Infrastructure / boot / seed / connection / migrations / cross-workspace observability cron. Region-agnostic by design. | 17 |
| **D. tRPC routers** | API surface; per-request context already carries the actor — workspaceId comes from `ctx`. Migration is mostly mechanical but each router PR is large; reserve for a dedicated sub-arc. | 6 |
| **E. requires ADR** | Multi-workspace iterator (e.g. cron sweeping all workspaces; admin endpoints). Region routing decision is non-trivial. | 4 |

### Per-file classification

Listed alphabetically. The `Cat` column maps to the table above.

| File | Cat | Notes |
|---|---|---|
| `server/agent-studio/api/kb-router.ts` | D | tRPC router; ctx-scoped. |
| `server/agent-studio/api/router.ts` | D | tRPC router; ctx-scoped. |
| `server/agent-studio/api/tool-approvals-router.ts` | D | tRPC router; ctx-scoped. |
| `server/agent-studio/api/tool-knowledge-router.ts` | D | tRPC router; ctx-scoped. |
| `server/agent-studio/bindings.ts` | C | Cross-cutting bindings; single-region by design. |
| `server/agent-studio/boot.ts` | C | Boot step; single-region by construction. |
| `server/agent-studio/db/connection.ts` | C | Provides the helper itself. Never migrate. |
| `server/agent-studio/db/seed-*.ts` (4 files) | C | Seed scripts; bootstrap-only. |
| `server/agent-studio/manifest.ts` | C | Manifest registration; not workspace-scoped. |
| `server/agent-studio/repository.ts` | B | Legacy ASDB repo; needs workspaceId plumbing. |
| `server/agent-studio/services/approval/approval-gate.ts` | B | Approval flow; needs ctx plumbing. |
| `server/agent-studio/services/cag/events.ts` | B | CAG events; pack-id-scoped, needs workspace lookup. |
| `server/agent-studio/services/cag/store.ts` | B | CAG storage; pack-scoped, needs workspace lookup. |
| `server/agent-studio/services/canvas/canvas-service.ts` | B | Canvas service; vaultId in scope but no workspaceId. |
| `server/agent-studio/services/export-catalog-lookups.ts` | C | Cross-workspace lookups. |
| `server/agent-studio/services/extensions/manifest.ts` | A | **First batch target.** `installExtension` + `listExtensionsByWorkspace` have `workspaceId` in scope. Other 3 functions are B (need plumbing). |
| `server/agent-studio/services/extensions/runtime.ts` | B | Lookups by extensionId; needs workspace plumbing. |
| `server/agent-studio/services/graph/health-alert.ts` | E | Cross-workspace alert scan. ADR needed for multi-region routing. |
| `server/agent-studio/services/graph/projection/drift-cron.ts` | E | Cross-workspace cron. ADR needed. |
| `server/agent-studio/services/graph/repository/postgres-graph-repository-asdb.ts` | A | Per-workspace graph repo; workspaceId in scope (constructor param). |
| `server/agent-studio/services/graph-quality/router.ts` | D | Router; ctx-scoped. |
| `server/agent-studio/services/ingestion/*.ts` (4 files) | A | Workspace-scoped ingestion; `workspaceId` typically in input. |
| `server/agent-studio/services/mcp/auto-sync-resolver.ts` | B | Per-server sync; needs workspace plumbing. |
| `server/agent-studio/services/mcp/tool-knowledge-sync.ts` | B | Per-tool sync; needs workspace plumbing. |
| `server/agent-studio/services/publish-targets/executor.ts` | B | Per-target execution; targetId scoped, needs workspace lookup. |
| `server/agent-studio/services/release-audit-cleanup.ts` | E | Cross-workspace retention. ADR needed. |
| `server/agent-studio/services/runtime-runs-retention.ts` | E | Cross-workspace retention. ADR needed. |
| `server/agent-studio/services/vault/attachments.ts` | A | `workspaceId` resolvable via vaultId. |
| `server/agent-studio/services/vault/repository-asdb.ts` | A | Vault repo; workspaceId derivable. |
| `server/agent-studio/services/vault/realtime-doc-*` | C | Realtime-doc subsystem; in-memory backends + ADR-locked. |
| `server/agent-studio/services/vault/saved-views.ts` | B | Per-user/per-workspace; needs plumbing. |
| Other listed files | (various) | Categorized in-place during their first batch. |

### Summary

- **Migrate now (Category A):** ~6 files, ~15-20 call sites. Bounded; safe.
- **Requires plumbing (Category B):** ~11 files, ~40 call sites. Each is its own PR.
- **Already acceptable (Category C):** ~17 files, ~50+ call sites. Do NOT migrate.
- **tRPC routers (Category D):** ~6 files, ~30 call sites. Dedicated sub-arc (next-next).
- **Requires ADR (Category E):** ~4 files. Pause for architectural decision.

---

## 2. First-Batch Plan (this PR — PR-V1-43)

### Migration target

`server/agent-studio/services/extensions/manifest.ts`:

- `installExtension(input)` — `input.workspaceId` is in scope.
- `listExtensionsByWorkspace(workspaceId, filterStatus?)` — `workspaceId` is the first parameter.

Both functions are **workspace-scoped writes/reads** with `workspaceId` already available. No call-site plumbing changes needed.

### Migration pattern

Introduce a thin shim `getAsDbForWorkspace(workspaceId: number)` in `server/agent-studio/db/connection.ts` that:

- **Phase 1 (this PR):** Ignores `workspaceId`; delegates to `getAsDb()`. **No behavioral change.**
- **Phase 2 (follow-up PR):** When the workspace→region lookup table lands, the shim consults the region helper and routes accordingly. Single-region deployments still get the existing behavior.

This separates the migration-ready *call surface* from the routing *implementation*. Callers migrate to the surface today; the implementation upgrade is invisible to them.

### Source-scan guards (NEW pattern test)

A new test asserts the migration pattern at the two migrated functions:

- `installExtension` calls `getAsDbForWorkspace(input.workspaceId)`, NOT `getAsDb()`.
- `listExtensionsByWorkspace` calls `getAsDbForWorkspace(workspaceId)`.

This locks in the pattern; future migrations follow the same shape. The test does **not** block migration of other functions — only enforces the pattern in the two files where it's been applied.

### Out of scope (named follow-ups)

- Phase 2 of the shim (real region routing).
- Migration of `approveExtension` / `setExtensionStatus` / `getExtensionById` (Category B — need workspaceId plumbed through).
- Migration of any other file.
- ADR for Category E files.
- tRPC router sub-arc (Category D).

---

## 3. Hard rules carried into every batch

1. **No mass edit.** Bounded per-file or per-function batches; each its own PR.
2. **No behavioral regression.** The shim preserves single-region behavior.
3. **Source-scan guards lock in the pattern** as each file migrates.
4. **Category C files are NEVER touched** by this work.

---

## 4. Reference

- `docs/implementation/agent-studio-native-graph-workspace-v1-v2-execution-plan.md` — MR phases
- `server/agent-studio/services/region/connection-helper.ts` — `getDbForRegion` + `getDbForWorkspace` (helpers shipped in PR-V1-12 / #763)
- `server/agent-studio/db/connection.ts` — `getAsDb()` provider
