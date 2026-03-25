# Workspace — Audit Model

## Audit Infrastructure

Workspace audit logging uses the `workspace_activity_log` table via the `logActivity()` function from `server/modules/registry.ts`.

### logActivity Signature

```ts
logActivity({
  workspaceId: number,
  actorId: number,
  action: string,
  metadata?: Record<string, unknown>,
})
```

### Failure Handling

All `logActivity()` calls in the workspace router use `.catch(() => {})` — audit failures are **swallowed silently**. The mutation succeeds regardless of whether the log was written. This is an intentional availability-over-auditability tradeoff documented as a known gap.

### Storage

Logs are stored in `workspace_activity_log` table (schema: `drizzle/schema.ts`). Queryable via `activity.list` endpoint with workspace-scoped access control.

---

## What Is Logged

### Lifecycle Transitions

| Action Key | Trigger | Metadata |
|---|---|---|
| `workspace.transition.ready_for_review` | `submitForReview()` | `{ previousStatus, newStatus }` |
| `workspace.transition.under_review` | `beginReview()` | `{ previousStatus, newStatus }` |
| `workspace.transition.approved` | `approveWorkspace()` | `{ previousStatus, newStatus, notes? }` |
| `workspace.transition.published` | `publishWorkspace()` | `{ previousStatus, newStatus }` |
| `workspace.transition.active` | `activateWorkspace()` | `{ previousStatus, newStatus }` |
| `workspace.transition.rejected` | `rejectWorkspace()` | `{ previousStatus, newStatus, reason }` |
| `workspace.transition.archived` | `archiveWorkspace()` | `{ previousStatus, newStatus }` |
| `workspace.transition.deleted` | `softDeleteWorkspace()` | `{ previousStatus, newStatus }` |
| `workspace.transition.draft` | `returnToDraft()` | `{ previousStatus, newStatus }` |

Source: `lifecycle-service.ts:164-174` — `transitionWorkspace()` emits `workspace.transition.{targetStatus}`

### CRUD Operations

| Action Key | Trigger | Metadata |
|---|---|---|
| `workspace.create` | `createDraft()` / `create()` | `{ workspaceType, crewCount?, teamCount? }` |
| `workspace.update` | `update()` / `updateDraft()` | `{ ...updates }` (changed fields) |

### Team (Member) Changes

| Action Key | Trigger | Metadata |
|---|---|---|
| `workspace.member.add` | `members.add` | `{ targetUserId, role }` |
| `workspace.member.remove` | `members.remove` | `{ targetUserId }` |

### Crew (AI) Changes

| Action Key | Trigger | Metadata |
|---|---|---|
| `workspace.crew.add` | `crew.add` | `{ agentId, agentName, participantType }` |
| `workspace.crew.remove` | `crew.remove` | `{ crewId }` |

### Configuration Changes

| Action Key | Trigger | Metadata |
|---|---|---|
| `workspace.shell.config.update` | `shell.updateConfig` | (none) |
| `workspace.updateRoutingProfile` | `updateRoutingProfile` | (none) |

### Wizard Steps

| Action Key | Trigger | Metadata |
|---|---|---|
| `workspace.wizard.step.complete` | `activity.logWizardStep` | `{ stepNumber, stepId, phase }` |

---

## What Is NOT Logged

| Gap | Endpoint | Impact |
|---|---|---|
| Role updates | `members.updateRole` | Role changes to team members are not audit-logged |
| Crew updates | `crew.update` | Crew capability/constraint/role changes are not logged |
| Capability resolution | `capabilities.resolve` | No record of who checked capabilities and when |
| Shell view reads | `shell.view` | No visibility into who viewed the shell |
| Review packet reads | `getReviewPacket` | No record of who assembled/read the review packet |
| Promotion gate failures | `validateDraftCompleteness` | Failed promotion attempts are not logged (only successful transitions) |
| Team member sync (wizard) | `createDraft` / `updateDraft` team sync | Bulk team member insertion/replacement during wizard is not individually logged |
| Crew sync (wizard) | `updateDraft` crew sync | Bulk crew replacement is not individually logged |
| listAll queries | `wsCatalogRouter.listAll` | No record of who viewed the management inventory |

---

## Governance Engine Audit (CGT v2)

The governance engine (`server/governance/`) produces its own audit records via the `GATE_CHECK` system. These appear in server logs as `[Audit] GATE_CHECK {scope}:{workspaceId} → {result}`.

| Event | Source | Scope |
|---|---|---|
| `GATE_CHECK` | Governance middleware | `team`, `system`, `lifecycle_gate`, `approval_required` |
| `LIFECYCLE_TRANSITION` | Governance middleware | `agent`, `catalog_entry` |

These are separate from `workspace_activity_log` and are currently emitted to stdout/console only — not persisted to database.

---

## Audit Queryability

| Query Path | Endpoint | Access Control |
|---|---|---|
| Workspace activity log | `activity.list` / `getActivity` | `requireReadableWorkspaceRoute` — workspace member only |
| Per-workspace, most-recent-first | Default ordering: `desc(workspaceActivityLog.createdAt)` | Limit: 1-100, default 20 |
