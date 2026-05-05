# AI Types — Import from Agent Studio

**Status:** Active. Phase 36 (PR #136) shipped the AI Types-side
consumer. Sister document to `AGENT_STUDIO_EXPORT_CATALOG.md`.

---

## What this is

The AI Types-side surface that consumes the Agent Studio export
catalog. Every call goes through the Module Gateway — AI Types never
imports `server/agent-studio/*` directly (per Decision D6).

---

## Two public functions (`server/ai-types/import-from-agent-studio.ts`)

```ts
listImportableAgentStudioCandidates(
  input: { workspaceId?: number; status?: ...; actorId: number },
): Promise<AgentStudioExportCandidateRef[]>;

importAgentStudioCandidate(
  input: { agentId: number; importedBy: number; ... },
): Promise<{ catalogEntryId, action, ... }>;
```

Both call `gatewayCall<...>` with `targetModule: "agentStudio"`.
`listImportable...` invokes `agentStudio.exportCatalog.listCandidates`;
`importAgentStudioCandidate` invokes
`agentStudio.exportCatalog.exportCandidate`. The latter is
receipt-required, so the import path generates a stub receipt id
(`aitypes-import-<agentId>-<ts>`) when none is passed in.

---

## D6 boundary

This file is the *one* place in `server/ai-types/` that touches
Agent Studio. It does so through `gatewayCall` only:

- No `import` from `server/agent-studio/<anything>` (asymmetric
  Phase 26 lint enforces this — AI Types has no public-API
  exemption).
- No reading from `getAsDb()`.
- No raw SQL on `ags_*` tables.

`tests/pmb/boundary.test.ts` invariants 3 + 4 verify these.

---

## Type sharing

`AgentStudioExportCandidateRef = Record<string, unknown>` (locally
declared as opaque). The canonical type lives in
`server/agent-studio/shared/export-candidate.ts`, but cross-module
type sharing must go through `shared/` modules — not direct imports
across the AS boundary. A future phase may promote a shared type
into `shared/agent-studio-export.ts` if other consumers appear.

---

## UI surface (Phase 35, deferred)

The Catalog Import Modal's "Import from Agent Studio" entry point
calls these functions through the AI Types tRPC router. The modal
is a UI deferral from Stage 8 — not Phase 36's responsibility. When
it lands, it will:

1. Call `listImportableAgentStudioCandidates({ status: "ready" })`
   to populate the picker.
2. On user select, call `importAgentStudioCandidate({ agentId,
   importedBy })`.
3. On success, refresh the catalog table to show the new draft
   entry.

---

## Test coverage

- `server/ai-types/import-from-agent-studio.test.ts` — drives both
  functions through a mocked `gatewayCall`. Verifies request shape,
  receipt-id generation, and result-mapping behavior.

---

## Where to read more

- `AGENT_STUDIO_EXPORT_CATALOG.md` — the producer side (this is the
  consumer side)
- `DECISION_RECORD.md` D6 — AS↔AI Types boundary direction
- `CATALOG_SOURCE_MAPPING.md` — Phase 23 source-versioning columns
  the import flow populates on the catalog side
