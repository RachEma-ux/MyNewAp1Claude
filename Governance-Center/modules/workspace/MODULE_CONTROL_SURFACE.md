# Workspace — Control Surface

Every governance-relevant endpoint in the workspace router, mapped with procedure type, guards, and governance significance.

Source: `server/workspace/workspace-router.ts`

---

## Workspace CRUD

| Endpoint | Procedure | Guards | Logs Activity | Action Key |
|---|---|---|---|---|
| `list` | `protectedProcedure` | None (returns user's own workspaces) | No | — |
| `get` | `protectedProcedure` | `requireReadableWorkspaceRoute` | No | — |
| `createDraft` | `governedProcedure` | None (creates new workspace as owner) | Yes — `workspace.create` | `workspace.createDraft` |
| `create` | `governedProcedure` | None (backward-compat alias) | Yes — `workspace.create` | `workspace.create` |
| `update` | `governedProcedure` | `requireWorkspaceAccess` | Yes — `workspace.update` | `workspace.update` |
| `updateDraft` | `governedProcedure` | `requireWorkspaceAccess` | Yes — `workspace.update` | `workspace.updateDraft` |
| `getContext` | `protectedProcedure` | `resolveWorkspaceContext` (returns null → FORBIDDEN) | No | — |

### createDraft — Governance-Significant Details

- Seeds workspace modules via `seedWorkspaceModules(wsId, workspaceType)`
- Syncs `wizardMeta.configuration` to typed DB columns: `routingProfile`, `resourceProfile`, `shellConfig`
- Persists crew entries from `input.crew` to `workspace_crew` table
- Persists team members from `wizardMeta.team` to `workspace_members` with workerId→userId validation
- Skips team members with invalid user IDs (logs warning, does not fail)
- Optional `input.submitForReview` triggers auto-submit after creation

### updateDraft — Governance-Significant Details

- Syncs `wizardMeta.purposeStatement` to dedicated `purposeStatement` column
- Syncs `wizardMeta.configuration` to typed columns (same as createDraft)
- Crew sync: deletes existing crew, re-inserts from input
- Team sync: deletes non-owner members, re-inserts with workerId validation

---

## Lifecycle Transitions

| Endpoint | Procedure | Authority | Guards | Promotion Gate | Logs Activity | Action Key |
|---|---|---|---|---|---|---|
| `submitForReview` | `governedProcedure` | Any member | `requireWorkspaceAccess` | `validateDraftCompleteness` | Yes (via `transitionWorkspace`) | `workspace.submitForReview` |
| `review` | `governedProcedure` | Admin only | `requireWorkspaceAccess` + admin check | `validateDraftCompleteness` | Yes | `workspace.review` |
| `approve` | `governedProcedure` | Admin only | `requireWorkspaceAccess` + admin check | `validateDraftCompleteness` | Yes | `workspace.approve` |
| `publish` | `governedProcedure` | Admin only | `requireWorkspaceAccess` + admin check | `validateDraftCompleteness` | Yes | `workspace.publish` |
| `activate` | `governedProcedure` | Admin only | `requireWorkspaceAccess` + admin check | `validateDraftCompleteness` | Yes | `workspace.activate` |
| `reject` | `governedProcedure` | Admin only | `requireWorkspaceAccess` + admin check | None | Yes | `workspace.reject` |
| `archive` | `governedProcedure` | Admin only | `requireWorkspaceAccess` + admin check | None | Yes | `workspace.archive` |
| `delete` | `governedProcedure` | Admin only | `requireWorkspaceAccess` + admin check | None | Yes | `workspace.delete` |
| `returnToDraft` | `governedProcedure` | Member (rejected) / Admin (archived) | `requireWorkspaceAccess` + conditional admin | None | Yes | `workspace.returnToDraft` |
| `getLifecycle` | `protectedProcedure` | Any member | `requireReadableWorkspaceRoute` | — | No | — |
| `getReviewPacket` | `protectedProcedure` | Any member | `requireReadableWorkspaceRoute` | — (reads `validateDraftCompleteness` for readiness section) | No | — |

### validateDraftCompleteness — Promotion Gate Checks

Checked at: submitForReview, beginReview, approveWorkspace, publishWorkspace, activateWorkspace

| Check | Field | Requirement |
|---|---|---|
| Identity | `name` | Non-empty trimmed string |
| Identity | `type` | Non-null |
| Purpose | `purposeType` | Non-null |
| Purpose | `wizardMeta.purposeStatement` | Non-empty; if purposeType=`other`, minimum 20 chars |
| Anchor | `wizardMeta.anchorType` | Non-null |
| Actors | `workspaceMembers` + `workspaceCrew` | At least one team member OR crew member |
| Activities | `wizardMeta.activities.primaryType` | Non-null |
| Needs | `wizardMeta.needs` | At least one need in any category |
| Configuration | `wizardMeta.configuration.enabledModules` | At least one module enabled |
| Configuration | `wizardMeta.configuration.routingProfile` | Non-null |
| Configuration | `wizardMeta.configuration.resourceProfile` | Non-null |
| Capabilities | `wizardMeta.configuration.capabilityBundles` | Non-empty array |
| Shell | `wizardMeta.configuration.shellVisibility` | Non-null |
| Coherence | Module/resource compatibility | inference/models require elevated+ resource; vectordb requires standard+ |

---

## Members (Team)

| Endpoint | Procedure | Guards | Logs Activity | Action Key |
|---|---|---|---|---|
| `members.list` | `protectedProcedure` | `requireReadableWorkspaceRoute` | No | — |
| `members.add` | `governedProcedure` | `requireCapability("workspace.members.invite")` | Yes — `workspace.member.add` | `workspace.members.add` |
| `members.remove` | `governedProcedure` | `requireCapability("workspace.members.remove")` | Yes — `workspace.member.remove` | `workspace.members.remove` |
| `members.updateRole` | `governedProcedure` | `requireCapability("workspace.members.editRole")` | No (missing) | `workspace.members.updateRole` |

---

## Crew (AI Participation)

| Endpoint | Procedure | Guards | Logs Activity | Action Key |
|---|---|---|---|---|
| `crew.list` | `protectedProcedure` | `requireReadableWorkspaceRoute` | No | — |
| `crew.add` | `governedProcedure` | `requireCapability("workspace.manage")` | Yes — `workspace.crew.add` | `workspace.crew.add` |
| `crew.remove` | `governedProcedure` | `requireCapability("workspace.manage")` | Yes — `workspace.crew.remove` | `workspace.crew.remove` |
| `crew.update` | `governedProcedure` | `requireCapability("workspace.manage")` | No (missing) | `workspace.crew.update` |

---

## Capabilities, Modules, Activity, Shell, Routing

| Endpoint | Procedure | Guards | Logs Activity | Action Key |
|---|---|---|---|---|
| `capabilities.resolve` | `protectedProcedure` | None (resolves for caller) | No | — |
| `modules.list` | `protectedProcedure` | `requireReadableWorkspaceRoute` | No | — |
| `activity.list` | `protectedProcedure` | `requireReadableWorkspaceRoute` | No | — |
| `activity.logWizardStep` | `protectedProcedure` | None | Yes — `workspace.wizard.step.complete` | — |
| `shell.view` | `protectedProcedure` | None (resolver handles access) | No | — |
| `shell.updateConfig` | `governedProcedure` | `requireCapability("workspace.settings")` | Yes — `workspace.shell.config.update` | — |
| `getRoutingProfile` | `protectedProcedure` | `requireReadableWorkspaceRoute` | No | — |
| `updateRoutingProfile` | `governedProcedure` | `requireExecutableWorkspaceRoute` + `requireCapability("workspace.settings")` | Yes — `workspace.updateRoutingProfile` | `workspace.updateRoutingProfile` |

---

## WS Catalog Router

Source: `workspace-router.ts:974-989` — separate `wsCatalogRouter`

| Endpoint | Procedure | Guards | Significance |
|---|---|---|---|
| `listPublished` | `protectedProcedure` | None | Returns published + active workspaces only (WS Catalog) |
| `listAll` | `protectedProcedure` | None | Returns all workspaces (WS List — management inventory) |

### Note on listAll

`wsCatalogRouter.listAll` has no admin guard — any authenticated user can list all workspaces. This is documented as a gap in MODULE_OPEN_GAPS.md.

---

## Backward-Compatibility Aliases

| Alias | Maps To | Notes |
|---|---|---|
| `getActivity` | `activity.list` | Same behavior, different path |
| `getMembers` | `members.list` | Same behavior, different path |
| `getModules` | `modules.list` | Same behavior, different path |
