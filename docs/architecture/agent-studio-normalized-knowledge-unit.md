# Agent Studio NormalizedKnowledgeUnit — ADR

**Owner:** Agent Studio module
**Phase:** 1 (Retrofit ADRs)
**Status:** Adopted — drives Phases 2, 3, 4, 8
**Authority:** Locked persistence + interface contract for the unit type the entire retrofit pivots on.

---

## 1. Problem statement

Universal Ingestion (`agent-studio-universal-data-ingestion.md`) and KB retrieval (Phase 4) both speak in "knowledge units". Phase 8's `ProposedToolCall` evidence references unit IDs. Without a locked unit shape, every consumer invents its own; cross-phase evidence becomes impossible.

This ADR locks the `NormalizedKnowledgeUnit` shape, the persistence model, and the lifecycle (insert, validate, retrieve, invalidate, archive).

---

## 2. Decisions

### D-NKU-1 — One row per unit; chunks are sibling rows, not nested

A `NormalizedKnowledgeUnit` represents one logical unit of meaning — a paragraph, a function, a JSON object, a PDF page, a code block. Chunking for retrieval is a **separate row** in `agsKnowledgeChunks`, FK'd back to the unit. This separation lets retrieval re-chunk without rewriting units, and lets units carry coarse-grained provenance (the entire PDF page) while chunks carry fine-grained retrieval signals (embedding vector ref, score).

### D-NKU-2 — Locked fields on the unit

```ts
interface NormalizedKnowledgeUnit {
  // Identity
  id: number;                          // surrogate
  workspaceId: number;                 // permission scope (always present)
  sourceId: number;                    // FK to ags_rac_sources
  parentUnitId: number | null;         // for hierarchical sources (PDF: page → unit)

  // Type
  unitType: NormalizedKnowledgeUnitType;
  // "text" | "markdown_section" | "html_block" | "json_object" |
  // "pdf_page" | "code_function" | "code_class" | "table_row" |
  // "tool_knowledge" | "extracted_artifact"

  // Content
  contentText: string;                 // canonical text projection (always)
  contentJson: Record<string, unknown> | null;  // structured shape if applicable
  contentHash: string;                 // SHA-256 of contentText

  // Source location
  sourceLocation: {
    uri: string | null;                // canonical citation URI
    pageNumber: number | null;
    lineRange: { start: number; end: number } | null;
    selector: string | null;           // HTML/markdown selector if applicable
  };

  // Provenance (D-UI-2 mandatory)
  provenanceId: number;                // FK to ags_provenance_records

  // Permission (D-UI-2 mandatory)
  permissionContext: {
    inheritFromSource: boolean;        // true → use source's ACL
    explicitAclRef: string | null;     // when inheritFromSource=false
  };

  // Freshness (D-UI-2 mandatory)
  freshnessState: "fresh" | "stale" | "expired";
  lastValidatedAt: string;             // ISO timestamp

  // Validation
  validationStatus: "ok" | "warn" | "blocked";
  validationResultId: number | null;   // FK to ags_data_validation_results

  // Lifecycle
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}
```

The ten `unitType` values cover the MVP. New types require an ADR amendment, NOT an ad-hoc addition.

### D-NKU-3 — `contentText` is the canonical projection

Every unit, regardless of structured shape, MUST carry a `contentText` projection. The retrieval planner indexes / scores against `contentText` first; structured shape lives in `contentJson` for downstream consumers. A unit without `contentText` is a contract violation (KnowledgeUnitService rejects insert).

This avoids "embedding works for prose units but not JSON" — the projection is forced upfront, deterministically.

### D-NKU-4 — `contentHash` is SHA-256 of `contentText`, used for dedupe + cache

Two units with identical `contentText` produce identical `contentHash`. The retrieval filter uses the hash to dedupe across sources (D-RET-3 of the prior RAC arc already ships `dedupeBy="content_hash"`). The hash also keys cache invalidation: when a normalizer re-parses an artifact and produces a unit with the same hash, the existing row is reused; only `lastValidatedAt` updates.

### D-NKU-5 — Lifecycle: insert → validate → retrieve → invalidate → archive

- **Insert**: KnowledgeUnitService.insertUnit() — runs DataValidationService, persists with `validationStatus`.
- **Retrieve**: planner reads units via the existing RAC retrieval path (Phase 4). Permission filter enforces `permissionContext`; freshness filter enforces `freshnessState`.
- **Invalidate**: a source's content changed → IngestionJobService re-runs parser → if hash unchanged, only `lastValidatedAt` updates; if hash changed, a new unit row replaces the old one (the old row is archived, NOT deleted, so traces remain valid).
- **Archive**: when a source is removed or the workspace is offboarded, units flip to `archivedAt=<timestamp>`. Retrieval skips archived units. Audit reads still see them.

Hard-delete is reserved for compliance / right-to-be-forgotten flows, which need governance evidence and an explicit policy approval — outside the retrofit scope.

### D-NKU-6 — Tool knowledge uses the same unit shape

The Phase 7 MCP tool knowledge mirror (`agsMcpToolKnowledge`) materializes as `NormalizedKnowledgeUnit` rows with `unitType="tool_knowledge"`. The `contentText` is a generated description; `contentJson` carries the schema snapshot. This means the same retrieval planner / filter / assembler path works for tool knowledge — no parallel pipeline.

---

## 3. Consequences

- **Cross-phase evidence is type-safe.** Phase 8's `ProposedToolCall.knowledgeUnitIds` is a `number[]` referencing `agsKnowledgeUnits.id`; the validator can resolve them in one query.
- **Hash-based dedupe is free.** No extra dedupe service needed; the existing `D-RET-3` filter consumes `contentHash`.
- **Tool knowledge integration is trivial.** Phase 7 produces unit rows; Phase 4's retrieval path picks them up automatically.
- **Lifecycle archives are non-destructive.** Past traces continue to resolve to a unit; the old content is reachable for audit.
- **No `vector(N)` columns on the unit table.** Chunks live in a sibling table; embedding storage stays per-source via D-EMB-1 (not blocked by `pgvector`).

---

## 4. Acceptance

- [x] Unit row shape locked (D-NKU-2).
- [x] Ten `unitType` values enumerated.
- [x] `contentText` projection mandatory.
- [x] `contentHash` SHA-256 of `contentText`, used for dedupe + cache.
- [x] Lifecycle (insert → validate → retrieve → invalidate → archive) locked.
- [x] Tool knowledge uses the same unit shape (no parallel pipeline).
- [ ] `agsKnowledgeUnits` schema lands in Phase 2.
- [ ] `KnowledgeUnitService.insertUnit()` enforces D-NKU-3 + D-NKU-4 in Phase 3.
- [ ] Retrieval integration lands in Phase 4 (D-NKU-1 chunks).
- [ ] Phase 8 evidence resolution uses `agsKnowledgeUnits.id`.
