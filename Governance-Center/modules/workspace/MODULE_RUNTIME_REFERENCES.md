# Workspace — Runtime References

Source file map for all governance-relevant workspace runtime code.

---

## Core Workspace Files

| File | Purpose | Governance Relevance |
|---|---|---|
| `server/workspace/workspace-router.ts` | Canonical workspace tRPC router (990 lines) | All endpoints, procedure types, guard calls, activity logging |
| `server/workspace/lifecycle-service.ts` | Lifecycle domain service (399 lines) | `validateDraftCompleteness`, transition functions, publication exposure |
| `server/workspace/workspace-lifecycle.ts` | Lifecycle graph and status classification (212 lines) | `LIFECYCLE_TRANSITIONS` map, status sets (FULLY_EXECUTABLE, SETUP_MUTABLE, READ_ONLY, NON_ACCESSIBLE), `validateTransition` |
| `server/workspace/workspace-guards.ts` | Reusable enforcement helpers (246 lines) | `requireWorkspaceAccess`, `requireReadableWorkspaceRoute`, `requireExecutableWorkspaceRoute`, `requireCapability`, `requireModuleEnabled`, `guardModuleRoute`, `guardWorkspaceRoute` |
| `server/workspace/workspace-contract.ts` | WorkspaceContext runtime contract (178 lines) | `WorkspaceContext` interface, `resolveWorkspaceContext`, `requireWorkspaceContext` |
| `server/workspace/capability-resolver.ts` | RBAC capability resolution (306 lines) | `resolveWorkspaceCapabilities`, `hasCapability`, `legacyRoleToCapabilities`, `capabilitiesToPermissions` |
| `server/workspace/shell-view-resolver.ts` | Shell view resolution (216 lines) | `ShellView` interface, `getWorkspaceShellView` — participant-aware visibility |

## Database and Schema

| File | Purpose | Governance Relevance |
|---|---|---|
| `drizzle/tables/users.ts` | Workspace schema definitions | `workspaces`, `workspaceMembers`, `workspaceCrew` tables with FK constraints, status enum, purpose type enum |
| `drizzle/schema.ts` | Schema re-exports | Central import point for all workspace schema types |
| `server/db/workspaces.ts` | Low-level workspace DB operations | `createWorkspace`, `updateWorkspace`, `getWorkspaceById`, `hasWorkspaceAccess`, `getUserWorkspaces` |

## Governance Engine Integration

| File | Purpose | Governance Relevance |
|---|---|---|
| `server/governance/action-key-map.ts` | Action-key mapping (359 lines) | 19 workspace action keys mapped (lines 19-39); `resolveActionKey()` for governance middleware |
| `server/_core/trpc.ts` | Procedure definitions | `governedProcedure` definition — wraps mutations with governance middleware |
| `server/governance/` | Core governance engine (40+ files) | CGT v2 engine, GATE_CHECK evaluation, freeze/drift enforcement |

## Module and Permission Infrastructure

| File | Purpose | Governance Relevance |
|---|---|---|
| `server/modules/registry.ts` | Module registry | `seedWorkspaceModules`, `getWorkspaceModules`, `isModuleEnabled`, `logActivity` |
| `server/workspaces/permissions-service.ts` | Legacy permissions service | `getUserWorkspaceRole`, `getWorkspacePermissions`, `addWorkspaceMember`, `removeWorkspaceMember`, `updateMemberRole` |
| `drizzle/tables/workspace-modules.ts` | Module schema | `workspaceModules` table, `ModuleKey` type |

## Frontend

| File | Purpose | Governance Relevance |
|---|---|---|
| `client/src/pages/WSWizardPage.tsx` | Workspace Wizard frontend | Governance intake pipeline — collects identity, purpose, anchor, scope, activities, needs, team, crew, configuration; calls `createDraft` with `wizardMeta` |
| `client/src/pages/WorkspaceDetailPage.tsx` | Workspace detail view | Lifecycle status display, transition buttons, review packet view |

## Test Files

| File | Coverage |
|---|---|
| `server/workspace/workspace-lifecycle.test.ts` | Lifecycle graph transitions, status classification |
| `tests/workspace/workspace-contract.test.ts` | WorkspaceContext resolution |
| `tests/workspace/workspace-invariants.test.ts` | WS-01 through WS-15 invariant enforcement |
| `tests/workspace/workspace-rbac-authority.test.ts` | RBAC capability resolution and authority checks |
| `tests/workspace/workspace-lifecycle-guards.test.ts` | Lifecycle transition and guard enforcement |
| `tests/workspace/workspace-boundary-scoping.test.ts` | Workspace boundary and scoping tests |
| `tests/workspace/workspace-module-enforcement.test.ts` | Module enablement enforcement |
| `tests/workspace/workspace-activity-traceability.test.ts` | Activity log traceability |
| `tests/workspace/workspace-e2e-validation.test.ts` | End-to-end workspace validation |
| `tests/workspace/workspace-hardening-final.test.ts` | Final hardening checks |

## External Reference Documents

| Document | Location | Relevance |
|---|---|---|
| Workspace Foundational Contract | `docs/workspace/WORKSPACE_FOUNDATIONAL_CONTRACT.md` | Canonical workspace definition, invariant matrices (WS-01 to WS-15) — **note**: uses older 6-status lifecycle model, partially outdated |
| Workspace Invariants | `docs/workspace/WORKSPACE_INVARIANTS.md` | WS-01 through WS-15 specifications with implementation references |
| Workspace Definition | `Workspaces/workspace-definition.md` | Workspace type and purpose documentation |
| WS Wizard Design | `Workspaces/WS Wizard — Governance-First Design.md` | Screen-by-screen wizard specification |
