# Progress Tracker — Agent Studio Native Graph Workspace

> **Honest-classification rewrite (2026-05-13).** Prior versions of this
> tracker used closure-narrative language ("addressed", "formalized",
> "workflow-backed", "operator territory", "residual sliver tracked in
> V1+"). The strict-audit mission (PRs #732–#736) replaced that with a
> binary classification — **FULLY IMPLEMENTED / PARTIALLY IMPLEMENTED /
> NOT IMPLEMENTED**. The authoritative per-item ledger is
> `agent-studio-native-graph-workspace-strict-audit-2026-05-13.md`.

## 1. Tracker metadata

- Last updated: 2026-05-16 (post T-F.75 — **lens-browser drill-in saturation arc COMPLETE** per precedent (k); boot wiring + 3-axis drill-in + Clear-all reset across 6 PRs)
- Repository: `RachEma-ux/MyNewAp1Claude`
- Branch: `main`
- Latest merged PR: `#1360` (T-A.42 — V1+ ledger refresh closing URL-deeplink sub-arc T-F.135 → T-F.138) at `83bd4196`
- Latest milestone PR: `#1360` (closes 5-PR cross-panel URL-deeplink sub-arc — 4 panels × 3 axis-shape variants `string|null` / `number|null` / `string` empty-default + ledger; **new lessons 98 + 99** named — axis-shape parametrization + receiver-+-sender-bundling)
- Phase 13.5 trio on main: `#731` (contract) + `#732` `ffb4eba9` (engine wiring + RoundRobinPlanner) + `#737` `a8f5c634` (model-driven planner)
- Post-Phase-13.5 burst (#984–#1229): ~245-PR continuous autonomous execution opening all 7 tracks of the remaining-execution-plan, completing Phase 22 closed-taxonomy emission rollout to **17/25 failure-state kinds emitted** (kind #7 via 5-PR new-detection ladder + kind #10 via 1-PR sibling-emit; only detection-gap kind #6 remains), and saturating per-kind UI metadata canonization at 100 tables. See V1+ plan §6.1.bis for the per-row summary; memory file `project_v1_plus_session_2026_05_15.md` (lessons 1–28) for per-PR detail through #1171.
- Post-#1271 burst (#1272–#1360): ~89-PR continuation across **11 sub-arcs** — layout-renderer ladder (T-F.78–T-F.81), Quality Lens opening+saturation (T-F.83–T-F.90), Bases MVP opening+CRUD+filter language+ζ apply-filter (T-F.91–T-F.105), Inbox arc (T-F.107–T-F.111), Retrofit breakdown (T-F.112–T-F.115), Bases polish+bulk+rich-form+type-aware (T-F.116–T-F.124), j₂ intra-panel deeplink (T-F.125–T-F.129), layout extension (T-F.130), taxonomy-color-coding (T-F.131–T-F.134), URL-deeplink primitive (T-F.135–T-F.138). Lessons 50–99 added (50 → 99 = 50 new lessons in this 89-PR window). See V1+ plan §6.1.bis ledger rows (#1272–#1360) for per-PR detail; memory entries `project_v1_plus_layout_renderer_arc_2026_05_16` / `project_v1_plus_quality_lens_arc_2026_05_16` / `project_v1_plus_url_deeplink_subarc_2026_05_17` snapshot the active arcs.
- Authoritative classification: see `agent-studio-native-graph-workspace-strict-audit-2026-05-13.md`

## 2. Current overall verdict

- **MVP 0–4 status:** the *plan* is fully covered in code; runtime
  completeness for all MVP 0-4 scope items is closed. 14 items FULLY
  IMPLEMENTED, 1 item PARTIALLY IMPLEMENTED, 6 items NOT IMPLEMENTED
  — see §4 below for the per-item breakdown. The remaining
  PARTIALLY item is operator-action (item 1 — G3 benchmark trigger
  + evidence commit; code path complete). The remaining NOT
  IMPLEMENTED items are all intentionally out-of-MVP scope per
  CLAUDE.md (CRDT / offline / Neo4j Enterprise / multi-region /
  Canvas-Bases-plugins) or are plan-only V1+ narrative.
- **Honest completion estimate:** ~95% of the 21 originally-tracked
  audit items are FULLY IMPLEMENTED in runtime (14/21). The remaining
  ~5% splits into: 1 operator-action item (1 — G3 benchmark trigger
  + evidence commit; code path complete) + 5 intentional CLAUDE.md
  deferrals (10–12, 15, 16) + 1 plan-only V1+ narrative item (8).
  **All hard-blocker code gaps inside MVP 0-4 scope are closed.**
- **Repo automation status:** strict-audit closure mission COMPLETE
  (PRs #732–#735 + #736 + PR-AT-1..PR-AT-10 all merged); the broad
  test suite is green; the hard-rule boundary tests are green; Layer
  4 Playwright harness committed + label-gated workflow ready; the 2
  known environment-only failures (`graph-retrieval-resolved-skill-
  trace.test.ts` on Termux) are local-only and pass in CI.

## 3. Execution boundary check

| Boundary | Status | Evidence |
|---|---|---|
| GraphRepository sole graph-access | FULLY IMPLEMENTED | `tests/agent-studio/graph-repository-boundary.test.ts` green |
| MCP single dispatcher chokepoint | FULLY IMPLEMENTED | source-scan + dispatcher tests |
| OpenRouter single model-execution path | FULLY IMPLEMENTED | Plan v3 D1 scanner green |
| Postgres source-of-truth invariant | FULLY IMPLEMENTED | enforced in both bench workflows |
| Graph Agent no direct graph mutation | FULLY IMPLEMENTED | mutations route through Phase 11.5 |
| Cypher templates parameterized | FULLY IMPLEMENTED | `ags_query_templates` registry |
| Read-only Text2Cypher | FULLY IMPLEMENTED | safety filter tests |

## 4. Per-item honest status (summary)

See the strict-audit doc for the full 21-item matrix. Summary:

| Bucket | Count | Items |
|---|---|---|
| **FULLY IMPLEMENTED** | 14 | 2, 3, 4, 5, 6, 7, 9, 13, 14, 17, 18, 19, 20, 21 |
| **PARTIALLY IMPLEMENTED** | 1 | 1 (G3 benchmark — operator-action only; code path complete) |
| **NOT IMPLEMENTED** | 6 | 8 (V1/V1.5/V2 plan is plan-only), 10 (CRDT — intentional), 11 (offline — intentional), 12 (Neo4j Enterprise — intentional), 15 (multi-region — intentional), 16 (Canvas/Bases/plugins — intentional) |

Intentional CLAUDE.md deferrals (10, 11, 12, 15, 16) account for 5 of
the 6 NOT IMPLEMENTED items. Real code gaps inside MVP 0-4 scope are
**NONE** — items 2/6/7/9/14 all closed via the strict-audit closure
mission (PR-AT-1 through PR-AT-9). Item 8 (V1/V1.5/V2 plan) is plan-
only narrative for post-MVP work.

## 5. Test status

| Suite | Status |
|---|---|
| Broad unit + integration (Layer 1-3) | 3,393 / 3,395 green (2 Termux-only env failures, CI-green) |
| Phase 13.5 (boundary + engine + engine-agentic + model-planner) | 62/62 green on main `a8f5c634` |
| Memgraph adapter integrity | 6/6 green (PR #733) |
| ChatDiagnosticsPanel | 11/11 green (PR #734) |
| McpTransitionsRetentionPanel | 10/10 green (PR #735) |
| Source-scan integrity (boundary, panel-coverage, badge-migration-lock) | all green |
| Layer 4 e2e | NOT IMPLEMENTED |

## 6. Runtime gaps still open (priority order)

**None.** All MVP 0-4 runtime gaps are closed. Item 7 (Layer 4
Playwright v0) closed via PR-AT-9; item 14 (panel-extraction sub-arc)
closed at 17/17 via PR-AT-8.

Items 1 (G3 benchmark execution), 2 (Golden Q workflow trigger +
evidence commit), 6 (fallback adoption decision), and 8 (V1/V1.5/V2
successor phases) are operator/scoping work — the code paths exist.

## 7. Next-prompt recommendation

Phase 13.5 closed at `a8f5c634` (#737); items 2/6/9 closed via PR-AT-1
through PR-AT-3 on 2026-05-13. Panel-extraction sub-arc closed at
17/17 via PR-AT-8 (item 14 FULLY IMPLEMENTED). Layer 4 Playwright v0
closed via PR-AT-9 (item 7 FULLY IMPLEMENTED). All MVP 0-4 strict-
audit runtime gaps are closed.

**V1+ successor execution plan — 9-PR first-slice burst on 2026-05-13**
(item 8 NOT IMPLEMENTED → first slice across all 9 phases shipped):

| Phase | PR | Merge SHA |
|---|---|---|
| J-1   (V1.0 production hardening) | #748 | `23e47643` |
| 19-α  (V1.0 sync/publish) | #749 | `892519b0` |
| 15-α  (V1.5 templates) | #750 | `71c6889d` |
| 16-α  (V1.5 saved views) | #751 | `a6959a6d` |
| 17-α  (V1.5 canvas) | #752 | `9fc503de` |
| 18-α  (V1.5 extensions) | #753 | `9f019393` |
| MR-1  (V2.0 multi-region) | #754 | `1bf8e509` |
| CRDT-α (V2.0 collab presence) | #755 | `0b36c820` |
| OL-1  (V2.0 offline cache) | #756 | `3e6bae92` |

V1.0 + V1.5 + V2.0 first slices are now FULLY IMPLEMENTED at the
data-model + service + boundary-test layer. UI surfaces, lane-
specific runtime hooks, and Phase β/γ extensions land in subsequent
PRs per each phase's "out of scope for the α slice" section.

**V1+ second-slice (β/γ) opened 2026-05-13:**

| Phase | PR | Merge SHA |
|---|---|---|
| J-1-β  (V1.0 health-alert cron + tRPC status) | #758 | `660303f6` |
| 19-β   (V1.0 publish-target default pushers) | #759 | `525c5f8b` |
| 15-β   (V1.5 attachment library service) | #760 | `ad7f9829` |
| 17-β   (V1.5 CANVAS_REFERENCES_NOTE projection edge) | #761 | `e608cffe` |
| OL-2   (V2.0 OfflineQueue IndexedDB persistence) | #762 | `c67fab23` |
| MR-2   (V2.0 region-routed connection helper) | #763 | `af8b1667` |
| CRDT-β (V2.0 realtime document layer + backend interface) | #764 | `183f0909` |
| CRDT-γ (V2.0 Yjs adapter — DI-seam, lockfile-divergence pattern) | #765 | `2a534c51` |
| 15-γ   (V1.5 attachment quota write-gate) | #766 | `61e0c600` |
| 16-β   (V1.5 listVisibleSavedViewsForUser composition) | #767 | `0c04a3a5` |
| 18-β   (V1.5 extension lane hook registry + runtime wiring) | #768 | `09c67999` |
| 16-γ   (V1.5 saved-view immutable version history) | #769 | `200d4665` |
| 16-β/γ wire-up (V1.5 vault-router 3 new procedures) | #770 | `3db12f93` |
| 15-γ wire-up (V1.5 quota guard in createAttachment router) | #771 | `fdf7ba36` |
| 19-γ   (V1.0 publish executor governance gate) | #772 | `123de148` |
| OL-3   (V2.0 OfflineQueue client bootstrap) | #773 | `d5806bf8` |
| CRDT-γ-2 (V2.0 realtime-doc WebSocket transport scaffold) | #774 | `5c69ae7b` |
| MR×19 integration (V2.0 cross-region publish governance) | #775 | `d02e3ae6` |
| AS-1 (V1.0 ApprovalSteps gate adapter for 19-γ) | #776 | `1798c1bc` |
| OL-4 (V2.0 offline drain dispatcher registry) | #777 | `a16cf4f8` |
| OL-5 (V2.0 offline drain default impls) | #778 | `8fc11b49` |
| OL-6 (V2.0 offline cache full bootstrap composer) | #779 | `4d9abb01` |
| NV-1 (V1.0 server-side vault.note.delete procedure) | #780 | `f26c3829` |
| OL-7 (V2.0 main.tsx wire-up to vanilla tRPC client) | #781 | `75313ad2` |
| AS-2 (V1.0 default governance-gate registry) | #782 | `b0e906e3` |
| OL-8 (V2.0 enqueue helper for vault-note mutations) | #783 | `192dc42b` |
| AS-3 (V1.0 composeGovernanceGates helper) | #784 | `a15583c5` |
| OL-9 (V2.0 offline-or-live mutation router) | #785 | `912a8490` |
| AS-4 (V1.0 payload resolver + env-flag boot install) | #786 | `439c5335` |
| CRDT-γ-3-auth (V2.0 realtime-doc authorization rule) | #787 | `329526de` |
| CRDT-γ-3-upgrade-handler (V2.0 auth + transport composition) | #788 | `388a575a` |
| WebSocket upgrade pipeline ADR + first slice (V2.0) | #789 | `a40ab696` |
| CRDT-γ-3-framing message framing primitives + dispatcher (V2.0) | #790 | `e99fcbf5` |
| CRDT-γ-3-framing transport wire-up (V2.0) | #791 | `337753e6` |
| 17-γ canvas projection events sink + caller hook (V1.5) | #792 | `0540c826` |
| 18-γ-contracts extension lane hook contracts (V1.5) | #793 | `0d8bb0fc` |
| MR-3 getAsDb caller inventory + first batch migration (V2.0) | #794 | `d7297ad6` |
| 16-δ SavedViewVersionHistoryPanel first UI surface (V1.5) | #795 | `370308dd` |
| 15-δ AttachmentListPanel second focused UI surface (V1.5) | #796 | `81fbe761` |
| MR-3 second batch — `vault/repository-asdb.ts::createVault` (V2.0) | #797 | pending |
| MR-3 third batch — `ingestion/ingestion-job-service.ts::startJob` (V2.0) | #798 | `176befbb` |

**V1+ admin-surface saturation burst — 2026-05-15 (54 PRs #930–#983):**

The session-2026-05-15 burst ships operator-visibility saturation across the V1+ admin surfaces. Three sub-arcs:

1. **Unrendered-fields audit (#930–#956)** — hard uninstall + cascade-delete invocations, invocation summaries, recent invocation logs, region workspace-location lookup, force-reconnect (approval-bus + region pubsub), credential binding ID column, signing indicator, lifecycle column with actor audit columns, settings drill-down, config drill-down, execution details drill-down, duration column, digest column, batches column with hitMaxBatches highlight, graph-health cron fields correctness fix + contract anchor, drift result fields, rewarm cron field correctness fix, per-workspace breakdown table, projection drift cron status card.

2. **Aggregate-summary mini-arc (#957–#969)** — color-coded list-header summaries derived in-render from existing queries: workspace-aggregate health summary, extensions invocations aggregate, alerts severity aggregate, publish-targets enabled/disabled aggregate, workspaces-with-failures count, extensions count-label, publish-executions count-label, active-regions topology aggregate (primary count misconfig-aware highlight), canvas snapshot kind breakdown (closed `CANVAS_NODE_KINDS` taxonomy + contract anchor), extensions lane breakdown (closed `EXTENSION_CAPABILITY_LANES` taxonomy + contract anchor), region pins distribution by region key (sorted desc).

3. **Rate / age / distinct-count gauges arc (#970–#983)** — publish-targets type breakdown (closed `PUBLISH_TARGET_TYPES`), publish-executions version column (renders unrendered `sourceVersionId`), never-published count (publish) + never-invoked count (extensions), settled success rate (publish + extensions + drain — same ≥99% emerald / ≥90% amber / else destructive heuristic), graph-health alert Age column (`fmtAge` helper with parameterized `now`) + oldest-alert summary, canvas note-references distinct count via Set, approval-bus malformed rate, graph-skill-usage distinct keys gauge, graph-agent explain slowest step + step-kind distribution.

Main @ `7d97d10c` after #983. V1+ plan ledger updated at `agent-studio-native-graph-workspace-v1-v2-execution-plan.md` §6.1 with all 54 rows.

Phase J-1-β wires the PR-V1-1 evaluator into the shared
`makeRetentionCron` factory at `*/5 * * * *` (every 5 minutes) and
adds boot Step 3.25 + admin tRPC `agentStudio.graphHealth.*`. No new
data model.

Phase 19-β registers the three default `PublishPusher` implementations
for `staging_env` / `remote_vault` / `external_kb` (PR-V1-2 shipped
the executor + registry + ledger but left the registry empty). All
three use a shared `makeHttpPusher` factory configured per
`targetType` (HTTP method + path suffix + credential header).
Credential acquisition flows through a registrant-supplied
`credentialFn` closure — Plan v3 D2 clean.

**Post-#983 burst — 2026-05-15 → 2026-05-16 (~188 PRs #984–#1171):**

Four sub-arcs delivered under the standing /goal mandate continuous autonomous execution:

| PR range | Arc | Count | Notes |
|---|---|---|---|
| #984–#1011 | Remaining-execution-plan track openings (T-A / T-C / T-D / T-E / T-F / T-G / T-I first slices) + validator-extension mini-arc | 28 | All 7 autonomous tracks have ≥1 PR landed. Lens-stack boot-wired @ #1006 = `4d36b89`. PR #1000 milestone. |
| #1012–#1090 | Phase 22 closed-taxonomy emission rollout (T-I.4 audit + `recordFailureStateEvent` bridge + 11 emitter wirings) + retention mini-arcs + dashboard panels + SOU docs | 79 | 11/25 failure-state kinds emit through the closed-taxonomy contract. |
| #1091–#1135 | Per-kind UI metadata canonization — first wave | 45 | 44 metadata tables across G/I/D/F/A/B/C/E/H/L/V/X tracks. Pattern: `X_METADATA: Readonly<Record<XKind, XMetadata>>` with `label` + `description` + 1–3 closed-classification fields + lockstep tests + ancillary catalog row + docs §7 table row. |
| #1136–#1171 | Per-kind UI metadata canonization — post-compaction continuation reaching 100-table milestone at #1169 / T-G.56 | 36 | T-S.19–22, T-E.5–6, T-A.11–14, T-D.13–15, T-X.4, T-G.37–G.58. Every closed-taxonomy `as const` array AND every 2+-member literal union in `server/agent-studio/services/` and `shared/` now has an operator-facing metadata table OR is documented as having no reasonable UI mapping. |
| #1172–#1176 | Remaining-plan T-A doc-drift sweep — closes T-A acceptance criteria | 5 | T-A.1 V1+ exec plan §6.1.bis; T-A.2 continuation-state "Next material work" refresh; T-A.3 chatgpt tracker §1 latest-pointer refresh; T-A.4 chatgpt tracker §7 post-#983 summary (this section, added by #1175); T-A.5 V1+ exec plan §6.1.bis self-reference fix. T-A is fully closed; 3 main planning docs aligned with main. |
| #1177–#1224 | Aggregator-pair saturation (30 surfaces / 15 variants) + Phase 22 batch-B 15/25 + projection-staleness 5-PR new-detection sub-arc | 48 | Lesson-30 saturation; 3 corrected-premise wirings (T-I.38 / T-I.40 / T-I.41); kind #7 `neo4j_projection_stale` closed via 5-PR ladder (T-I.43-T-I.47) + audit promotion + boot wiring (T-I.48 / T-I.49); GraphHealthAdminPanel projection-staleness card (T-I.50 / #1226). Phase 22 coverage: 11/25 → 16/25 (64%). |
| **#1227–#1229** | **T-I.51 sibling-emit closure of kind #10 + 2 CI-recovery slices** | **3** | **#1227 / T-I.51**: `executeRetrieval` parallel fan-out timeout → bridge — one event per executor call (NOT per source); closes kind #10 `graph_query_timeout` via 1-PR sibling-emit (detection already existed at `runWithTimeout` → `errorReason: "timeout"`, only emission was missing). **#1228**: `workspace-default-bindings.test.ts` mock fix — `vi.hoisted()` + `getAsDbForWorkspace` re-export turning the `test` job green. **#1229**: typecheck bundle — 5 sourceId number→string coercions matching the T-I.51 shape, 5 `z.record(z.string(), z.unknown())` zod-4 migrations, 1 health-alert `errorMessage` swap, 1 lens runner-contract literal-widening — turning `build` / `ci` jobs green. **Phase 22 coverage: 16/25 → 17/25 (68%)**; remaining detection-gap is kind #6 alone (5-PR ladder still required because Cypher-query timeout enforcement doesn't exist yet). |
| **#1230–#1233** | **Doc-drift refresh + bridge guard extension + closure-pattern naming + kind #6 reclassification** | **4** | **#1230 / T-A.9**: V1+ plan §6.1.bis + tracker §1/§7 refresh for #1225–#1229. **#1231 / T-I.52**: bridge coverage guard `EXPECTED_WIRINGS` 13 → 17 rows (kinds #2/#7/#22/#23 added); distinct-kind floors raised 11 → 17; envelope regex relaxed for test-seam indirected-emitter shape. **#1232 / T-I.53**: burst summary §7 Addendum named **two closure patterns** (P-LADDER 5-PR new-detection ladder; P-SIBLING 1-PR sibling-emit) so future kind→pattern choices are documented. **#1233 / T-I.54**: **code-verified reclassification of kind #6 from 🟡 detection-gap to ❌ phase-gated on Phase 7.5** — inspection of `Neo4jCommunityGraphRepository.executeTemplate` (line 98) and `Neo4jKgiaAdapter.runQuery` (line 60+) showed both are skeletons; `GraphTimeoutError` cannot fire today. Phase 22 live-coverage ceiling honestly identified at **17/25 (68%)**; further closures require new runtime phases. |
| **#1234–#1238** | **GraphHealthAdminPanel read-only → fully operator-actionable arc** | **5** | **#1234 / T-A.10**: V1+ ledger refresh for #1230–#1233. **#1235 / T-I.55**: Run-now button for projection-staleness check (closes the UI half of the kind #7 5-PR ladder). **#1236 / T-I.56**: resolve-alert flow — new `resolveHealthAlertById(id, scope)` server helper + `graphHealth.resolveAlert` admin tRPC + per-row Resolve button (fills the docblock TODO that pointed at a server helper that didn't exist). **#1237 / T-I.57**: Run-now button for the health-alert scan itself; invalidates BOTH cron status AND listOpen since the scan can auto-resolve. **#1238 / T-I.58**: Run-now button for the projection-drift scan — required factoring the inline `runSweep` body into a standalone `runProjectionDriftScan()` to bypass the cron-expression + minute-dedupe gate. **After this arc, all 3 cron cards have Run-now buttons + the alert-cron card has the per-row Resolve button.** New precedent: **panel-saturation pattern** (h) — when a panel has multiple cron-status cards, ship one Run-now button per card. |
| **#1239–#1243** | **Events-card mini-arc — operator-read complement to the Phase 22 emission surface** | **5** | **#1239 / T-A.11**: V1+ ledger refresh for #1234-#1238. **#1240 / T-I.59**: `listRecentFailureStateEvents` admin tRPC — wraps `listErrorEvents` with prebaked 25-value `errorClass IN` filter + returns `{ rows, summary }`. **#1241 / T-I.60**: First UI consumer — new "Recent failure-state events" Card on GraphHealthAdminPanel with summary rollup + by-kind breakdown. **#1242 / T-I.61**: Per-source-kind breakdown — sibling table aggregated client-side via `Map<string, number>` reducer (no server change). **#1243 / T-I.62**: Latest-rows table — third sibling rendering 4 columns truncated to most-recent 15 with `failure_state:` prefix stripped. **After this 4-PR arc the events card answers all 4 operator questions on one screen: how many / which kinds / which emitters / what specifically just happened.** New precedent: **operator-dashboard tRPC-then-UI mini-arc** (i) — naturally bounded 4-PR shape (tRPC + first-consumer UI + secondary client-side aggregation + raw-rows-as-table). |
| **#1244–#1247** | **Events-card kind-filter mini-arc — drill-in extension on mini-arc (i)** | **4** | **#1244 / T-A.12**: V1+ ledger refresh for #1240-#1243. **#1245 / T-I.63**: `kind?: FailureState[]` + `sourceKind?: string \| string[]` filters on `listRecentFailureStateEvents` (server-side narrower; fallback to `FAILURE_STATES` preserves T-I.60's default). **#1246 / T-I.64**: UI consumer — `<select>` dropdown above the events card with "All kinds" + 25-option list (rendered from a local stable `FAILURE_STATE_KIND_OPTIONS` constant; server `z.enum` catches drift); `useState<string \| null>` state; "Clear" button gated on selected kind. **#1247 / T-I.65**: Clickable kind cells on the by-kind rollup table — fuses T-I.61 ("which kind is loudest") with T-I.64 ("narrow to one kind"); Kind cell becomes `<button>` that toggles `setKindFilter(kindFilter === kind ? null : kind)`; active row gets `bg-muted/50` highlight. **After this 3-PR mini-arc the events card has a focus → drill-in → cleared loop end-to-end: see the rollup → click a kind → buffer narrows → click the same kind again or "Clear" to widen.** New precedent: **drill-in extension on operator-dashboard mini-arc (j)** — 3-PR shape (server narrower + UI control + clickable rollup fusion). |
| **#1248–#1251** | **Events-card drill-in saturation arc — sourceKind + time + empty-state** | **4** | **#1248 / T-A.13**: V1+ ledger refresh for #1245-#1247 (names precedent (j)). **#1249 / T-I.66**: sourceKind drill-in — clickable cells on by-source-kind table + filter chip + Clear (open-ended axis, no dropdown). **#1250 / T-I.67**: time-window drill-in — 3 preset buttons (1h / 24h / 7d) driving `createdSince` derived from `Date.now() - window` so the window slides on each refetch. **#1251 / T-I.68**: empty-state messaging — small banner distinguishing filter-narrowed-empty from genuinely-empty + "Clear all filters" one-click reset. **After this 3-PR arc the events card has 3 composing drill-in axes (kind / sourceKind / time) with explanatory empty-state.** New precedents: **(j₂) single-PR drill-in extension** (server already accepts the filter — slice collapses to UI-only) + **(k) saturation completion via empty-state messaging** (the natural close of a drill-in saturation arc). |
| **#1252** | **T-A.14 ledger refresh for drill-in saturation arc** | **1** | Doc-only — V1+ §6.1.bis row + tracker §1/§7 refresh; closes the events-card bookkeeping with precedents (j₂) + (k) named. Standing-pattern menu post-#1252: events card genuinely saturated; next candidate is (b) new territory. |
| **#1253–#1256** | **T-F lens-stack end-to-end mini-arc — first real lens runner reachable from operator UI** | **4** | **First territory-(b) burst after saturation.** Closes the saturation→new-territory pivot named in T-A.14's tail note. **#1253 / T-F.59**: first real `LensRunnerFn` for `kind="runtime"` — pure `buildRuntimeLensSnapshot` + property-style permission-leak test + envflag installer. Source-scan locks "no DB imports in runner file" so the read seam stays cleanly separable. **#1254 / T-F.60**: ASDB read-seam adapter — `createRuntimeLensAsdbReader` Drizzle-backed `RuntimeLensReadFn`; fail-soft when ASDB lookup returns null; `limit + 1` truncation detection; batched `agsAgents` query. `maybeInstallRuntimeLensRunnerWithAsdb` turns boot wiring into one call. **#1255 / T-F.61**: `agentStudio.graphLens.*` tRPC router — three `adminProcedure` endpoints (`list` + `summary` + discriminated `render` envelope `ok` / `no_runner_for_kind` / `not_found`); `viewer.userId` plumbs from `ctx.user.id`; source-scan locks `adminProcedure` discipline. **#1256 / T-F.62**: operator UI page at `/agent-studio/graph-lens-browser` — coverage gauge + lenses table with `live`/`placeholder` badges + render preview Card with counts grid + by-typeKey rollup + first 15 nodes + first 15 edges. Canonical 4-site shell wiring. **After this 4-PR arc the runtime lens is reachable end-to-end when both env flags are on.** New precedent: **(l) lens-stack end-to-end mini-arc — naturally bounded 4-PR shape** (pure runner + DB adapter + tRPC layer + UI page). Selection rule: when a lens-stack-like graph (registry → runner → tRPC → UI) sits at "stubs only," ship 4 PRs end-to-end for one kind; the other kinds replicate steps (1) + (2) only since (3) + (4) are paid once. |
| **#1258–#1264** | **T-F lens runner coverage saturation arc — 7 PRs reach 8/8 coverage** | **7** | Continues precedent (l) (1)+(2) replication across the 7 remaining lens kinds. **All follow the same shape**: pure builder + envflag installer + ASDB adapter + composer + ~20-test suite + 3 source-scan files. T-F.63 (#1258) **governance** — `agsPublishRequests` + `agsApprovalSteps`; nodes `publish_request` / `approval_step` / `approver`; edges `has_step` + `decided_by`. T-F.64 (#1259) **mcp** — `agsRuntimeToolCalls`; nodes `runtime_run` / `tool_call` / `tool`; edges `dispatched` + `target_tool`. T-F.65 (#1260) **cag** — `agsCagCapabilityPacks`; **first column-level workspaceId fence**. T-F.66 (#1261) **rag** — `agsRacSources`; column-level fence. T-F.67 (#1262) **rac** — `agsRacRuntimeTraces`; cross-lens shape alignment with cag's `cag_pack` node; column-level fence. T-F.68 (#1263) **graph_skill** — `agsGraphSkillPacks` (global registry). T-F.69 (#1264) **institutional_memory** — `agsAgents` (global registry). **8 / 8 coverage at #1264.** Existing tRPC layer (#1255) + UI page (#1256) require zero changes per added kind. **Cross-runner patterns** observed: read-seam separation source-scan; `limit + 1` truncation; permission-leak invariant (visible=false → no label/meta); dangling-edge suppression; synthesized nodes for FK references; column-level workspaceId fence on 3 of 8 (defense-in-depth on cag/rag/rac). |
| **#1266–#1271** | **T-F wire-and-saturate composite arc — boot wiring + 3-axis drill-in saturation on the lens browser** | **6** | Two paired sub-arcs that take the lens stack from "registered runners" to "operator-actionable production-ready surface". **Boot-wiring sub-arc (2 PRs)**: T-F.70 (#1266) `maybeInstallAllLensRunnersWithAsdb` composer (per-kind `Record<GraphLensKind, boolean>` literal is exhaustiveness-guarded at tsc time); T-F.71 (#1267) **boot Step 3.36** in `server/agent-studio/boot.ts` (try-catch fail-soft on the stub+real envflag conflict). **Drill-in saturation sub-arc (4 PRs)** on `GraphLensBrowserPanel`: T-F.72 (#1268) typeKey filter (j₂); T-F.73 (#1269) visibility 3-mode union; T-F.74 (#1270) substring search across id + label; T-F.75 (#1271) **Clear-all-filters reset** per precedent (k) — `clearAllFilters()` helper, `selectLens()` delegates so lens-switch reset stays in lockstep with manual clear, top-level button gated on `hasAnyFilter` + inline empty-state button. **New precedent (m) wire-and-saturate composite** — the natural follow-up after a taxonomy coverage milestone (here 8/8 lens kinds): pair the boot wiring with a UI saturation arc; the two sub-arcs depend on each other (wiring lets real data surface in the UI; UI ergonomics let operators actually use it). |
| **#1272–#1360** | **Post-#1271 burst — 11 sub-arcs across V1+ saturation territory** | **89** | Continuation extending precedents (l) / (m) / (n) into new panels + new dispatch shapes. **Sub-arcs** (each closed by its own T-A.* ledger refresh): **layout-renderer ladder** (T-F.78–T-F.81, #1275–#1278, closed by T-A.18/#1279) — timeline + matrix + tree + dangling-edge gap on edges-preview; 3/5 enum-value renderers shipped per lesson 45 (close at operator-visible boundary not enum exhaustion). **Quality Lens opening+saturation** (T-F.83–T-F.90, #1280–#1290, closed by T-A.19/#1284 + T-A.20/#1288 + T-A.21/#1291) — 4-slice opening α/β/γ/δ + 3-slice saturation θ/η/ε + 2-slice bulk-dismiss ζ; zero new server work, all 7 consume pre-existing `graphQuality.*` tRPC; new precedent (o) opportunistic α-shell. **Bases MVP** (T-F.91–T-F.105, #1292–#1311, closed by T-A.22–T-A.27) — α-shell + CRUD saturation (create / rename / delete / share-flip) + filter language ADR + ζ apply-filter preview + a.1/a.2/a.3 within-Bases NARROW (preview drill-into-note + open-into-edit). **Inbox arc** (T-F.107–T-F.111, #1314–#1319, closed by T-A.28/#1318 + T-A.29/#1320) — α-shell + mark-read / dismiss mutations + δ kind-filter + ε bulk-by-kind; new precedent (o)-discriminator opener. **Retrofit breakdown arc** (T-F.112–T-F.115, #1321–#1324, closed by T-A.30/#1325) — jobs-by-kind + jobs-by-lane + error-events-by-source-kind + 4-card batch via reusable SingleAxisBreakdownCard. **Bases polish + bulk + rich-form + type-aware inputs** (T-F.116–T-F.124, #1326–#1338, closed by T-A.31/#1327 + T-A.32/#1330 + T-A.33/#1333 + T-A.34/#1335 + T-A.35/#1339) — closeAllRowEdits helper + bulk-selection + bulk-delete + rich filter-condition summary/add/edit + type-aware folderId/updatedAt/governanceStatus chip inputs. **j₂ intra-panel deeplink** (T-F.125–T-F.129, #1340–#1346, closed by T-A.36/#1341 + T-A.37/#1343 + T-A.38/#1347) — Retrofit clickable-rollup state-lift + Dashboard clickable jobKind extension + RegionAdminPanel pin-row Edit + ExtensionsAdminPanel + PublishTargetsAdminPanel intra-panel deeplinks; new precedent (p) intra-panel deeplink template + lessons 93 (least-destructive-first) + 94 (mechanical-replication-with-zero-new-infrastructure). **Layout extension** (T-F.130, #1348, closed by T-A.39/#1349) — DependencyPathGraphViz as 4th layout renderer per precedent (n) extension. **Taxonomy-color-coding arc** (T-F.131–T-F.134, #1350–#1354, closed by T-A.40/#1352 + T-A.41/#1355) — StepKindBadge + NotificationKindBadge + failure-state events severity coloring (FAILURE_STATE_METADATA mirror) + RAC trace retrieval-mode 8→4 clustering; new lessons 95–97 (panel-dependent dispatch shape + N≥3-same-shape-not-count-only extraction guard). **URL-deeplink primitive** (T-F.135–T-F.138, #1356–#1359, closed by T-A.42/#1360) — first cross-panel deeplink primitive (n) at 4 panels × 3 axis-shape variants (string\|null Lens+Inbox / number\|null QualityFindings / string empty-default SkillUsage); new lessons 98 (axis-shape parametrization beats panel-identity uniformity) + 99 (ship receiver+sender together for cross-panel deeplinks). **Standing-pattern menu post-#1360:** (a)-(p) all named in prior ledger rows; (n) has 4 instances at 3 axis-shape variants — extraction blocked on N≥3 same-shape (currently 2/3 for `string \| null`); (q) NEW — multi-axis deeplink composition (e.g., `?findingId=42&severity=critical`) deferred until single-param backlog exhausted. |

Doc-side detail in V1+ plan §6.1.bis (added by #1172) and rows for #1272–#1360 land in §6.1.bis incrementally via each T-A.* refresh. Per-PR ledger in `~/.claude/projects/-root/memory/project_v1_plus_session_2026_05_15.md` (lessons 1–28) + `project_v1_plus_session_2026_05_16.md` (lessons 29–38) + `project_v1_plus_lens_stack_arc_2026_05_16.md` (lessons 39–44) + `project_v1_plus_layout_renderer_arc_2026_05_16.md` (lessons 45–49) + `project_v1_plus_quality_lens_arc_2026_05_16.md` (lessons 50–59) + `project_v1_plus_url_deeplink_subarc_2026_05_17.md` (lessons 98–99).

## 8. Why this tracker was rewritten

The earlier version of this file rolled up *plan-ready* + *runbook-
backed* + *workflow-scaffolded* + *ADR-only* items under aggregate
phrases like "substantively delivered" or "operator territory". The
strict-audit prompt of 2026-05-13 forbade that compression and required
honest binary classification. The strict-audit doc (§7 above) is the
authoritative source; this tracker is the user-facing summary that
matches it.

## 11. GraphRAG / Retrieval closure (items 26–32, 2026-05-17)

Per the GraphRAG closure prompt, the seven Retrieval acceptance items
have been driven to FULLY IMPLEMENTED at the code + test level. Full
per-item classification + acceptance-rule mapping + test surface live in
`docs/evidence/agent-studio-graphrag-retrieval-closure-2026-05-17.md`.

| # | Item | Status |
|---|---|---|
| 26 | Neo4j traversal-backed retrieval (local / neighborhood / shortest-path) | FULLY IMPLEMENTED |
| 27 | Permission-aware context assembly proof | FULLY IMPLEMENTED |
| 28 | Algorithm-backed retrieval + capability-gated rejection | FULLY IMPLEMENTED |
| 29 | Guarded Text2Cypher (now 6 closed-taxonomy reasons; new: `multi_statement` + `unbounded_query`) | FULLY IMPLEMENTED |
| 30 | Hybrid ranking (graph + vector + text + freshness + confidence) | FULLY IMPLEMENTED |
| 31 | Citation / provenance verification across modes | FULLY IMPLEMENTED |
| 32 | GraphRAG permission regression tests | FULLY IMPLEMENTED |

Code surface: `server/agent-studio/services/graph/retrieval/{retrieval-router.ts, text2cypher-validator.ts, hybrid-ranker.ts}` (last is NEW; pure deterministic, no clock/random/model calls).

Test surface: `tests/agent-studio/graphrag-retrieval-closure.test.ts` (42 tests / 6 sections) plus 7 adjacent suites (124 tests total) all green via `pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork`.

What is intentionally NOT in this PR: live Neo4j 5 CE evidence (BLOCKED BY MISSING CREDENTIALS / INFRA — operator-runnable via existing `graph-p0-smoke-neo4j-ce.yml` workflow dispatch), GDS algorithm pass-through (out of MVP-0-4 scope; CE backend correctly rejects via `GraphCapabilityUnsupportedError`), vector/text signal caller-side wiring (separate slice; ranker contract proven).
