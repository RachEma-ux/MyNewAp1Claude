# UI Smoke Matrix — Phase 8 manual checklist

This is the codified Phase 8 deliverable from the production-readiness
verification report (Tier 1, Step 4):
*"Run the Phase 8 manual smoke matrix against staging — every
RTLM's golden path × edge cases (15 capsules × representative paths)."*

The report flagged Phase 8 as BLOCKED with no artifact. This file
*is* the artifact. It does not run automatically — Phase 8 is by
definition a browser-driven, human-confirmed pass — but it
documents exactly what to verify, in what order, and what
counts as failure.

## How to run

1. Bring up the staging environment per
   `docs/deployment/staging-readiness.md`.
2. Boot the app: `pnpm run start` against the staging DSN.
3. Sign in via OAuth (or in DEV_MODE if explicitly authorised).
4. For each capsule below, walk the golden path then the edge
   cases. Record pass/fail in a tracking issue or spreadsheet.
5. Re-run after any non-trivial capsule change.

A row is **PASS** when every cell renders, every interactive
element responds, and no console errors land in the Inspector.
A row is **FAIL** when any of the above breaks; capture a
screenshot + console transcript.

## Capsule matrix

The 15 RTLM capsules in canonical order. Each capsule's base
route is the entry point; the golden path is the canonical
happy flow; edge cases are the regressions worth catching.

### 1. PM Central — `/pm`

* **Golden path:** dashboard renders → create project → project
  detail loads → add task → task appears in board.
* **Edge cases:**
  * Empty state (no projects).
  * Permission-denied path (non-admin viewing a private project).
  * Concurrent edit (two tabs editing the same task).

### 2. PS (Problem Solving) — `/ps`

* **Golden path:** ideation shell loads → create ideation → matrix
  engine opens → context translator suggests → matrix saves.
* **Edge cases:**
  * Translator unavailable (worker down) → degraded UI.
  * Matrix without filled cells (validation).
  * Pagination across >50 ideations.

### 3. PSM (Problem Solving Management) — `/psm`

* **Golden path:** case list → create case → case detail → status
  transition → case closed.
* **Edge cases:**
  * Invalid status transition (UI rejects).
  * Reassignment with audit trail.
  * Filter + sort under heavy data.

### 4. PRM (Personal Records Management) — `/prm`

* **Golden path:** list view → create record → edit → save → record
  appears in list.
* **Edge cases:**
  * Permission-bounded record (other user's record not visible).
  * Soft-delete + restore.

### 5. HR — `/hr`

* **Golden path:** directory loads → employee detail → onboarding
  start → onboarding step complete → employee state advances.
* **Edge cases:**
  * Field masking — non-HR role sees masked compensation.
  * Sensitive read audit row created.
  * Cross-module link to PM Central project.

### 6. Organization Management — `/org`

* **Golden path:** org chart renders → expand node → unit detail
  loads → role assignment.
* **Edge cases:**
  * Circular reporting prevention.
  * Bulk import via CSV.

### 7. Culture & Values — `/cv`

* **Golden path:** values dashboard → values list → individual value
  detail → edit + save.
* **Edge cases:**
  * Empty values catalog.
  * Markdown rendering on long descriptions.

### 8. AI Types — `/ai-types`

* **Golden path:** ai-types list → catalog detail → execute against
  catalog entry → execution observability records the run.
* **Edge cases:**
  * Catalog entry blocked (no active bundle) → run recorded as
    blocked, not as success.
  * Provider rotation mid-run.
  * Conversation linkage when an existing conversation is provided.

### 9. OpenRouter — base route declared by capsule manifest

* **Golden path:** providers list loads → provider detail → enable
  routing → route a chat request through it.
* **Edge cases:**
  * Provider auth failure → clean error surface.
  * Routing override per workspace.

### 10. Agent Studio — `/agent-studio`

* **Golden path:** agent list → create agent → behavior + prompts
  → publish → agent appears in catalog (post-PR #82, both
  `/catalog/skills` and `/catalog/tools` are pinned in the
  routeInventory).
* **Edge cases:**
  * Governance gate blocks unapproved publish.
  * Versions compare view.
  * Subagent / MCP manager flows.

### 11. Sandbox WF — `/automation/sandbox-wf`

* **Golden path:** workflow list → create workflow → drop nodes →
  connect edges → save → run → execution row created.
* **Edge cases:**
  * Permission denied for non-owner edit / publish / execute.
  * Workflow with cyclic edges → validation rejects.
  * Time trigger fires at the scheduled time.

### 12. KGRA Agent — `/data-analysis/kgra-agent`

* **Golden path:** designer loads → query → KGRA Agent answers →
  graph view renders.
* **Edge cases:**
  * GraphRAG worker down → clean degraded UI.
  * Query against an empty graph.
  * Cross-link from a PSM case to a KGRA query.

### 13. Code Studio — `/code-studio`

* **Golden path:** repository list → file tree → editor opens → save
  → audit job template renders.
* **Edge cases:**
  * Built-in templates load on first visit.
  * Audit job runs to completion.

### 14. Communication — base route declared by capsule manifest

* **Golden path:** channels list → message thread → send message →
  message appears.
* **Edge cases:**
  * Cross-module mention (link to a PM project).
  * Permission-bounded channel.

### 15. Data Analysis (umbrella, includes Data Acquisition + GraphRAG) — `/data-analysis`

* **Golden path:** dashboard → data sources list → run an
  acquisition → run a GraphRAG query.
* **Edge cases:**
  * Worker unavailable → degraded UI for that subdomain only.
  * Data warehouse query under load.

## Cross-cutting checks (run after each capsule pass)

* **Auth bypass off in production:** confirm the app refuses to
  render without a valid session. The env-guard at
  `server/_core/env.ts` should prevent the server from booting
  with `DEV_MODE=true && NODE_ENV=production` (unless
  `ALLOW_DEV_MODE_IN_PROD=true`).
* **No console errors:** Inspector → Console — zero red lines
  across the matrix above.
* **No 5xx responses:** Network tab — every request resolves
  with 2xx / 3xx / 4xx (4xx is acceptable for permission paths).
* **Hardening dashboard:** `runHardeningCheck()` returns
  `allCriticalPassed: true` (Phase 11 already verifies this in
  static checks; the manual sanity is to confirm production
  config matches).

## Sign-off

A Phase 8 pass requires every capsule row PASS plus every
cross-cutting check PASS. Capture results in the readiness
tracking issue with: capsule, path, browser, viewport,
verdict, link to screenshot/transcript.

## Updating this file

* Re-run the matrix after any change to a capsule's
  `routeInventory`, navigation, or layout shell.
* Add a row whenever a new capsule is migrated.
* Drop or revise a row whenever a path is deprecated or moved.
