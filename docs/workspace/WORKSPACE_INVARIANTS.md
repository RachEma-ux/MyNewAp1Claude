# Workspace Invariants — Phase 1–3 + Contract Enforcement

| Field | Value |
|-------|-------|
| **Status** | Active |
| **Version** | v2.0.0 |
| **Scope** | Workspace execution, RBAC, boundary scoping, lifecycle, isolation |
| **Date** | 2026-03-22 |

---

## Canonical Definition

> A **workspace** is a controlled, contextual execution environment where users
> and agents deploy structured activities using a defined set of resources, with
> isolated state, permissions, and configuration.

---

## Invariants

### WS-01: Workspace Execution Contract

**Every workspace-scoped execution path must be able to resolve a WorkspaceContext.**

The `WorkspaceContext` is the canonical runtime contract for workspace-scoped operations:

```typescript
interface WorkspaceContext {
  workspaceId: number;
  workspaceName: string;
  userId: number;
  role: string | null;
  permissions: WorkspacePermissions;
  effectiveCapabilities: Set<string>;
  enabledModules: string[];
  routingProfile: unknown;
  workspaceType: string | null;
  status: WorkspaceStatus;
  purposeType: WorkspacePurposeType | null;
  workspace: Workspace;
}
```

**Resolver helpers:**
- `resolveWorkspaceContext(userId, workspaceId)` — returns null if access denied
- `requireWorkspaceContext(userId, workspaceId)` — throws if access denied
- `hasContextPermission(ctx, permission)` — checks boolean permission
- `isModuleEnabled(ctx, moduleKey)` — checks module availability

**Source:** `server/workspace/workspace-contract.ts`

---

### WS-02: Capability-Based Access Resolution

**All workspace access decisions must resolve through the workspace capability model.**

Permission resolution follows this path:

1. Check RBAC tables (`workspace_roles`, `workspace_role_capabilities`, `workspace_principal_capabilities`)
2. If RBAC data exists, compute effective capabilities from role + per-user overrides
3. If RBAC data is not seeded, fall back to legacy role→boolean mapping
4. Convert capabilities to `WorkspacePermissions` via compatibility adapter

**Resolution priority:**
```
workspace_principal_capabilities (grant/deny overrides)
  ↑
workspace_role_capabilities (role→capability mappings)
  ↑
workspace_members.roleId → workspace_roles
  ↑
Legacy fallback: workspace_members.role → hardcoded mapping
```

**Sources:**
- `server/workspace/capability-resolver.ts` — core resolver + adapter
- `server/workspaces/permissions-service.ts` — compatibility entry point
- `config/capabilities.yaml` — capability catalog (30 capabilities)
- `config/workspace_role_presets.yaml` — 9 system roles + type presets

---

### WS-03: Workspace Boundary Scoping

**Workspace-facing data queries must be explicitly scoped to the current workspace.**

Workspace pages must not use global/unscoped queries to populate workspace-specific views. When a page is rendered inside a workspace context (e.g., `/w/:workspaceId/*`), its data queries must include `workspaceId` as a filter.

**Fixed leaks (Phase 3):**

| Page | Before | After |
|------|--------|-------|
| `WorkspaceDetail.tsx` agents tab | `trpc.agents.list.useQuery()` (global) | `trpc.modules.agentOrch.agents.list.useQuery({ workspaceId })` (scoped) |

---

### WS-04: Workspace Lifecycle Status

**Every workspace has a lifecycle status that gates execution.**

Status progression:
```
created → configured → active → paused → archived → deleted
```

Execution rules:
- `active`, `configured`, `created` — full read+write
- `paused` — read-only (writes blocked)
- `archived` — read-only (writes blocked, escape-hatch actions allowed)
- `deleted` — all access blocked

Schema: `workspaces.status` (varchar, default `"active"`, NOT NULL)

**Source:** `server/workspace/workspace-lifecycle.ts`

---

### WS-05: Workspace Purpose Type

**Every workspace declares its organizing purpose.**

Purpose types: `goal`, `mission`, `project`, `team`, `strategy`, `other`

Schema:
- `workspaces.purposeType` (varchar, default `"other"`)
- `workspaces.purposeRef` (text, optional reference to purpose entity)

**Source:** `drizzle/tables/users.ts`

---

### WS-06: Non-Executable Workspace Blocks Writes

**Paused, archived, and deleted workspaces must reject mutating operations.**

Guards:
- `requireExecutableWorkspace(ctx)` — throws for non-executable status
- `requireReadableWorkspace(ctx)` — throws only for deleted
- `isActionAllowed(status, action, isRead)` — returns boolean

Archived escape-hatch actions: `workspace.unarchive`, `workspace.get`, `workspace.list`, `workspace.export`

**Source:** `server/workspace/workspace-lifecycle.ts`

---

### WS-07: Module Access Guard

**Actions requiring a specific module must check enablement before execution.**

- `requireModule(workspaceId, moduleKey)` — throws `workspace_module_disabled` blocker
- `isModuleEnabled(workspaceId, moduleKey)` — returns boolean
- Module presets seeded on workspace creation via `seedWorkspaceModules()`

**Source:** `server/modules/registry.ts`

---

### WS-08: Permission Resolution Consistency

**The `WorkspacePermissions` interface is the stable contract for all permission consumers.**

```typescript
interface WorkspacePermissions {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canManageMembers: boolean;
  canManageSettings: boolean;
}
```

All consumers of `getWorkspacePermissions()`, `hasPermission()`, and `getUserWorkspaceRole()` continue to work without modification across capability model upgrades.

**Source:** `server/workspaces/permissions-service.ts`

---

### WS-09: Workspace Identity Boundary

**Every workspace has a unique integer ID that serves as the primary isolation boundary.**

- `workspaceId` is always a positive integer
- `workspaceName` is always a non-empty string
- `workspace.id` always matches `workspaceId` in the context

---

### WS-10: Cross-Workspace Isolation

**No workspace-scoped operation may access data from another workspace without explicit cross-workspace authorization.**

- `hasWorkspaceAccess(userId, workspaceId)` must be checked before any data access
- `resolveWorkspaceContext()` returns null if access is denied
- Two contexts with different workspaceIds are always distinct execution environments

---

### WS-11: Workspace Owner Authority

**The workspace owner has full control over all workspace operations.**

- Owner is determined by `workspaces.ownerId`
- Owner always resolves to the full capability set (all 30 capabilities)
- Owner cannot be removed from workspace membership

---

### WS-12: Workspace Data Query Scoping

**All workspace-facing database queries must include workspaceId as a filter.**

- `getWorkspaceById(workspaceId)` scopes by `workspaces.id`
- `getUserWorkspaces(userId)` scopes by `workspaceMembers.userId`
- Module queries (documents, agents, etc.) must include `workspaceId` parameter

---

### WS-13: Activity Traceability

**Workspace actions must be auditable through the activity log.**

- `logActivity({ workspaceId, moduleKey, actorId, action, ... })` writes to `workspace_activity_log`
- Activity log captures workspace ID, module, actor, action, target, and metadata
- Failed log writes are warned but do not block the action

**Source:** `server/modules/registry.ts`

---

### WS-14: Workspace Configuration Completeness

**Every workspace must have sensible defaults for all configuration fields.**

Defaults:
- `embeddingModel`: `"bge-small-en-v1.5"`
- `chunkingStrategy`: `"semantic"`
- `chunkSize`: `512`
- `chunkOverlap`: `50`
- `vectorDb`: `"qdrant"`
- `status`: `"active"`
- `purposeType`: `"other"`

---

### WS-15: Module Presets Match Workspace Types

**Module presets must be defined for every supported workspace type.**

Covered types: `personal`, `team`, `project`, `research`, `enterprise`, `sandbox`, `readonly`

Each preset defines which of the 5 modules (`pmt`, `knowledge`, `agents`, `collaboration`, `reporting`) are enabled on workspace creation.

**Source:** `server/modules/registry.ts`

---

## Test Coverage

| Invariant | Test File | Tests |
|-----------|-----------|-------|
| WS-01 | `tests/workspace/workspace-contract.test.ts` | Contract shape, resolver exports, helper functions |
| WS-02 | `tests/workspace/capability-resolver.test.ts` | Compatibility adapter, role→capability mapping, API stability |
| WS-03 | `tests/workspace/boundary-scoping.test.ts` | Static analysis of workspace pages for scoped queries |
| WS-01–WS-15 | `tests/workspace/workspace-invariants.test.ts` | Full invariant coverage, lifecycle enforcement, anti-patterns |

---

## Key Files

| File | Role |
|------|------|
| `server/workspace/workspace-contract.ts` | Canonical WorkspaceContext + resolvers |
| `server/workspace/capability-resolver.ts` | RBAC capability resolver + compatibility adapter |
| `server/workspace/workspace-lifecycle.ts` | Lifecycle status enforcement helpers |
| `server/workspaces/permissions-service.ts` | Permission service (routes through capability model) |
| `server/modules/registry.ts` | Module enablement, presets, guards, activity logging |
| `config/capabilities.yaml` | 30 workspace capabilities |
| `config/workspace_role_presets.yaml` | 9 system roles + workspace type presets |
| `drizzle/tables/users.ts` | Workspace schema (status, purposeType, purposeRef) |
| `drizzle/tables/workspace-rbac.ts` | RBAC schema (capabilities, roles, mappings, overrides) |
| `drizzle/tables/workspace-modules.ts` | Module binding + activity log schema |
| `server/db/workspace-rbac.ts` | RBAC DB query helpers |
| `server/workspace/seed/` | Seeding infrastructure |

---

## Anti-Patterns to Block

| Anti-Pattern | Rule |
|------|------|
| Execution without workspaceId | Every workspace route requires `id` in input |
| Global queries in workspace context | Workspace pages must use scoped queries with `workspaceId` |
| Role-only permission logic | All permission checks route through capability resolver |
| Disabled module callable | `requireModule()` must guard module-specific actions |
| Cross-workspace data access | `hasWorkspaceAccess()` checked before any data access |
| Workspace as UI-only grouping | Workspace is an execution domain with enforced contracts |

---

## Deferred to Later Phases

| Item | Phase |
|------|-------|
| Resource quotas and budget enforcement | Phase 4+ |
| Full workspace runtime routing integration | Phase 4+ |
| Multi-tenant infrastructure isolation | Phase 5+ |
| Workspace type UX redesign | Phase 5+ |
| Comprehensive boundary audit of all 50+ workspace pages | Phase 4 |
| tRPC middleware for automatic workspace context injection | Phase 4 |
