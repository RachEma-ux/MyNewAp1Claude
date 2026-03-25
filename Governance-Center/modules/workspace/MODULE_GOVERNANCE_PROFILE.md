# Workspace — Governance Profile

## Governance Dimensions

| Dimension | Status | Evidence |
|---|---|---|
| Procedure wrapper | `governedProcedure` on all mutations | `workspace-router.ts` — createDraft, create, update, updateDraft, all lifecycle transitions, all member/crew mutations, shell.updateConfig, updateRoutingProfile |
| Lifecycle enforcement | 9-status model with transition validation | `workspace-lifecycle.ts:21-31` — `LIFECYCLE_TRANSITIONS` map; `validateTransition()` throws on invalid moves |
| Promotion gates | Content-completeness gate at every forward transition | `lifecycle-service.ts:37-117` — `validateDraftCompleteness()` called by submitForReview, beginReview, approveWorkspace, publishWorkspace, activateWorkspace |
| Authority model | Admin role checks on governance transitions; capability checks on member/crew/settings | Router lines 542, 551, 559, 569, 578, 587, 596 — `ctx.user.role !== "admin"` checks; `requireCapability` on members.add/remove/updateRole, crew.add/remove/update, shell.updateConfig, updateRoutingProfile |
| Access control | Workspace membership + deleted-status blocking | `workspace-guards.ts:39-70` — `requireWorkspaceAccess` |
| Capability model | RBAC resolver with legacy fallback | `capability-resolver.ts:54-141` — reads workspace_roles, workspace_role_capabilities, workspace_principal_capabilities; owner gets all capabilities |
| Module enablement | Per-workspace module gates | `workspace-guards.ts:181-192` — `requireModuleEnabled` |
| Activity logging | `logActivity()` on mutations and transitions | `workspace-router.ts` — called after create, update, member changes, crew changes, lifecycle transitions, wizard steps, shell config, routing profile |
| Action-key mapping | All workspace mutations mapped in action-key-map | `action-key-map.ts:19-39` — 19 workspace action keys |

## Authority Model

### Governance Transitions (lifecycle moves)

| Transition | Authority | Enforcement Point |
|---|---|---|
| `submitForReview` (draft → ready_for_review) | Any workspace member | `requireWorkspaceAccess` only |
| `review` (ready_for_review → under_review) | Admin only | `ctx.user.role !== "admin"` check |
| `approve` (under_review → approved) | Admin only | `ctx.user.role !== "admin"` check |
| `publish` (approved → published) | Admin only | `ctx.user.role !== "admin"` check |
| `activate` (published → active) | Admin only | `ctx.user.role !== "admin"` check |
| `reject` (under_review → rejected) | Admin only | `ctx.user.role !== "admin"` check |
| `archive` (active/approved/published → archived) | Admin only | `ctx.user.role !== "admin"` check |
| `delete` (archived → deleted) | Admin only | `ctx.user.role !== "admin"` check |
| `returnToDraft` (rejected → draft) | Any workspace member | `requireWorkspaceAccess` only |
| `returnToDraft` (archived → draft) | Admin only | Status-conditional admin check |

### Participation Governance

| Action | Required Capability | Enforcement |
|---|---|---|
| `members.add` | `workspace.members.invite` | `requireCapability` |
| `members.remove` | `workspace.members.remove` | `requireCapability` |
| `members.updateRole` | `workspace.members.editRole` | `requireCapability` |
| `crew.add` | `workspace.manage` | `requireCapability` |
| `crew.remove` | `workspace.manage` | `requireCapability` |
| `crew.update` | `workspace.manage` | `requireCapability` |

### Configuration Governance

| Action | Required Capability | Enforcement |
|---|---|---|
| `shell.updateConfig` | `workspace.settings` | `requireCapability` |
| `updateRoutingProfile` | `workspace.settings` | `requireCapability` + `requireExecutableWorkspaceRoute` |

## Capability Resolution (Legacy Fallback)

When RBAC tables are not seeded, capabilities are derived from the legacy role string:

| Role | Key Capabilities |
|---|---|
| `owner` | All 32 capabilities including `workspace.manage`, `governance.manage`, `workspace.billing` |
| `admin` | All except `workspace.manage` and `workspace.billing` — has `governance.manage`, `workspace.settings`, member management |
| `editor`/`member` | Read + write capabilities (`chat.send`, `documents.upload`, `agents.create`, `workflows.execute`, `governance.view`) |
| `viewer` | Read-only capabilities (`models.view`, `documents.view`, `agents.view`, `workflows.view`, `governance.view`) |

Source: `capability-resolver.ts:200-304` — `legacyRoleToCapabilities()`

## Compliance Principles

1. **No promotion without structured content** — `validateDraftCompleteness` checks 12+ dimensions before any forward lifecycle transition
2. **Admin-gated governance transitions** — Review, approve, publish, activate, reject, archive, delete all require admin role
3. **Capability-gated participation** — Member and crew mutations require specific capability keys resolved via RBAC or legacy fallback
4. **Lifecycle-gated execution** — Only `active` workspaces allow full operational execution; draft/review/rejected allow setup mutations only
5. **Deleted = inaccessible** — Deleted workspaces throw NOT_FOUND on all access attempts
6. **Activity trail on state changes** — All mutations emit `logActivity()` records (failures are swallowed, not blocking)
7. **Module isolation** — Each workspace has independently-enabled modules; module routes check enablement before processing
