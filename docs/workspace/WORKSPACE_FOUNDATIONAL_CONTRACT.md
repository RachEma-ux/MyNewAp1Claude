# Workspace Foundational Contract

## Canonical Definition

```text
Workspace
= a controlled, contextual execution environment
where users and agents deploy structured activities
using a defined set of resources,
with isolated state, permissions, and configuration,
and optionally accountable resource allocation,
in order to achieve goals, carry out missions, or accomplish projects.
```

---

## 1. Workspace Invariants Matrix

| ID | Invariant | Meaning | Enforcement target |
|---|---|---|---|
| WS-01 | Every structured activity must belong to a workspace | No execution exists outside context | runtime / API |
| WS-02 | Every workspace must have a defined purpose | Goal, mission, or project must be identifiable | schema / API |
| WS-03 | Workspace state is isolated | Sessions, runs, local memory, activity logs do not leak across workspaces | DB / queries / runtime |
| WS-04 | Workspace permissions are isolated | Access decisions are evaluated in workspace scope | RBAC / API |
| WS-05 | Workspace configuration is isolated | Routing, enabled modules, defaults, policies apply per workspace | schema / runtime |
| WS-06 | Workspace resources are explicitly scoped | Only assigned/enabled resources can be used in that workspace | runtime / selectors |
| WS-07 | Users and agents act through workspace context | No user/agent action is context-free | runtime / API |
| WS-08 | Workspace does not create global truth | Workspace consumes and uses entities; it does not redefine global identity/governance | architecture / services |
| WS-09 | Workspace membership governs participation | Only members or authorized principals may access workspace operations | API / RBAC |
| WS-10 | Workspace capability checks are authoritative | Role labels alone are not enough; effective permissions must be resolved | RBAC / runtime |
| WS-11 | Workspace module access is explicit | A module must be enabled to be used in that workspace | module gate / API |
| WS-12 | Workspace activity must be traceable | Actions inside a workspace must be attributable to principal + workspace | audit / activity log |
| WS-13 | Optional resource accountability must be attributable | If enabled, usage/accountability must be traceable to workspace and/or job | audit / usage layer |
| WS-14 | Workspace must remain purpose-neutral but purpose-capable | It can represent team, project, mission, strategy, or cost lens without changing core model | architecture |
| WS-15 | Workspace is an execution boundary, not merely a view | UI, API, data, and execution all respect workspace boundaries | end-to-end |

---

## 2. Workspace Entity Model Matrix

### Core Workspace Schema

| Field | Required | Purpose | Notes |
|---|---|---|---|
| `id` | yes | workspace identity | primary key |
| `name` | yes | human-readable label | unique enough for UX |
| `description` | optional | explain intent | recommended |
| `type` | yes | workspace category | generic/personal/project/research/etc. |
| `purposeType` | yes | goal / mission / project / team / strategy / other | explicit purpose anchor |
| `purposeRef` | optional | linked objective id if applicable | external reference |
| `ownerId` | yes | accountable owner | principal reference |
| `status` | yes | lifecycle state | created/configured/active/paused/archived/deleted |
| `routingProfile` | optional | execution/routing behavior | per workspace |
| `resourceProfile` | optional | resource visibility/accountability config | not necessarily cost enforcement |
| `createdAt` | yes | auditability | timestamp |
| `updatedAt` | yes | auditability | timestamp |

### Workspace Membership Schema

| Field | Required | Purpose |
|---|---|---|
| `workspaceId` | yes | workspace scope |
| `userId` | yes | human principal |
| `roleId` | optional | richer RBAC role |
| `roleLabel` | compatibility | owner/admin/member/viewer |
| `joinedAt` | yes | audit |
| `status` | optional | active/invited/suspended |

### Workspace Capability Schema

| Field | Required | Purpose |
|---|---|---|
| `workspaceRoleId` | yes | role reference |
| `capabilityId` | yes | permission atom |
| `scope` | yes | workspace/module/resource/action |
| `constraints` | optional | fine-grained limits |

### Workspace Activity Schema

| Field | Required | Purpose |
|---|---|---|
| `workspaceId` | yes | boundary |
| `actorId` | optional | principal |
| `actorType` | yes | user / agent / system |
| `moduleKey` | optional | module source |
| `action` | yes | event name |
| `targetType` | optional | resource type |
| `targetId` | optional | resource id |
| `metadata` | optional | event detail |
| `createdAt` | yes | traceability |

---

## 3. Schema Rules Matrix

| Rule ID | Rule | Type |
|---|---|---|
| SR-01 | `workspace.name` must not be empty | validation |
| SR-02 | `workspace.ownerId` must exist | FK |
| SR-03 | `workspace.type` must be from controlled enum | validation |
| SR-04 | `workspace.status` must be from controlled lifecycle enum | validation |
| SR-05 | `workspace.purposeType` must be present | validation |
| SR-06 | membership rows must reference valid workspace and valid principal | FK |
| SR-07 | a principal cannot have duplicate active membership entries in the same workspace | unique constraint |
| SR-08 | module bindings must be unique per (`workspaceId`, `moduleKey`) | unique constraint |
| SR-09 | workspace role names must be unique within workspace | unique constraint |
| SR-10 | capability overrides must be unique per (`workspaceId`, principal, capability) | unique constraint |
| SR-11 | deleted workspace cannot have active members/modules | lifecycle rule |
| SR-12 | archived workspace is read-only unless explicitly allowed | lifecycle rule |

---

## 4. API Rules Matrix

### Workspace API Principles

| ID | Rule | Meaning |
|---|---|---|
| API-WS-01 | Every workspace-facing endpoint must accept or derive `workspaceId` | no implicit global workspace |
| API-WS-02 | Every workspace-facing endpoint must resolve `WorkspaceContext` first | no direct execution without context |
| API-WS-03 | Every mutating endpoint must evaluate effective capabilities | not just membership existence |
| API-WS-04 | Every workspace query must return only workspace-scoped data | no global leakage |
| API-WS-05 | Workspace module endpoints must verify module enabled state | no disabled-module bypass |
| API-WS-06 | Workspace settings updates must require elevated capability | owner/admin governed |
| API-WS-07 | Activity-producing endpoints must emit workspace-attributed audit/event records | traceability |
| API-WS-08 | Archived/deleted workspace must block normal execution endpoints | lifecycle enforcement |

### Required Workspace API Surface

| Endpoint family | Purpose |
|---|---|
| `workspaces.list` | list accessible workspaces |
| `workspaces.create` | create new workspace |
| `workspaces.get` | fetch workspace |
| `workspaces.update` | update metadata/config |
| `workspaces.delete/archive` | lifecycle control |
| `workspaces.getContext` | resolve canonical workspace context |
| `workspaces.members.*` | manage participation |
| `workspaces.capabilities.resolve` | resolve effective permissions |
| `workspaces.modules.*` | enable/disable scoped modules |
| `workspaces.activity.list` | trace activity |
| `workspaces.resources.list` | list available resources inside workspace |

---

## 5. Workspace Context Contract

### Formal Runtime Context

```ts
interface WorkspaceContext {
  workspaceId: number
  workspaceName: string
  status: "created" | "configured" | "active" | "paused" | "archived" | "deleted"
  purposeType: "goal" | "mission" | "project" | "team" | "strategy" | "other"
  userId: number
  effectiveRole: string | null
  effectiveCapabilities: string[]
  enabledModules: string[]
  routingProfile?: unknown
  resourceProfile?: unknown
}
```

### Runtime Rules

| Runtime Rule | Meaning |
|---|---|
| RT-WS-01 | No execution without `WorkspaceContext` |
| RT-WS-02 | No query without workspace scope where workspace semantics apply |
| RT-WS-03 | No module action if module not enabled in workspace |
| RT-WS-04 | No privileged action without capability resolution |
| RT-WS-05 | No cross-workspace access to local state/resources |
| RT-WS-06 | All activity records must include `workspaceId` |

---

## 6. Resource Rules Matrix

Resource logic stays neutral. Cost-center behavior is optional, not inherent to workspace identity.

| ID | Rule | Meaning |
|---|---|---|
| RES-WS-01 | Resources available to a workspace must be explicitly defined or derivable | no accidental global resource access |
| RES-WS-02 | Resource visibility and use must respect workspace configuration | routing/models/tools can differ |
| RES-WS-03 | Resource accountability, if enabled, must be attributable | optional accounting lens |
| RES-WS-04 | Resource accountability must not redefine workspace identity | workspace remains context first |
| RES-WS-05 | Job/mission usage may be aggregated by workspace when needed | compatible with the model |

---

## 7. Purpose Rules Matrix

| ID | Rule | Meaning |
|---|---|---|
| PUR-01 | A workspace must serve a declared purpose | not an empty shell |
| PUR-02 | Purpose may be goal, mission, project, team, strategy, or equivalent | universal model |
| PUR-03 | Purpose does not change workspace core semantics | same model, different usage |
| PUR-04 | Multiple activities may exist under one workspace if aligned with its purpose | supports teams and long-lived environments |
| PUR-05 | Jobs/missions remain execution units inside the workspace | no confusion between workspace and job |

---

## 8. Anti-Patterns Matrix

| Anti-pattern | Why it violates the contract |
|---|---|
| Run task without `workspaceId` | breaks WS-01 / WS-07 |
| Use global list in workspace page | breaks WS-03 / API-WS-04 |
| Check role string only, ignore capabilities | breaks WS-10 |
| Let disabled module be callable | breaks WS-11 |
| Share local state across workspaces by default | breaks WS-03 |
| Treat workspace as only a UI container | breaks WS-15 |
| Make workspace the only possible cost model | breaks WS-14 / RES neutrality |
| Let archived workspace continue normal execution | breaks API-WS-08 |

---

## 9. Validation Matrix

| Area | Must validate |
|---|---|
| Context | every workspace route resolves context |
| Membership | only authorized principals get in |
| Capabilities | effective access comes from capability model |
| Scoping | workspace pages/services use workspace-scoped queries |
| Modules | disabled modules are blocked |
| State | sessions/logs/runs stay inside workspace boundary |
| Configuration | routing/settings are applied per workspace |
| Purpose | workspace carries explicit operational purpose |
| Activity | actions are attributable to workspace |

---

## 10. Minimal Enforcement Checklist

| Checklist item | Status target |
|---|---|
| `WorkspaceContext` exists | mandatory |
| capability resolver active | mandatory |
| workspace-scoped query variants exist | mandatory |
| module gate enforced server-side and UI-side | mandatory |
| activity log tied to workspace | mandatory |
| purpose field present | strongly recommended |
| resource accountability support optional | optional but compatible |

---

## Final Formal Statement

A Workspace is a controlled, contextual execution environment.
Therefore, every structured activity must execute within a workspace context,
under workspace-scoped permissions, configuration, resources, and isolated state,
for an explicit operational purpose such as a goal, mission, or project.

---

## Final Matrix Summary

| Layer | What the definition implies |
|---|---|
| Identity | workspace has owner, members, roles, capabilities |
| Execution | all work runs inside workspace context |
| State | workspace-local state is isolated |
| Access | permissions are evaluated in workspace scope |
| Configuration | routing/settings are workspace-specific |
| Resources | available resources are workspace-scoped |
| Purpose | workspace exists to achieve goals/missions/projects |
| Audit | activity is attributable to workspace |
