# Agent Studio Native Graph Workspace — Remaining Punch List

**Date:** 2026-05-19
**Source main:** `45438a07` (post T-A.45 / T-D.5 / T-F.1 / T-F.2 / T-B.2 sprint, PRs #1505–#1510)

## Section 1 — Phase status (28-phase canonical roadmap)

| Phase | Status | Notes |
|---|---|---|
| 0 – 14 | **DONE** | Core arc complete (vault + projection + RAC + RAG + CAG + MCP + governance) |
| 15 | **PARTIAL** | Backend + quota done; `TemplatesPage.tsx` / `AttachmentLibraryPage.tsx` UI pending |
| 16 | **PARTIAL** | Sharing / versioning shipped; drill-into-detail panels remain |
| 17 | **PARTIAL** | Canvas data model shipped (17-α); `CanvasPage.tsx` UI pending |
| 18 | **PARTIAL** | Extension manifest + lane-hook registry shipped; concrete retrieve / assemble / compose hooks pending (T-B.4) |
| 19 | **PARTIAL** | Sync/publish target registry shipped; caller-migration tail + full executor pending |
| 20 | **DONE** | Benchmarks + scale validation |
| 20.5 | **NOT STARTED** | Code Graph Parser spike (T-E) |
| 21 | **DONE** | Continuous CI |
| 22 | **DONE** | 25/25 failure-state kinds emitting |
| 23 | **DONE** | Closed via #1491–#1504 + #1507 |
| 24 | **PARTIAL** | Bases MVP + projection shipped (#1508 / #1509); Lenses + Impact Analysis pending |
| 25 | **NOT STARTED** | Institutional / Code / Security / Recommendation graphs (T-G) |
| 26 | **NOT STARTED** | V2 plugin framework + advanced GraphRAG + Aura upgrade (T-H, needs operator approval) |
| 27 | **DONE** | Aura upgrade path ADR |
| 28 | **ONGOING** | Cross-cutting (T-I, interleaves) |

## Section 2 — Ranked remaining (smallest-to-ship first)

| Rank | Track | Scope | Est. PRs | Status |
|---|---|---|---|---|
| 1 | **T-A.46 doc-drift** | Append #1505-#1510 to v1-v2 plan §6.1; refresh tracker §7; rewrite continuation-state "Next material" | 1–2 | open |
| 2 | **T-C CLAUDE.md** | Reclassify CRDT / offline / multi-region from "eternal deferral" → "V1+ scope, first slices shipped" | 1 | open |
| 3 | **T-B.1 G3 benchmark execution** | Operator-action: dispatch `graph-bench-neo4j-ce.yml`, commit evidence under `docs/evidence/` | 1 (operator) | operator-action |
| 4 | **T-B.3 MR-1 caller migration tail** | Audit `getAsDb` callers; batch migrate remaining Category B/C/D | 2–4 | open |
| 5 | **T-B.4 Extension lane hooks** | Concrete `retrieve` / `assemble` / `compose` hooks → Phase 18 (18-γ) closure | 3–4 | open |
| 6 | **Phase 15 UI** | `TemplatesPage.tsx` + `AttachmentLibraryPage.tsx` + wiring | 2–3 | open |
| 7 | **Phase 16 drill** | Saved-views version-history + restore UI | 2 | open |
| 8 | **Phase 17 UI** | `CanvasPage.tsx` create / open / arrange + node-projection 17-β | 2–3 | open |
| 9 | **T-F.1 Lens Registry** | 8-kind closed taxonomy primitive — gateway for the rest of Phase 24 | 3 | open |
| 10 | **T-F.3 Impact Analysis Lens** | 7 impact types + Cypher templates + permission post-filter | 3–4 | open |
| 11 | **T-F.4 Quality Lens UI** | Triage UI over `ags_graph_quality_findings` + correction proposals | 2 | open |
| 12 | **T-F.5 Runtime Lens** | Flame-graph over `agsRuntimeRuns` + `graphAgentDecisionTrace` | 2 | open |
| 13 | **T-E Code Graph Parser spike** | tree-sitter spike (TS + Python); decision on T-G.2 scope | 3–4 | open |
| 14 | **T-G.1 Institutional Memory** | 13 node types (Person / Team / Project / Decision / Policy / …) + projection + Cypher | 5–6 | open |
| 15 | **T-G.2 Code Intelligence Graph** | Gated on T-E; 12 node + 9 edge types + ingestion + impact queries | 8–10 | open |
| 16 | **T-G.3 Security / DevSecOps Lens** | 10 node types + NVD feed (read-only) + permission scoping | 4–5 | open |
| 17 | **T-G.4 Recommendation Service** | rank + reason + graph-path + citations + confidence over GraphRAG | 3–4 | open |
| 18 | **T-H V2 plugin framework + Aura migration** | Needs operator approval — out of autonomous scope | — | gated |

**Subtotal autonomous-eligible (#1 – #17):** ~50–65 PRs.

## Execution order

Smallest-to-ship first → unblocks larger work. T-A.46 + T-C are pure doc work. Then Phase 15/16/17 UI pages are parallel-shippable. T-F.1 (Lens Registry) is the gateway primitive that unblocks T-F.3/4/5. T-E is the spike that gates T-G.2.

T-B.1 is operator-action only — skip in autonomous mode.

T-H requires operator approval — skip in autonomous mode.
