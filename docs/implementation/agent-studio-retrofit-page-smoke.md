# Retrofit Page — Operator Visual-Review Procedure (B4)

**Source:** Follow-up B4 of `docs/implementation/agent-studio-retrofit-followups.md`.

`client/src/**` is excluded from the local `tsc` typecheck per `tsconfig.json`; only the `build` CI job validates JSX. The `RetrofitPage` (`/agent-studio/:agentId/retrofit`) is therefore exercised by operator-driven smoke before each release.

This document captures the smoke procedure so it's the same every time. Run it after any PR that touches `RetrofitPage.tsx`, the four P11 routers (`kb`, `toolKnowledge`, `mcpSchemaSync`, `toolApprovals`), or any of the data they read.

---

## Prerequisites

1. App is running locally on `:3000` per the CLAUDE.md "MANDATORY: Local App Launch Procedure".
2. ASDB has been migrated (`pnpm run db:push`) and seeded with at least one workspace + agent + draft.
3. At least one `agsRacSources` row exists with `sourceType="tool_knowledge"` for the workspace under test (otherwise the **Tool Knowledge** tab will show empty).

## Steps

Open `http://localhost:3000/agent-studio/:agentId/retrofit` (replacing `:agentId` with a real id).

### Tab 1 — Ingestion

- [ ] Page renders with a "Universal Ingestion — KB freshness" header.
- [ ] If the workspace has no knowledge units yet: empty state shows "No knowledge units yet" and the total counter reads `0 total unit(s)`.
- [ ] If the workspace has units: a 3-up grid renders for each freshness state (`fresh`, `stale`, `expired`) with the count.
- [ ] The browser console is free of unexpected errors (network, react, etc.).

### Tab 2 — Knowledge Units

- [ ] List renders with up to 50 unit rows, newest-first by id.
- [ ] Each row shows: `#<id>`, `<unitType>` badge, freshness badge, validation badge, and a 240-char content preview.
- [ ] The "Source ID filter" input accepts an integer; entering a real `sourceId` filters the list to rows from that source.
- [ ] Clearing the input restores the unfiltered list.
- [ ] Console clean.

### Tab 3 — Provenance Inspector

- [ ] Empty initial state renders the input field only.
- [ ] Entering a real unit id loads the unit's metadata + provenance row as JSON.
- [ ] Entering an invalid (or non-existent) id surfaces a `not found` red error message — page does not crash.
- [ ] Console clean.

### Tab 4 — Tool Knowledge

- [ ] List renders mirror rows (Phase 7 sync targets) with `mcpServerId / toolName / riskClass` badge and last-seen timestamp.
- [ ] If no rows: empty state shows "No tool-knowledge rows" with the "Run mcpSchemaSync.sync first" hint.
- [ ] Filtering by `MCP server id` narrows the list.
- [ ] `riskClass` badge correctly renders for each of `read_only`, `write`, `external_side_effect`, `governance_sensitive`, `credential_sensitive`, `code_execution`, `destructive`, `quarantined`.
- [ ] Console clean.

### Tab 5 — Approvals

- [ ] When no pending approvals exist for the draft: empty state shows "Nothing pending".
- [ ] When pending approvals exist (insert one via `agentStudio.toolApprovals` or `createApprovalRequest`): each renders as a card with `#<id>`, tool name, `pending` badge, hash prefix, optional description, reason textarea, and Allow/Deny buttons.
- [ ] Clicking **Allow**:
  - Sends a successful mutation (the toast surfaces "approval allowed").
  - The row disappears from the list (refetched by the `invalidate` call).
  - The corresponding `agsPendingPermissionRequests` row in ASDB has `status='allowed'` + `expiresAt` set.
  - A row is written to `agsRuntimePolicyEvents` with `policyKey='approval_gate'` and `decision='allowed'` (D-APP-EXT-6).
- [ ] Clicking **Deny** with a reason:
  - Toast surfaces "approval denied".
  - The row disappears.
  - The DB row carries the reason text.
- [ ] Clicking either action while another decision is in-flight: button disabled state holds during pending mutation.
- [ ] Console clean.

## Cross-cutting

- [ ] Sidebar shows the **Retrofit** entry under the **Runtime** group with a `BookOpen` icon.
- [ ] Clicking another sidebar item then returning preserves the active tab via the URL (or restarts cleanly at "Ingestion" — both are acceptable).
- [ ] Browser back/forward navigation to and from the retrofit URL is clean (no double-renders, no console warnings).

## Failure recording

If any of the above fails, file an issue with:

- The exact step that failed (`Tab N — <name> — <bullet>`).
- A screenshot of the page + the console.
- The latest commit on `main` (`git rev-parse main`).
- The URL of any related ASDB row state.

---

This procedure is the contract for the UI's behavior. Future PRs that touch the page are expected to update **and re-walk** the procedure.
