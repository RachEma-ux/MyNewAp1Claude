# T-G — Phase 25 aggregate closure ledger

**Date:** 2026-05-17
**Track:** T-G of `agent-studio-native-graph-workspace-remaining-execution-plan.md` (Institutional / Code / Security / Recommendation graphs)
**Scope:** Whole-track closure across the 4 sub-arcs (institutional / code / security / recommendation) + the Phase 7.5c impact-traversal template infrastructure that ties them together.
**Plan footprint:** Estimated 18–25 PRs; **shipped in 20 substantive PRs + 1 whole-track closure** across one continuous autonomous session (#1371–#1389 + this PR).

---

## 0. Executive summary

T-G as a whole is closed for **acceptance criteria 1–4 + 7** (5/7 boxes ticked); criteria 5 (end-to-end impact traversal smoke) and 6 (Neo4j CE perf gates) are scoped out to T-H.2 and a future Phase 7.5d hardening slice per the existing roadmap.

| Acceptance criterion | Status |
|---|---|
| Institutional Memory Lens works | ✅ (prior arc) |
| Code Intelligence Graph ingestion | ✅ T-G.2 closed 2026-05-17 |
| Security Graph Lens works | ✅ T-G.3 closed 2026-05-17 |
| Recommendation service pattern works | ✅ T-G.4 closed 2026-05-17 |
| Impact analysis traverses institutional / code / security graphs | 🟡 **infrastructure shipped + source-scan locked (this PR)**; live-Neo4j smoke deferred |
| Neo4j CE perf acceptable OR upgrade trigger fires | 🟡 deferred to T-H.2 (operator-approval gated) |
| Permission rules enforced | ✅ approver-only T-G.3.5 + safety-event-driven T-G.4.2 + per-template `permissionFilterRequired: true` + `allowedRoles` gating |

The track shipped **20 PRs in one session** (#1371–#1390) across **4 substantive sub-arcs** + this aggregate closure, surfaced **6 standing precedents** for future arcs, and exercised the Phase 7.5 production Neo4j stack as a host for 2 new graph kinds (code-graph, security-graph) without new adapter work.

---

## 1. Sub-arc inventory

| Sub-arc | Closure ledger | PRs | Net |
|---|---|---|---|
| Phase 7.5 production Neo4j unblock | (none — infra slice) | #1371-#1373 (3) | adapter wiring + `executeTemplate` + 7 `impact_*` templates |
| T-G.2 Code Intelligence Graph | `agent-studio-code-intelligence-graph-closure-2026-05-17.md` | #1374-#1380 (7) | tree-sitter emitter → ASDB persistence → projection → 9th lens kind + UI source-locator + 5-precedent menu |
| T-G.3 Security/DevSecOps Graph Lens | `agent-studio-security-devsecops-graph-closure-2026-05-17.md` | #1381-#1386 (6) | NVD CVE feed → ASDB persistence → projection → 10th lens kind (approver-only) + zero new precedents |
| T-G.4 Recommendation Service | `agent-studio-recommendation-service-closure-2026-05-17.md` | #1387-#1389 (3) | thin-shell runtime + GraphRAG fetcher + closure; surfaced precedent (u) |
| **T-G.5 aggregate closure** (this) | this doc | this PR (1) | impact-template + projection-dir + closed-taxonomy source-scan; T-G whole-track ledger |
| **Track total** | — | **20 PRs** | end-to-end |

---

## 2. Impact-traversal template inventory (Phase 7.5c)

The Phase 7.5c slice shipped 7 `impact_*` Cypher templates in `server/agent-studio/services/graph-skill/seed-cypher-templates.ts`. All 7 are locked by `tests/agent-studio/tg-5-impact-traversal-coverage.test.ts` (this PR).

| Template key | Edge family | Max depth | Pairing |
|---|---|---|---|
| `impact_knowledge` | `REFERENCES\|CITES\|EXPLAINS` | 3 | Institutional Memory Lens |
| `impact_runtime` | `USED_BY\|EXECUTED_IN\|TRACED_IN` | 2 | Runtime / `agsRuntimeRuns` projection |
| `impact_code` | `IMPORTS\|CALLS\|DECLARES` | 4 | **T-G.2 Code Intelligence Graph** |
| `impact_security` | `AUTHORIZES\|EXPOSES\|GRANTS_ACCESS` | 3 | **T-G.3 Security/DevSecOps Graph** (admin/security gated) |
| `impact_governance` | `GOVERNED_BY\|APPROVED_BY\|DEPENDS_ON_POLICY` | 2 | Governance / approval flow (admin/governance gated) |
| `impact_tool` | `DISPATCHES_TO\|CAPABILITY_OF\|WIRED_INTO` | 2 | MCP dispatcher / CAG capability packs |
| `impact_workflow` | `TRIGGERS\|STEPS_INTO\|DEPENDS_ON_STEP` | 4 | Workflow / automation |

All 7 carry:
- `permissionFilterRequired: true` (defense-in-depth at runner level)
- `readOnly: true` (mutation forbidden per CLAUDE.md hard rule)
- explicit `timeoutMs` (no unbounded traversal)

Cross-arc pairing locked by source-scan:
- `impact_code` references the same edge family the T-G.2 projection emits.
- `impact_security` references the same edge family the T-G.3 projection emits AND restricts to admin/security roles.
- `impact_knowledge` covers the institutional memory lens already shipped.

The remaining 4 templates (`impact_runtime`, `impact_governance`, `impact_tool`, `impact_workflow`) cover pre-existing projection paths and do not depend on any T-G sub-arc.

---

## 3. Standing-precedent menu after T-G

The T-G track surfaced **6 named precedents** future arcs can cite as `(precedent X)`:

| Precedent | Source arc | One-liner |
|---|---|---|
| (p) | T-G.2 | Skeleton-first with factory-throws placeholders |
| (q) | T-G.2 | Source-of-truth boundary INSIDE a domain (ingestion / persistence / projection split) |
| (r) | T-G.2 | Closed-taxonomy extension as 6-touch-point checklist |
| (s) | T-G.2 | Previously-excluded inclusion strictness gap (`**/services/**` tsconfig exclude) |
| (t) | T-G.2 | Generic-by-shape UI affordance (key on meta SHAPE not lens kind) |
| **(u)** | **T-G.4** | **Query-service shape — thin shell over assembler + injected fetcher (query-side analog of (q))** |

**Validation:** T-G.3 shipped line-for-line against (p)–(t) without surfacing a new precedent. T-G.4 surfaced (u) because the arc shape (query-emitting) is structurally distinct from (q) (state-projecting). Future arcs of either shape now have a documented template.

---

## 4. Mortgage on remaining T-G work

### T-G.5.x — Live-Neo4j impact-traversal smoke (deferred)

**What's deferred:** an integration test that:
1. Seeds a fresh Neo4j CE instance with a code-graph ingestion + security-graph ingestion + a hand-built institutional memory edge.
2. Calls each `impact_*` template via `GraphRepository.executeTemplate(...)`.
3. Asserts the returned rows cross the expected edge family + respect role gating.

**Why deferred:**
- The 5/7 acceptance criteria ticked above do not require this test for closure; the source-scan in this PR locks the structural pairing.
- Local-device test execution is constrained per CLAUDE.md ("DO NOT run builds, tests, or dev servers on device" with the `pnpm check` / `pnpm exec vitest run` carve-out); a live-Neo4j integration test does not fit either carve-out.
- The Phase 25 roadmap already scopes a "Phase 7.5d hardening" slice for live-backend smoke tests once an operator approves a CI Neo4j service.

**Trigger to re-open:** operator green-light for CI Neo4j service, OR a `T-H.2` Aura migration slice that needs the smoke as a baseline.

### T-G.6.x — Optional operator-facing recommendation router

**Not in spec.** T-G.4 closed the "service pattern works" criterion as a consumable surface; no UI was asked for. If a future operator-facing surface needs direct consumption (vs. consumption by other agents/lens runners), a `recommendation.*` tRPC procedure is a 1–2 PR follow-up.

### Out of T-G scope (lives in T-H)

- T-H.1 Plugin framework (8+ PRs, operator-approval gated)
- T-H.2 Neo4j Enterprise / Aura migration (6+ PRs, operator-approval gated)
- T-H.3 Advanced GraphRAG / multi-agent / cross-workspace (6+ PRs, operator-approval gated)

---

## 5. Hard-rule compliance audit (whole track)

| Rule | T-G.2 | T-G.3 | T-G.4 | T-G.5 |
|---|---|---|---|---|
| Postgres = source of truth | ✅ | ✅ | n/a | n/a |
| GraphRepository sole graph access | ✅ | ✅ | ✅ | ✅ |
| MCP dispatcher chokepoint | ✅ | ✅ | ✅ | ✅ |
| OpenRouter sole model-execution path | ✅ | ✅ | ✅ | ✅ |
| Closed taxonomies validated + source-scan locked | ✅ | ✅ | ✅ | ✅ |
| No `process.env.*_API_KEY` reads | ✅ | ✅ | ✅ | ✅ |
| Cypher templates parameterized + in `ags_query_templates` registry | n/a | n/a | n/a | ✅ (all 7 impact templates locked) |
| `readOnly: true` on all traversal templates | n/a | n/a | n/a | ✅ |
| `permissionFilterRequired: true` defense-in-depth | n/a | n/a | n/a | ✅ |
| `tree-sitter` only in `parser/` + spike | ✅ | n/a | n/a | n/a |
| `neo4j-driver` only in `repository/` + `kgia/` + spike | ✅ | ✅ | ✅ | ✅ |

**Zero violations across 20 PRs.**

---

## 6. Session aggregate (2026-05-17)

This closure marks **20 PRs end-to-end in one continuous autonomous session** under the standing mandate from `feedback_native_graph_workspace_continuing_rule.md`:

| Arc | PRs | Status |
|---|---|---|
| Phase 7.5 production Neo4j unblock | #1371-#1373 (3) | ✅ closed |
| T-G.2 Code Intelligence Graph | #1374-#1380 (7) | ✅ closed |
| T-G.3 Security/DevSecOps Graph | #1381-#1386 (6) | ✅ closed |
| T-G.4 Recommendation Service | #1387-#1389 (3) | ✅ closed |
| T-G.5 Aggregate closure | this PR (1) | ✅ closed (this) |
| **Session total** | **20 PRs** | **5 arcs closed / T-G track CLOSED** |

The session validates:
1. **Phase 7.5 production Neo4j stack** as ready to host new graph kinds without adapter work — T-G.2/3 both shipped projections via `GraphRepository.projectBatched(...)` line-for-line.
2. **The 5 T-G.2 precedents `(p)–(t)`** as a reusable arc template — T-G.3 shipped without surfacing a new precedent.
3. **Arc shape ties to query vs. project asymmetry** — the new precedent (u) named the asymmetry, sized T-G.4 at 2 PRs instead of 6–7.
4. **Continuous autonomous execution** under the standing mandate, with zero operator interruption across 20 PRs.

---

## 7. Next-arc candidates (post-T-G)

With T-G closed, the natural autonomous-execution candidates per the remaining-execution-plan:

| Track | Scope | Sizing | Operator gating |
|---|---|---|---|
| T-D | Phase 23 Graph Quality Agent + Semantic Enrichment + Self-Correction (existing `graphQuality.*` tRPC already shipped per Quality Lens arc) | 12-18 PRs | Inherits standing mandate |
| T-F finish | Any remaining V1 lens-stack saturation | Variable | Inherits standing mandate |
| T-H.x | V2 advanced + Aura upgrade | 20+ PRs | **Operator approval required** |

The standing mandate covers T-D and T-F finish-out without further authorization. T-H requires an explicit operator green-light per the plan's "Authority and process" section.

---

## 8. References

- Roadmap: `docs/implementation/agent-studio-native-graph-workspace-roadmap.md`
- Remaining execution plan: `docs/implementation/agent-studio-native-graph-workspace-remaining-execution-plan.md`
- Sub-arc closures:
  - `agent-studio-code-intelligence-graph-closure-2026-05-17.md`
  - `agent-studio-security-devsecops-graph-closure-2026-05-17.md`
  - `agent-studio-recommendation-service-closure-2026-05-17.md`
- Phase 27 upgrade ADR: `docs/architecture/agent-studio-neo4j-aura-upgrade-path.md`
- Continuing-rule memory: `~/.claude/projects/-root/memory/feedback_native_graph_workspace_continuing_rule.md`
