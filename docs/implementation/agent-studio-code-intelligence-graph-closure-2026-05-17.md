# T-G.2 — Code Intelligence Graph closure ledger

**Date:** 2026-05-17
**Track:** T-G.2 of `agent-studio-native-graph-workspace-remaining-execution-plan.md`
**Scope:** Build a code-intelligence graph (files / classes / functions / API endpoints + imports / calls / declares edges) on top of the Phase 7.5-unblocked Neo4j repository, persist as Postgres source-of-truth, project to Neo4j, and surface through the existing graph-lens UI.
**Plan footprint:** Estimated 8-10 PRs; **shipped in 6 substantive PRs + 1 hotfix** (#1374-#1379 + the T-G.2.5 fix on #1378).

---

## 0. Executive summary

T-G.2 is the first new graph kind to ship end-to-end on the Phase 7.5-unblocked production Neo4j path. The sequence proved that:

- The skeleton-first pattern (T-G.2.1) lets downstream consumers compile against interfaces before any implementation lands — each subsequent sub-slice flipped exactly one "factory throws T-G.2.1" placeholder.
- Source-of-truth boundaries can be drawn *inside* a domain (parser → persistence → projection), not just at the cross-domain GraphRepository surface, with each layer's tests verifying it stays on its side.
- A closed-taxonomy lens-kind extension from 8 → 9 went through cleanly because the existing graph-lens panel is fully metadata-driven (it grouped by typeKey, filtered by typeKey, rendered any LensSnapshot shape) — the only "UI work" was a small per-shape badge for source locators.

All 6 PRs merged green. No item is silently deferred. The closure-ledger §3 captures the standing patterns surfaced by this arc.

| Sub-slice | PR | Shape |
|-----------|----|-------|
| T-G.2.1 skeleton | #1374 | Factory-throws placeholders + interfaces |
| T-G.2.2 parser | #1375 | tree-sitter graduated from spike to production |
| T-G.2.3 persistence | #1376 | ASDB tables + validated symbol batch |
| T-G.2.4 projection | #1377 | GraphRepository batched UNWIND via Phase 7.5b |
| T-G.2.5 lens runner | #1378 | 9th lens kind + per-kind installer |
| T-G.2.6 lens UI | #1379 | Source-locator badge (generic by meta shape) |
| T-G.2.7 closure | this  | Closure ledger + standing-pattern menu update |

---

## 1. Per-PR closure ledger

### T-G.2.1 — Production skeleton (#1374)

**Shipped:**
- Three new directories under `server/agent-studio/services/code-graph/`: `parser/`, `persistence/`, `projection/`.
- Each has a public-api barrel + a `create*` factory that throws a `[T-G.2.1]` placeholder.
- Top-level `services/code-graph/public-api.ts` barrel re-exports contracts + parser + persistence + projection. **Does NOT re-export `spike/`**.
- 17 source-scan assertions in `tg-2-1-code-graph-skeleton.test.ts` lock the factory-throws strings + the NO-`tree-sitter`/`drizzle`/`neo4j-driver` boundaries.

**Why three production directories rather than graduating `spike/` in place:**
- spike/parse-ts-file.ts is the frozen T-E measurement reference (editing invalidates the recorded gates).
- Production parser needed cross-file resolution + import-path normalization + ParseError tolerance — additions that don't belong in the frozen spike.
- Production callers import from `services/code-graph/{parser, persistence, projection}/`; spike remains the test-bench escape hatch only.

### T-G.2.2 — Parser wired against tree-sitter (#1375)

**Shipped:**
- `parser/tree-sitter-emitter.ts` (sole production tree-sitter callsite) + `parser/code-graph-parser.ts` (factory wrapper).
- **Two-file split** so the factory file is importable on environments without the native binding compiled (Termux, fresh checkouts).
- **Taxonomy graduation** from spike PascalCase / SCREAMING_SNAKE_CASE to production lower-snake-case typeKeys (`File` → `file`, `DECLARES` → `declares`, etc.). Drops the spike's `EXPORTS` edge (not in production 10-edge taxonomy).
- Parse-error tolerance moved INSIDE the parser (T-E.5 carry-forward from the orchestrator).
- 11 source-scan assertions; tree-sitter allowlist extended from `spike/**` to `spike/** + parser/**`.

### T-G.2.3 — ASDB persistence (#1376)

**Shipped:**
- 3 new ASDB tables: `ags_code_graph_ingestions`, `ags_code_graph_nodes`, `ags_code_graph_edges`.
- Composite-unique indexes on `(ingestion_id, node_id)` and `(ingestion_id, edge_id)` — the idempotency anchor for re-parse.
- `validateCodeGraphEdgeBatch` runs BEFORE every edge upsert; malformed `(sourceTypeKey, edgeTypeKey, targetTypeKey)` triples never reach the DB.
- `PERSIST_BATCH_SIZE = 500` (Postgres parameter-cap safe) — separate from Phase 7.5b's `PROJECTION_BATCH_SIZE = 1000` (Neo4j MERGE cost) because the binding constraints differ.
- 13 source-scan assertions.

### T-G.2.4 — Neo4j projection via GraphRepository (#1377)

**Shipped:**
- `projectIngestion(ingestionId)` flow: `store.readIngestion()` → convert to `ProjectionWrite[]` → `repository.applyProjectionJob(writes)`.
- **Source-of-truth invariant preserved**: projection ONLY reads ASDB; never writes. Re-projection is a single-method call.
- Factory signature evolved from no-arg to dependency-injected (`createCodeGraphProjection({ store, repository })`) — mirrors `services/graph/projection/sync-worker.ts`.
- Unresolved cross-file references (raw callee names / import specifiers) tagged with placeholder `typeKey: "unresolved"` rather than dropped — projection writes still land in Neo4j (MERGE on id); cross-file join happens in lens runner.
- 11 source-scan assertions.

### T-G.2.5 — code_intelligence lens runner (#1378)

**Shipped:**
- Closed-taxonomy extension: `GRAPH_LENS_KINDS` 8 → 9 (added `code_intelligence`).
- Per-kind ASDB reader picks the most-recent completed ingestion (per `repositoryId` scope, or globally).
- Envflag-gated installer `AGS_GRAPH_LENS_CODE_INTELLIGENCE_RUNNER_INSTALL=on`.
- 16 behavioral tests covering clamp / visibility gate / snapshot builder / runner factory / install gate.
- 4 enumerating tests updated for the 9-kind taxonomy.

**T-G.2.5 hotfix** (within the same PR): `validateCodeGraphEdgeBatch` discriminated-union narrowing tripped under `strict: false` once T-G.2.5's lens-runner import pulled `services/code-graph/contracts/` into compilation for the first time (boot.ts → graph-lens public-api → … → reader → contracts). Fixed with an explicit `Extract<…, { ok: false }>` cast — see §3 carry-forward "previously-excluded inclusion" pattern below.

### T-G.2.6 — Lens UI source-locator badge (#1379)

**Shipped:**
- Three new exports on `GraphLensBrowserPanel.tsx`: `interface CodeGraphSourceLocator`, `getCodeGraphSourceLocator`, `formatCodeGraphSourceLocator`.
- Badge rendered inline under the node-row label cell when meta carries `filePath` (+ optional `startLine` / `endLine`).
- **Generic by design** — keyed on meta SHAPE, not on lens kind. Any future lens that emits source locators gets the affordance for free.
- 7 source-scan + 6 behavioral assertions (13 total).

### T-G.2.7 — Closure ledger (this PR)

**Shipped:**
- This document.
- Standing-pattern menu update in `agent-studio-native-graph-workspace-remaining-execution-plan.md` §"Standing patterns" reflecting the 4 new patterns surfaced by T-G.2.

---

## 2. Hard-rule compliance audit (every PR in the arc)

| Rule | T-G.2.1 | T-G.2.2 | T-G.2.3 | T-G.2.4 | T-G.2.5 | T-G.2.6 |
|------|--------|--------|--------|--------|--------|--------|
| Postgres = source of truth (ASDB writes precede any Neo4j write) | n/a | n/a | ✅ | ✅ | n/a | n/a |
| GraphRepository sole graph access (no direct neo4j-driver outside allowlist) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| MCP dispatcher chokepoint (no parallel tool execution) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| OpenRouter sole model-execution path (no direct provider SDK) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Closed taxonomies validated at runtime + locked by source-scan | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| No `process.env.*_API_KEY` reads anywhere in the new tree | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ADR (or doc reference) before code for new boundary | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 3. Standing-pattern carry-forwards (5 new patterns)

These extend the existing precedent menu in `agent-studio-native-graph-workspace-remaining-execution-plan.md` §"Standing patterns". Each is named so future arcs can cite them as `(precedent X)`.

### Precedent (p) — Skeleton-first with factory-throws placeholders

When an arc spans multiple PRs that share an interface surface, ship the skeleton (interfaces + barrels + `create*` factories that throw a tagged placeholder) as PR-0. Each subsequent PR flips exactly one `[T-G.2.1] X` placeholder to a real implementation. The placeholder strings are source-scan-locked so a forgotten flip trips a test, not a runtime error.

**Why it works:** Consumers can wire-without-using during the skeleton phase; tests can lock the surface contract independently of the impl; the flip-per-PR cadence forces small, reviewable slices.

**When to use:** Multi-PR arcs (3+) with a stable contract.

**When NOT to use:** Single-PR work, or arcs where the contract is still in flux.

### Precedent (q) — Source-of-truth boundary INSIDE a domain

Rather than putting all of "code-graph" behind a single facade, T-G.2 split it across `parser/` (pure, no I/O) + `persistence/` (Postgres source-of-truth) + `projection/` (Neo4j derived). Each layer's tests verify it stays on its side: persistence forbids `neo4j-driver`, projection forbids `drizzle` / `getAsDb`, parser forbids both.

**Why it works:** Failure isolation (Neo4j outage doesn't block ingest). Re-projection is a single-method call without conditionals in persistence. Each layer is independently testable.

**When to use:** Domains where Postgres → Neo4j is the canonical flow + you want re-projection without re-ingest.

### Precedent (r) — Closed-taxonomy extension as 6-touch-point checklist

Adding a new lens kind (T-G.2.5) required exactly 6 file touches:
1. `contracts.ts` — extend the `GRAPH_LENS_KINDS` const
2. `contracts.ts` — add a `GRAPH_LENS_KIND_METADATA` entry
3. `install-default-lenses.ts` — add a `DEFAULT_GRAPH_LENS_DEFINITIONS` entry
4. `install-<kind>-lens-runner.ts` — per-kind installer (envflag-gated)
5. `install-all-lens-runners.ts` — add to the omnibus composer Record
6. `public-api.ts` — re-export the new runner / reader / installer surfaces

Plus: update any test that hardcodes the kind count (currently 3 files: `graph-lens-default-installer.test.ts`, `graph-lens-install-default-stack.test.ts`, `lens-runner-registry-coverage.test.ts`).

**Why it works:** Predictable diff shape; reviewer can verify all 6 are touched without reading the impl. Most other tests already use `GRAPH_LENS_KINDS.length` and auto-update.

### Precedent (s) — Previously-excluded inclusion strictness gap

`tsconfig.json` excludes `**/services/**` from typecheck. When a new non-services entry point imports from a previously-excluded services file, that file enters the tsc include graph for the first time and may surface latent strictness gaps (e.g., discriminated-union narrowing that worked under `strict: false` only because the file wasn't checked).

T-G.2.5's lens-runner import chain (`boot.ts → graph-lens/public-api → … → reader → code-graph/contracts/public-api → code-intelligence-contracts.ts`) was the first non-services importer of that contracts file in the arc. The TS2339 from `outcome.reason` (line 317) had been latent since PR #1007 in 2026-04.

**Mitigation options:**
- (a) Fix the gap at the callsite (what T-G.2.5 hotfix did — minimal scope).
- (b) Add a sibling source-scan test that exercises every public barrel re-export so the NEXT previously-excluded file gets surfaced before merge (deferred from T-G.2.5; could be a future hygiene PR).

### Precedent (t) — Generic-by-shape UI affordance (lens-agnostic operator UX)

T-G.2.6 added a source-locator badge to lens node rows. The temptation was to gate it on `lens.kind === "code_intelligence"` so the panel knew "this is a code-graph row." Instead, the helper is keyed on meta SHAPE (`{ filePath, startLine?, endLine? }`), so any future lens that emits source locators gets the affordance for free.

**Why it works:** Avoids per-kind hardcoding in structural panel code. Operator UX scales additively as new lens kinds adopt the same meta shape.

**When to use:** UI affordances triggered by node/edge meta payload. Use the lens-kind gate only when the affordance is genuinely kind-specific (e.g., a runtime-only "replay run" button).

---

## 4. Mortgage on the next arc (T-G.3)

T-G.2 establishes the production code-graph + read-side UI. The next sub-arc in the T-G track is:

**T-G.3 — Security / DevSecOps Graph Lens (4-5 PRs)** per the remaining-execution-plan:
- Node types: CVE / SecurityFinding / Component / Package / Service / Environment / Owner / CustomerExposure / Policy / Control
- Path: `CVE → Package → Component → Service → Environment → Owner → CustomerExposure`
- External data ingestion: NVD CVE feed (read-only)
- Permission-scoped: security findings are not workspace-public

The T-G.2 standing patterns above apply to T-G.3 line-for-line:
- (p) Skeleton-first → T-G.3.1 ships interfaces for cve-feed reader + security-graph store + projection
- (q) Source-of-truth boundary INSIDE → same three-directory split (cve-feed / persistence / projection)
- (r) Closed-taxonomy extension → security_devsecops added as the 10th lens kind via the 6-touch-point checklist
- (s) Previously-excluded inclusion strictness gap → audit ahead of merge
- (t) Generic-by-shape UI affordance → the source-locator badge already covers any future shape-compatible meta

**Estimated PR count for T-G.3:** 5-6 (one per sub-slice, plus a closure ledger).

---

## 5. PR ledger

| PR | Title | Merge commit |
|----|-------|--------------|
| #1374 | T-G.2.1: code-graph production skeleton (parser/persistence/projection) | `59f4116e` |
| #1375 | T-G.2.2: wire code-graph parser to tree-sitter (production) | `73824d21` |
| #1376 | T-G.2.3: wire code-graph ASDB persistence (validated symbol batch) | `9a92f064` |
| #1377 | T-G.2.4: wire code-graph Neo4j projection via GraphRepository | `eb90de7f` |
| #1378 | T-G.2.5: code_intelligence lens runner (9th lens kind) | `4e0b1dcb` |
| #1379 | T-G.2.6: code_intelligence lens UI — source-locator badge | _(this arc)_ |
| _(this)_ | T-G.2.7: closure ledger + standing-pattern menu update | _(this PR)_ |
