# Workspace — Periodic Governance Checks

Recurring checks that should be performed on the workspace module to maintain governance health. These are not automated — they are manual or script-assisted checks to be performed on a regular cadence.

---

## Check Registry

### PC-01: Stale Drafts Audit

**Cadence**: Weekly
**What**: Identify workspaces in `draft` status that have not been updated in 30+ days.
**Why**: Abandoned drafts waste resources and may contain incomplete governance data. If a workspace has been in draft for 30 days without activity, it may need archival or deletion.
**How**: Query `workspaces WHERE status = 'draft' AND updatedAt < NOW() - INTERVAL '30 days'`
**Action**: Contact workspace owner. If no response in 7 days, escalate to admin for archival decision.

### PC-02: Long-Running Review Audit

**Cadence**: Weekly
**What**: Identify workspaces in `ready_for_review` or `under_review` status for 14+ days.
**Why**: Workspaces stuck in review may indicate governance process bottlenecks. The review process should complete within a reasonable window.
**How**: Query `workspaces WHERE status IN ('ready_for_review', 'under_review') AND updatedAt < NOW() - INTERVAL '14 days'`
**Action**: Notify assigned reviewer/admin. Document the delay reason in the workspace activity log.

### PC-03: Approved-But-Not-Published Check

**Cadence**: Weekly
**What**: Identify workspaces in `approved` status for 7+ days without progressing to `published`.
**Why**: Approved workspaces are governance-validated but invisible to participants. Prolonged approved state may indicate a forgotten publication step.
**How**: Query `workspaces WHERE status = 'approved' AND updatedAt < NOW() - INTERVAL '7 days'`
**Action**: Notify workspace owner/admin about pending publication.

### PC-04: Published-But-Not-Active Check

**Cadence**: Weekly
**What**: Identify workspaces in `published` status for 14+ days without activation.
**Why**: Published workspaces are visible in the WS Catalog but not executable. Prolonged published state creates participant confusion — they can discover the workspace but cannot use it.
**How**: Query `workspaces WHERE status = 'published' AND updatedAt < NOW() - INTERVAL '14 days'`
**Action**: Notify workspace owner/admin. Either activate or archive.

### PC-05: Orphaned Workspace Detection

**Cadence**: Monthly
**What**: Identify workspaces whose `ownerId` references a user that has been deactivated, deleted, or is no longer active.
**Why**: Orphaned workspaces have no responsible owner for governance actions (submit, archive, etc.).
**How**: Query `workspaces w LEFT JOIN users u ON w.ownerId = u.id WHERE u.id IS NULL OR u.status = 'inactive'`
**Action**: Assign to admin for ownership transfer or archival.

### PC-06: Promotion Gate Regression Check

**Cadence**: After each deployment
**What**: Verify that `validateDraftCompleteness` still checks all required dimensions.
**Why**: Code changes could accidentally remove a validation check, weakening the promotion gate.
**How**: Run workspace lifecycle tests (`npx vitest run server/workspace/workspace-lifecycle.test.ts`). Review `lifecycle-service.ts:37-117` for any missing checks vs the documented list.
**Action**: If a check was removed, restore it or document the intentional change with governance approval.

### PC-07: Capability Resolver Coverage

**Cadence**: Monthly
**What**: Verify that the legacy role→capability mapping in `capability-resolver.ts:200-304` covers all capabilities that are checked by `requireCapability` calls across the workspace router.
**Why**: If a new `requireCapability("new.capability")` check is added to a route but not to the legacy fallback, users without RBAC data will be blocked.
**How**: Grep for `requireCapability` calls in workspace files. Compare capability keys against the sets in `legacyRoleToCapabilities()`.
**Action**: Add missing capabilities to the appropriate role sets.

### PC-08: Activity Log Integrity Spot-Check

**Cadence**: Monthly
**What**: For 5 randomly selected workspaces, compare the activity log entries against the workspace's current status and member list. Verify that the log tells a coherent story (create → member adds → submit → review → approve, etc.).
**Why**: Since audit failures are swallowed (G-03), some transitions may have occurred without log entries.
**How**: Query `workspace_activity_log WHERE workspaceId = X ORDER BY createdAt`. Compare against `workspaces.status` and `workspace_members`.
**Action**: If gaps are found, investigate whether `logActivity` failures occurred. Consider implementing G-03 remediation.

---

## Check Summary

| ID | Check | Cadence | Automated |
|---|---|---|---|
| PC-01 | Stale drafts | Weekly | No (query template provided) |
| PC-02 | Long-running reviews | Weekly | No |
| PC-03 | Approved not published | Weekly | No |
| PC-04 | Published not active | Weekly | No |
| PC-05 | Orphaned workspaces | Monthly | No |
| PC-06 | Promotion gate regression | Per-deploy | Partial (test suite) |
| PC-07 | Capability resolver coverage | Monthly | No |
| PC-08 | Activity log integrity | Monthly | No |
