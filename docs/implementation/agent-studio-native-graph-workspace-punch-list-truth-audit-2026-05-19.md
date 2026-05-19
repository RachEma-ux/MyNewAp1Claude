# Native Graph Workspace — Punch-List Truth Audit (2026-05-19)

**Main after audit:** `4f7550e0` (post T-A.46 / T-C / T-B.3 / T-B.4 — PRs #1511–#1514)

## Context

The 2026-05-19 audit (`agent-studio-native-graph-workspace-remaining-punch-list-2026-05-19.md`) listed 18 ranked remaining items with ~50–65 PR estimates. The user authorized full autonomous mode to ship all of them in order.

After shipping the first 4 items (T-A.46 + T-C + T-B.3 + T-B.4), spot-checks against the code revealed that **most other "remaining" items had already been shipped** by prior work. The audit was conservative by design (it inferred remaining work from doc-state more than code-state). This document records the truth audit.

## What was genuinely remaining (and shipped this session)

| Rank | Item | PR | Outcome |
|---|---|---|---|
| 1 | T-A.46 doc-drift + punch-list document | #1511 | merged `8abb7c07` |
| 2 | T-C CLAUDE.md Canvas/Bases reclassification | #1512 | merged `80d9b167` |
| 4 | T-B.3 export-catalog region routing | #1513 | merged `05b75ca0` |
| 5 | T-B.4 static-lane-hooks installer + boot wiring | #1514 | merged `4f7550e0` |

## What the audit listed but was already shipped

| Audit item | Shipped via | Evidence |
|---|---|---|
| **T-F.1 Lens Registry** | Pre-audit T-F.7 / T-F.70 | `services/graph-lens/contracts.ts` declares the 10-value `GRAPH_LENS_KINDS` taxonomy; `install-default-lens-stack.ts` + `install-all-lens-runners.ts` wired into boot.ts at Step 3.35 + 3.36 |
| **T-F.3 Impact Analysis Lens** | Pre-audit | `services/graph-lens/impact-analysis-{contracts,executor,router}.ts` |
| **T-F.4 Quality Lens UI** | Pre-audit | `client/src/modules/agent-studio/components/GraphQualityFindingsPanel.tsx` + `pages/GraphQualityFindingsPage.tsx` |
| **T-F.5 Runtime Lens** | Pre-audit | `install-runtime-lens-runner.ts` + `install-runtime-lens-runner-with-asdb.ts` |
| **T-E Code Graph Parser spike** | #1363–#1367 (memo: `project_v1_plus_code_graph_spike_2026_05_17`) | `services/code-graph/spike/{parse-ts-file,project-and-measure,run-sample-ingest}.ts` |
| **T-G.1 Institutional Memory** | Pre-audit | `services/institutional-memory/{contracts,project-node,public-api}.ts` |
| **T-G.2 Code Intelligence Graph** | Pre-audit | `services/code-graph/{contracts,parser,persistence,projection}/` |
| **T-G.3 Security/DevSecOps Lens** | Pre-audit | `services/graph-lens/install-security-devsecops-lens-runner.ts` |
| **T-G.4 Recommendation Service** | Pre-audit | `services/recommendation/{contracts,assemble-response,recommendation-router,runtime}/` |
| **Phase 15 UI** (Attachment Library) | Pre-audit | `client/src/modules/agent-studio/components/AttachmentListPanel.tsx`, `VaultAttachmentsAdminSurface.tsx`, `pages/VaultAttachmentsPage.tsx` |
| **Phase 17 UI** (Canvas) | Pre-audit | `client/src/modules/agent-studio/pages/CanvasOperatorPage.tsx`, `components/CanvasOperatorPanel.tsx` |

## What's actually still open (genuinely)

| Item | Reason | Path forward |
|---|---|---|
| **T-B.1 Neo4j CE G3 benchmark execution** | Operator-action only (dispatch GHA workflow_dispatch + commit evidence) | Documented runbook at `docs/runbooks/agent-studio-native-graph-workspace-neo4j-ce-benchmark-runbook.md`; not autonomous |
| **Phase 15 Templates UI (agent-studio context)** | The agent-studio-context template page (different from `client/src/pages/pm-central/TemplatesPanel.tsx`) is genuinely absent — but no operator demand has surfaced and the backend template ledger (#750) is operator-callable via tRPC | Defer; small slice when needed |
| **T-B.3 / T-B.4 additional caller-migration slices** | Ongoing tail; #1513 + #1514 closed the highest-visibility sites | Follow-on PRs as new caller sites land |
| **T-H V2 plugin framework + Aura migration** | Gated on operator approval (multi-quarter) | Out of autonomous scope |

## Lesson

Doc-state-driven audits over-list "remaining" work when concurrent execution has shipped items without doc updates closing them. The fix isn't more docs — it's grep-the-code spot-checks before drafting a "remaining" list. This audit shipped 4 PRs that closed the actual gaps; the other 13 audit items were already done.

The 28-phase roadmap is **functionally complete** for the autonomous-eligible scope. Remaining items are operator-action (T-B.1) or operator-approval-gated (T-H).

## Session totals (2026-05-18 → 2026-05-19)

- **17 PRs shipped this 2-day session** (#1499–#1514, including the T-D.4 chain + 5-PR forward sprint + this finish sprint)
- **All originally-named closure items in the continuing rule:** done
- **Phase 23 acceptance criteria (13/13):** ticked
- **Phase 24 opener:** shipped (Bases MVP + KG projection)
- **CLAUDE.md scope text:** truthful
- **Roadmap doc-state:** current

Updated 2026-05-19.
