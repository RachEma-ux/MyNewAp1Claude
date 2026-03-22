# Workspace Invariants — Phase 1–3

| Field | Value |
|-------|-------|
| **Status** | Active |
| **Version** | v1.0.0 |
| **Scope** | Workspace execution, RBAC, boundary scoping |
| **Date** | 2026-03-22 |

---

## Invariants

### WS-01: Workspace Execution Contract

**Every workspace-scoped execution path must be able to resolve a WorkspaceContext.**

The `WorkspaceContext` is the canonical runtime contract for workspace-scoped operations:

```typescript
interface WorkspaceContext {
  workspaceId: number;
  userId: number;
  role: string | null;
  permissions: WorkspacePermissions;
  enabledModules: string[];
  routingProfile: unknown;
  workspaceType: string | null;
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

**Compatibility guarantee:** The existing `WorkspacePermissions` interface is unchanged. All consumers of `getWorkspacePermissions()`, `hasPermission()`, and `getUserWorkspaceRole()` continue to work without modification.

---

### WS-03: Workspace Boundary Scoping

**Workspace-facing data queries must be explicitly scoped to the current workspace when the data is intended to reflect workspace state.**

Workspace pages must not use global/unscoped queries to populate workspace-specific views. When a page is rendered inside a workspace context (e.g., `/w/:workspaceId/*`), its data queries must include `workspaceId` as a filter.

**Fixed leaks (Phase 3):**

| Page | Before | After |
|------|--------|-------|
| `WorkspaceDetail.tsx` agents tab | `trpc.agents.list.useQuery()` (global) | `trpc.modules.agentOrch.agents.list.useQuery({ workspaceId })` (scoped) |

**Already scoped (no change needed):**

| Page | Query |
|------|-------|
| `WorkspaceDetail.tsx` documents tab | `trpc.documents.list.useQuery({ workspaceId })` |
| `WorkspaceShell.tsx` modules | `trpc.modules.manage.list.useQuery({ workspaceId })` |
| `AgentsRosterPage.tsx` | `trpc.modules.agentOrch.agents.list.useQuery({ workspaceId })` |
| All PMT pages | Receive `workspaceId` prop |
| All Knowledge pages | Receive `workspaceId` prop |

---

## Test Coverage

| Invariant | Test File | Tests |
|-----------|-----------|-------|
| WS-01 | `tests/workspace/workspace-contract.test.ts` | Contract shape, resolver exports, helper functions |
| WS-02 | `tests/workspace/capability-resolver.test.ts` | Compatibility adapter, role→capability mapping, API stability |
| WS-03 | `tests/workspace/boundary-scoping.test.ts` | Static analysis of workspace pages for scoped queries |

---

## Key Files

| File | Role |
|------|------|
| `server/workspace/workspace-contract.ts` | Canonical WorkspaceContext + resolvers |
| `server/workspace/capability-resolver.ts` | RBAC capability resolver + compatibility adapter |
| `server/workspaces/permissions-service.ts` | Permission service (routes through capability model) |
| `config/capabilities.yaml` | 30 workspace capabilities |
| `config/workspace_role_presets.yaml` | 9 system roles + workspace type presets |
| `drizzle/tables/workspace-rbac.ts` | RBAC schema (capabilities, roles, mappings, overrides) |
| `server/db/workspace-rbac.ts` | RBAC DB query helpers |
| `server/workspace/seed/` | Seeding infrastructure |

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
