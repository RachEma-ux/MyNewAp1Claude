# Agent Studio RAC Planner Modes — ADR

**Owner:** Agent Studio module + RAC subdomain
**Phase:** Retrofit P6 (originally implemented; ADR added retrospectively as part of post-retrofit review cleanup)
**Status:** Adopted 2026-05-06 (formalizing decisions already locked in `services/rac/planner-mode.ts`)
**Authority:** Locks the RAC retrieval planner's eight-mode lattice + the decision tree that derives the mode from a runnable plan + CAG-pack presence. Cited as **D-RAC-PLANNER-1..4**.

---

## 1. Why this document exists

The RAC retrieval planner's eight-mode lattice is referenced from multiple places:

- `CLAUDE.md` `## Architectural Boundaries` lists all 8 modes verbatim
- `docs/implementation/agent-studio-retrofit-acceptance.md` §3.5 cites `D-RAC-PLANNER` as part of the locked decision set
- `tests/agent-studio/retrofit-acceptance.test.ts` exercises the mode-derivation matrix
- `services/rac/planner-mode.ts` implements the 8 enum values + decision tree

But until this ADR, no architecture document locked the decisions with citable D-IDs. The post-retrofit review surfaced this as documentation drift — the contract was load-bearing in code + tests + CLAUDE.md but had no formal home. This ADR fills that gap.

The decisions documented here are **descriptive of shipped behavior**, not new commitments. The 8 modes ship in P6; this ADR records the rationale so future amendments have a citable anchor.

---

## 2. Decision summary

| ID | Decision | One-line rationale |
|---|---|---|
| **D-RAC-PLANNER-1** | The planner emits one of exactly 8 explicit modes per request: `no_retrieval`, `cag_only`, `knowledge_retrieval`, `multimodal_hybrid_retrieval`, `tool_knowledge_retrieval`, `hybrid_cag_rag`, `hybrid_cag_tool_knowledge`, `hybrid_cag_rag_tool_knowledge`. The enum is closed; new modes require a RAC PR + ADR amendment. | Closed enum makes trace consumers (UI, observability dashboards, evaluators) deterministic; "ad hoc" modes would defeat the explicit-mode contract. |
| **D-RAC-PLANNER-2** | Mode is derived from `(runnable plan items, CAG-pack presence)`. Pure function, no I/O, no embedding calls. The composer is mode-agnostic — it always reads from `capabilityPack` and `retrievalEvidence`; the mode tag is for trace + UI consumption only. | Deterministic derivation = reproducible runs + stable tests. The composer staying mode-agnostic means mode logic can evolve without rewriting the composer. |
| **D-RAC-PLANNER-3** | Decision tree is "first-match wins" with a fixed precedence: empty plan → no_retrieval/cag_only → multimodal hint → tool-knowledge-only → knowledge-only → mixed knowledge+tool. The tree handles all 16 combinations of `(hasKnowledge, hasToolKnowledge, hasMultimodal, hasCagPack)` plus the empty-plan cases. | Explicit precedence eliminates "which mode does this combo produce" ambiguity. The matrix is small enough to test exhaustively in `retrofit-acceptance.test.ts`. |
| **D-RAC-PLANNER-4** | Multimodal subsumes the other modes for MVP — when ANY runnable source's type contains `multimodal`/`image`/`audio`/`video`, mode is `multimodal_hybrid_retrieval` regardless of CAG. Refinement to per-modality routing is a future amendment. | MVP simplification. Once we have telemetry on multimodal traffic, we can split into `multimodal_only`, `hybrid_cag_multimodal`, etc. without reshaping the 8-mode contract — it's an additive amendment to the enum. |

---

## 3. Mode taxonomy (D-RAC-PLANNER-1)

The 8 modes form a 2×4 lattice — two CAG dimensions (absent / present) × four retrieval-source profiles (none / knowledge / tool-knowledge / both):

|  | No CAG pack | CAG pack present |
|---|---|---|
| **No retrieval sources** | `no_retrieval` | `cag_only` |
| **Knowledge sources only** | `knowledge_retrieval` | `hybrid_cag_rag` |
| **Tool-knowledge sources only** | `tool_knowledge_retrieval` | `hybrid_cag_tool_knowledge` |
| **Knowledge + tool-knowledge** | (collapses to `knowledge_retrieval`) | `hybrid_cag_rag_tool_knowledge` |

Plus one orthogonal escape: `multimodal_hybrid_retrieval` triggered by source-type hints, irrespective of CAG.

### 3.1 Source-type families

The decision tree categorizes runnable plan items into three buckets:

- **Knowledge** — `document_collection`, `vector_index`, `graph_index`, `knowledge_unit`, `external_connector`. These flow chunks through the retrieval pipeline.
- **Tool-knowledge** — `tool_knowledge`. Same retrieval pipeline as knowledge but the units are tool-schema-shaped (D-NKU-6).
- **Multimodal hint** — any source-type substring containing `multimodal` / `image` / `audio` / `video`. Triggers the mode-4 escape regardless of which other buckets are present.

`cag_pack` is intentionally NOT in any bucket — it's rendered by the CAG resolver (D-PARSE-OCR-3 pattern: in_process_pending in the planner; the resolver pulls it directly).

### 3.2 The collapsed cell

The `(no CAG, knowledge + tool-knowledge)` combination collapses to `knowledge_retrieval` rather than expanding to a ninth mode. Rationale: when CAG isn't present, the dominant intent for the trace tag is "retrieve from KB," and tool-knowledge units flow through the same pipeline regardless. With CAG, the explicit hybrid mode (`hybrid_cag_rag_tool_knowledge`) is worth surfacing because operators reading traces benefit from seeing both retrieval paths active alongside CAG. Without CAG, the distinction is lower signal — keeping it collapsed avoids a 9-mode lattice with one near-duplicate entry.

---

## 4. Decision tree (D-RAC-PLANNER-3)

```
runnable = plan.items where skipReason === null
types    = unique sourceType across runnable
hasKnowledge       = types ∩ KNOWLEDGE_TYPES ≠ ∅
hasToolKnowledge   = types ∩ TOOL_KNOWLEDGE_TYPES ≠ ∅
hasMultimodal      = ANY type contains "multimodal" | "image" | "audio" | "video"

1. runnable empty:
     hasCagPack       → cag_only
     no CAG           → no_retrieval

2. hasMultimodal     → multimodal_hybrid_retrieval         (subsumes everything else)

3. tool-knowledge only:
     hasCagPack       → hybrid_cag_tool_knowledge
     no CAG           → tool_knowledge_retrieval

4. knowledge only:
     hasCagPack       → hybrid_cag_rag
     no CAG           → knowledge_retrieval

5. knowledge + tool-knowledge:
     hasCagPack       → hybrid_cag_rag_tool_knowledge
     no CAG           → knowledge_retrieval                (collapsed; see §3.2)

6. fall-through       → no_retrieval                       (defensive — should not reach)
```

Implementation: `services/rac/planner-mode.ts`. The decision tree is locked there; this ADR is the textual ground truth that the implementation must match.

---

## 5. The mode is for trace consumers, not for the composer (D-RAC-PLANNER-2)

The CAG composer (`services/cag/composer.ts`) is mode-agnostic. It always pulls `capabilityPack` + `retrievalEvidence` from the assembler's output and renders both. The mode tag flows into:

- The runtime trace row (`agsRacRuntimeTraces.plannerMode`) for observability + evaluation.
- The Phase 11 UI's RAC tab for "what mode did this run use" surfacing.
- The runtime orchestrator's pre-flight check: when mode ∈ `{no_retrieval, cag_only}`, the executor is skipped entirely (saves a roundtrip to the source registry).

This separation means mode logic can evolve (new modes, refined routing) without coordinating composer changes. It also means tests can verify mode derivation independently from composer output.

---

## 6. Multimodal subsumption — MVP simplification (D-RAC-PLANNER-4)

Today, ANY multimodal hint short-circuits to `multimodal_hybrid_retrieval` regardless of:

- Whether CAG is also present (no `hybrid_cag_multimodal` mode in MVP).
- Whether other knowledge / tool-knowledge sources are also runnable.

Rationale:

1. **No production multimodal traffic at retrofit close.** The retrofit ships `image`, `audio`, `video` parsers (§D4), but no source registry uses multimodal source-types yet — `external_connector` is the placeholder. Until traffic exists, splitting the mode adds enum entries with no signal.
2. **Refinement is additive.** When per-modality routing becomes worth doing, new modes can be added (`multimodal_only`, `hybrid_cag_multimodal_rag`, etc.) without reshaping the 8 existing modes. The current `multimodal_hybrid_retrieval` survives as the catch-all.
3. **Trace clarity.** Operators reading a trace today see "this run touched multimodal sources" without the mode hierarchy interfering. When the hierarchy matters, the amendment will introduce it explicitly.

When the refinement lands, this ADR amends with §11 (mirroring the D1 amendment pattern that added §11 to the pgvector ADR).

---

## 7. What this ADR does NOT cover

- **The composer's actual rendering logic.** That's `services/cag/composer.ts` and is mode-agnostic by design. See `agent-studio-cag-reconciliation.md` for compose-time decisions.
- **Per-modality routing.** Future amendment when multimodal traffic shape is understood.
- **Score normalization across mode types.** Each adapter normalizes its own score to [0,1]; the planner doesn't re-normalize across modes.
- **Mode-driven retrieval-policy overrides** (e.g., "knowledge-only mode uses minScore=0.5 but multimodal uses 0.3"). The current `RacPolicy` shape is per-profile, not per-mode; if mode-driven policy becomes worth doing, that's a separate ADR.

---

## 8. Acceptance

- [x] 8-mode enum locked (`RAC_PLANNER_MODES` in `services/rac/planner-mode.ts`).
- [x] Decision tree exhaustive over `(hasKnowledge, hasToolKnowledge, hasMultimodal, hasCagPack)` × `runnable.length`.
- [x] Composer is mode-agnostic.
- [x] Mode tag persists in `agsRacRuntimeTraces.plannerMode` for observability.
- [x] Test coverage in `tests/agent-studio/rac-planner-mode.test.ts` + `retrofit-acceptance.test.ts`.
- [ ] Per-modality routing refinement — deferred until multimodal traffic shape is understood.

---

## 9. Cross-references

- `docs/implementation/agent-studio-retrofit-acceptance.md` — cites D-RAC-PLANNER in the locked decision set.
- `docs/architecture/agent-studio-cag-reconciliation.md` — composer contract this ADR's mode tag flows into.
- `docs/architecture/agent-studio-normalized-knowledge-unit.md` — D-NKU-6 (tool_knowledge units) which this ADR's tool-knowledge bucket consumes.
- `services/rac/planner-mode.ts` — implementation; this ADR is the textual contract.
- `tests/agent-studio/rac-planner-mode.test.ts` — exhaustive mode-derivation matrix.
