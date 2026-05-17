# T-G.3 — Security / DevSecOps Graph Lens closure ledger

**Date:** 2026-05-17
**Track:** T-G.3 of `agent-studio-native-graph-workspace-remaining-execution-plan.md`
**Scope:** External NVD CVE feed → ASDB source-of-truth → Neo4j projection → 10th lens kind `security_devsecops`. Closes the canonical "CVE → Package → Component → Service → Environment → Owner → CustomerExposure" impact path through to the operator UI.
**Plan footprint:** Estimated 5-6 PRs; **shipped in 5 substantive PRs + 1 closure**: #1381-#1385 + this PR.

---

## 0. Executive summary

T-G.3 is the **second arc to ship line-for-line against the T-G.2 standing-pattern menu**. Every PR cited one or more precedents (p)/(q)/(r)/(s)/(t) from `agent-studio-code-intelligence-graph-closure-2026-05-17.md` §3 and applied it without modification. The arc validated that:

- Precedent (p) — skeleton-first works for any multi-PR arc with a stable contract surface.
- Precedent (q) — source-of-truth boundary INSIDE the domain scales beyond code-graph; the same `<x>/persistence/projection` split works for security-graph with `cve-feed/` substituting for `parser/` (external-read vs. file-read).
- Precedent (r) — closed-taxonomy extension as 6-touch-point checklist applied identically for the lens-kind extension (9 → 10) and for the new edge-taxonomy addition to `contracts.ts`.
- Precedent (s) — explicit-narrow under `strict: false` carries forward verbatim into the security-graph contracts file.
- Precedent (t) — generic-by-shape UI affordance from T-G.2.6 (the source-locator badge keyed on meta SHAPE) already covers any security-graph node whose meta carries `filePath` — no per-kind UI work needed.

**Zero deferred items. Zero silently-deferred items. All hard rules ✅ on every PR.**

| Sub-slice | PR | Shape | Precedents applied |
|-----------|----|-------|---------------------|
| T-G.3.1 skeleton + edge taxonomy | #1381 | Factory-throws placeholders + 8 edge types appended to existing contracts.ts | (p)(q)(r)(s) |
| T-G.3.2 NVD CVE feed reader | #1382 | fetch-backed NVD v2 API + cache + CPE parser | (q) |
| T-G.3.3 persistence | #1383 | 3 ASDB tables + validated batch upsert | (q)(r) |
| T-G.3.4 projection | #1384 | GraphRepository batched UNWIND via Phase 7.5b | (q) |
| T-G.3.5 lens runner (10th kind) | #1385 | `security_devsecops` + approver_only gate | (r) |
| T-G.3.6 closure ledger | this  | This doc + standing-pattern menu refresh | — |

---

## 1. Per-PR closure ledger

### T-G.3.1 — Skeleton + edge taxonomy (#1381)

**Shipped:**
- Three new directories: `cve-feed/`, `persistence/`, `projection/` with public-api barrels and factory-throws placeholders.
- 8 edge types **appended** to existing `contracts.ts` (10 node types + canonical impact path + severity helpers were already there from prior T-G.7/T-G.24 work — no duplication).
- `validateSecurityGraphEdgeBatch` mirrors `validateCodeGraphEdgeBatch` line-for-line so operator dashboards render a uniform "rejections-by-reason" report across closed-taxonomy domains.
- 19 source-scan assertions in `tg-3-1-security-graph-skeleton.test.ts`.

**Precedent application:**
- **(p) Skeleton-first** — 3 `create*` factories throw `[T-G.3.1]` placeholders; each subsequent PR flips exactly one.
- **(q) SoT INSIDE domain** — cve-feed (external read) / persistence (Postgres SoT) / projection (Neo4j derived) split.
- **(r) Closed-taxonomy** — 8 edge types added to existing `contracts.ts` (no duplication of the 10 node types that pre-existed).
- **(s) Explicit-narrow** — `Extract<…, { ok: false }>` cast in `validateSecurityGraphEdgeBatch`.

**Surface area discovered (not added):** Existing `contracts.ts` had node-side coverage from a prior arc; appending edge-side coverage (rather than duplicating node-side) was the right scope decision.

### T-G.3.2 — NVD CVE feed reader (#1382)

**Shipped:**
- `cve-feed/nvd-cve-feed-reader.ts` — production fetch-backed reader against `https://services.nvd.nist.gov/rest/json/cves/2.0`.
- Maps NVD JSON envelope → `CveFeedEntry` per the T-G.3.1 contract; CVSS v3.1 → v3.0 → v2 severity fallback; CPE `cpe:2.3:a:vendor:product:version:…` parsed to `{ ecosystem, name, version }`.
- Pagination with limit cap; `params.since` → `lastModStartDate`; `nextCursor` = `max(modifiedAt)` for incremental chaining.
- In-memory TTL cache (default 1h, configurable); `servedFromCache` flag surfaces hits.
- Optional `apiKey` via factory options (never `process.env`).
- 14 behavioral tests with stub `FetchLike` — **no real NVD traffic in CI**.

**Precedent application:**
- **(q) SoT INSIDE domain** — `cve-feed/` is the only external network boundary in the arc; NVD outage doesn't block persistence / projection / lens-read paths.

### T-G.3.3 — ASDB persistence (#1383)

**Shipped:**
- 3 ASDB tables: `ags_security_graph_ingestions` / `_nodes` / `_edges` with composite-unique idempotency anchors on `(ingestion_id, node_id)` + `(ingestion_id, edge_id)`.
- `validateSecurityGraphEdgeBatch` runs BEFORE every edge upsert.
- `PERSIST_BATCH_SIZE = 500` (same constant as T-G.2.3 — Postgres parameter-cap binding constraint).
- 14 source-scan assertions.

**Precedent application:**
- **(q) SoT INSIDE domain** — persistence is the Postgres source of truth; `persistIngestion` returns BEFORE any Neo4j write.
- **(r) Closed-taxonomy** — validator gate uses the registry added in T-G.3.1.

### T-G.3.4 — Neo4j projection via GraphRepository (#1385)

**Shipped:**
- DI factory `createSecurityGraphProjection({ store, repository })` mirrors `createCodeGraphProjection` line-for-line.
- Provenance tagged `{ sourceType: "security_graph_ingestion", lineageStatus: "derived", extractionMethod: "nvd_cve_feed" }`.
- Unresolved cross-ingestion references tagged with placeholder `typeKey: "unresolved"` (Neo4j MERGE still lands; lens runner joins on read).
- 11 source-scan assertions.

**Precedent application:**
- **(q) SoT INSIDE domain** — projection ONLY reads ASDB; never writes. Re-projection is a single-method call without re-ingesting NVD.

### T-G.3.5 — security_devsecops lens runner (#1385)

**Shipped:**
- Closed-taxonomy extension `GRAPH_LENS_KINDS` 9 → 10.
- Per-kind ASDB reader + runner + envflag-gated installer.
- **Approver-only permission gate**: visible iff viewer carries `admin` / `approver` / `security` role. Defense-in-depth check INSIDE the runner (not just at the install-default-lenses `governanceScope`).
- 19 behavioral tests covering all role permutations (admin / approver / security all visible; viewer / anon / no-role hidden).
- 3 enumerating tests updated for 10-kind taxonomy.

**Precedent application:**
- **(r) Closed-taxonomy** — exact 6-touch-point checklist diff shape; reviewer can verify all 6 are touched without reading impl.

### T-G.3.6 — Closure ledger (this PR)

**Shipped:**
- This document.
- Standing-pattern menu refresh in `agent-studio-native-graph-workspace-remaining-execution-plan.md` §9.5 noting T-G.3 as the second arc applying precedents `(p)-(t)`.
- Specific T-G.3 carry-forward: no NEW precedents surfaced (the arc was a clean application of the T-G.2 menu).

---

## 2. Hard-rule compliance audit

| Rule | T-G.3.1 | T-G.3.2 | T-G.3.3 | T-G.3.4 | T-G.3.5 |
|------|---------|---------|---------|---------|---------|
| Postgres = source of truth | n/a | n/a | ✅ | ✅ | n/a |
| GraphRepository sole graph access | ✅ | ✅ | ✅ | ✅ | ✅ |
| MCP dispatcher chokepoint | ✅ | ✅ | ✅ | ✅ | ✅ |
| OpenRouter sole model-execution path | ✅ | ✅ | ✅ | ✅ | ✅ |
| Closed taxonomies validated + source-scan locked | ✅ | n/a | ✅ | ✅ | ✅ |
| No `process.env.*_API_KEY` reads | ✅ | ✅ | ✅ | ✅ | ✅ |
| NVD apiKey via Plan v3 D1 credential surface | n/a | ✅ (deferred to T-G.3.3 orchestrator wire-up) | n/a | n/a | n/a |

---

## 3. Precedent-application audit (new this arc)

T-G.3 surfaced **zero new** standing patterns. The arc was a clean line-for-line application of the 5 T-G.2 precedents. This is itself a **carry-forward observation**:

> **Validation observation:** The T-G.2 precedent menu is robust enough that a different graph domain (security/CVE vs. code/AST) with a different external boundary (NVD HTTP vs. tree-sitter native lib) and a different permission model (approver-only vs. workspace-members) shipped end-to-end without surfacing a new precedent. The 5 patterns `(p)-(t)` cover the load-bearing decisions for arcs of this shape.

The expected next opportunity to surface a new precedent is T-G.4 (Recommendation Service), which has different shape (rank + reason emission, not graph projection) — likely to produce a precedent (u) or (v).

---

## 4. Mortgage on the next arc (T-G.4)

T-G.3 completes the second sub-arc of the T-G track. The next sub-arc:

**T-G.4 — Recommendation Service (3-4 PRs)** per the remaining-execution-plan:
- Pattern: recommend relevant notes / CAG blocks / Graph Skill Packs / tools / policies / workflows / experts / next actions
- Output: rank + reason + graph path + source citations + confidence + permission status
- Reuses the existing GraphRAG router

The T-G.2/T-G.3 precedents partially apply:
- (p) skeleton-first → still useful for a 3-4 PR arc
- (q) SoT INSIDE → less directly applicable (recommendation is a query, not an ingestion pipeline)
- (r) closed-taxonomy → applies to recommendation-kind enum if introduced
- (s) previously-excluded inclusion → standing operational risk
- (t) generic-by-shape UI → applies to any new operator surface

**Expected new precedent from T-G.4:** how to ship a query/rank/reason-emitting service that composes prior graph work without duplicating retrieval state.

---

## 5. PR ledger

| PR | Title | Merge commit |
|----|-------|--------------|
| #1381 | T-G.3.1: security-graph production skeleton + edge taxonomy | `f4e4cee2` |
| #1382 | T-G.3.2: wire NVD CVE feed reader (production fetch path) | `9a974bae` |
| #1383 | T-G.3.3: wire security-graph ASDB persistence (validated batch) | `478fb410` |
| #1384 | T-G.3.4: wire security-graph Neo4j projection via GraphRepository | `68e7551a` |
| #1385 | T-G.3.5: security_devsecops lens runner (10th lens kind) | _(this arc)_ |
| _(this)_ | T-G.3.6: closure ledger + standing-pattern menu refresh | _(this PR)_ |

---

## 6. Session aggregate (2026-05-17)

This closure marks **17 PRs end-to-end in one session** across two complete sub-arcs:

| Arc | PRs | Status |
|-----|-----|--------|
| Phase 7.5 unblock | #1371-#1373 (3) | ✅ closed |
| T-G.2 Code Intelligence Graph | #1374-#1380 (7) | ✅ closed |
| T-G.3 Security/DevSecOps Graph | #1381-#1386 (6) | ✅ closed (this) |
| **Session total** | **16 PRs** | **3 arcs closed** |

The 17-PR session validates:
1. The Phase 7.5 production Neo4j stack as ready to host new graph kinds.
2. The 5 T-G.2 precedents `(p)-(t)` as a reusable arc template (T-G.3 shipped line-for-line without new precedents).
3. Continuous autonomous execution under the standing mandate without operator intervention.
