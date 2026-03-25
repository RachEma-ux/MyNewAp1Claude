# Workspace — Open Gaps

Honest inventory of known governance gaps in the workspace module runtime. Each gap references the source location where the gap exists.

---

## Gap Inventory

### G-01: members.updateRole does not log activity

**Location**: `workspace-router.ts:736-747` — `members.updateRole` mutation

**Description**: The `updateRole` endpoint calls `updateMemberRole()` but does not call `logActivity()`. Changing a team member's role from `editor` to `viewer` (or vice versa) produces no audit trail entry.

**Impact**: Role changes are invisible in the workspace activity log. The only evidence is the current state of `workspace_members.role`.

**Remediation**: Add `logActivity({ action: "workspace.member.updateRole", metadata: { targetUserId, newRole } })` after the mutation.

---

### G-02: crew.update does not log activity

**Location**: `workspace-router.ts:812-831` — `crew.update` mutation

**Description**: The `update` endpoint modifies crew role, capabilities, constraints, or enabled status but does not call `logActivity()`. AI participant configuration changes produce no audit trail.

**Impact**: Crew configuration drift is undetectable from the activity log.

**Remediation**: Add `logActivity({ action: "workspace.crew.update", metadata: { crewId, ...updates } })` after the mutation.

---

### G-03: Audit log failures are silently swallowed

**Location**: All `logActivity()` calls across `workspace-router.ts` and `lifecycle-service.ts:174`

**Description**: Every `logActivity()` call uses `.catch(() => {})`. If the activity log insert fails (DB error, connection loss, schema issue), the mutation completes successfully with no indication that the audit record was lost.

**Impact**: Governance audits may believe an action was logged when it was not. No compensating detection exists.

**Remediation**: Options: (a) log a console warning on failure, (b) add a dead-letter queue for failed audit writes, (c) make audit writes synchronous (tradeoff: availability). Currently the system prioritizes availability over auditability.

---

### G-04: wsCatalogRouter.listAll has no admin guard

**Location**: `workspace-router.ts:981-988` — `listAll` endpoint

**Description**: The management inventory endpoint (`listAll`) uses `protectedProcedure` only. Any authenticated user can list all workspaces across all statuses, including drafts, rejected, and archived workspaces they don't own.

**Impact**: Workspace metadata visible to any authenticated user. Does not expose workspace content (no documents/conversations), but names, types, statuses, and owner IDs are enumerable.

**Remediation**: Add `adminProcedure` or a role check to restrict to managers/admins.

---

### G-05: shell.updateConfig lacks lifecycle guard

**Location**: `workspace-router.ts:916-929` — `shell.updateConfig` mutation

**Description**: The shell config update requires `workspace.settings` capability but does not call `requireExecutableWorkspaceRoute`. This means shell config can be modified on archived or read-only workspaces.

**Impact**: Low — shell config changes on non-active workspaces have no operational effect since the workspace is not executing. But it violates the lifecycle-gating principle.

**Remediation**: Add `requireExecutableWorkspaceRoute(ctx.user.id, input.workspaceId, "workspace.shell.updateConfig")` before the capability check.

---

### G-06: Governance engine GATE_CHECK events not persisted to database

**Location**: `server/governance/` — governance middleware stdout logging

**Description**: The CGT v2 governance engine emits `[Audit] GATE_CHECK` events to console/stdout. These are not persisted to `workspace_activity_log` or any database table. Server restarts, log rotation, or container recycling lose these records.

**Impact**: Governance gate evaluation history is ephemeral. Post-incident forensics cannot reconstruct which gates were checked and when.

**Remediation**: Either pipe governance audit to the same `workspace_activity_log` table or to a dedicated governance audit table.

---

### G-07: Promotion gate failure not logged

**Location**: `lifecycle-service.ts:196-202` — `submitForReview()` throws on incomplete workspace

**Description**: When `validateDraftCompleteness` returns `{ complete: false }`, the transition function throws an error. This failed attempt is not recorded in the activity log — only successful transitions are logged (via `transitionWorkspace`).

**Impact**: Repeated failed promotion attempts are invisible. Pattern analysis (e.g., "this workspace has been rejected 5 times and still fails validation") requires manual investigation.

**Remediation**: Add `logActivity({ action: "workspace.transition.failed", metadata: { targetStatus, missingFields } })` in the catch path of each lifecycle function.

---

### G-08: Workspace-scoped module action keys partially mapped

**Location**: `action-key-map.ts:39` — `workspaces.modules.updateConfig`

**Description**: The action-key map has `workspaces.modules.updateConfig` mapped but the router doesn't expose a `modules.updateConfig` endpoint — it only has `modules.list` (read-only). The `modules.manage.setEnabled` key at line 357 maps to a different router path (`modules.manage.setEnabled`), not to the workspace router.

**Impact**: Low — the workspace `modules.list` endpoint is a read-only query and doesn't need an action key. But the phantom `workspaces.modules.updateConfig` mapping may cause confusion.

**Remediation**: Either remove the phantom mapping or add a workspace-scoped module config mutation endpoint.

---

### G-09: workspaceCrew.agentId has no FK constraint

**Location**: `drizzle/tables/users.ts` — `workspaceCrew` table definition

**Description**: The `agentId` column on `workspace_crew` has no foreign key reference to the `agents` table. Any integer can be inserted, potentially referencing non-existent or deleted agents.

**Impact**: Crew roster may contain references to agents that no longer exist. No cascade delete on agent removal.

**Remediation**: Add FK constraint with ON DELETE SET NULL or ON DELETE CASCADE, or add application-level validation.

---

### G-10: activity.logWizardStep has no access control

**Location**: `workspace-router.ts:883-902` — `activity.logWizardStep` mutation

**Description**: The wizard step logging endpoint uses `protectedProcedure` only — it does not call `requireWorkspaceAccess`. Any authenticated user can log wizard step events for any workspace.

**Impact**: Low — wizard step log entries are informational, not authoritative. But allows log pollution by non-members.

**Remediation**: Add `requireWorkspaceAccess(ctx.user.id, input.workspaceId)` before `logActivity()`.

---

## Summary

| Priority | Count | IDs |
|---|---|---|
| Should fix (audit completeness) | 4 | G-01, G-02, G-03, G-07 |
| Should fix (access control) | 2 | G-04, G-10 |
| Should fix (lifecycle consistency) | 1 | G-05 |
| Monitor / Low priority | 3 | G-06, G-08, G-09 |
