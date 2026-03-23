# Workspace — Module Governance

## Overview

Workspaces are the primary organizational unit. Governance covers workspace creation, membership, access control, and template provisioning.

## Governance Status: Partial

- Workspace access checks via `hasWorkspaceAccess` on most endpoints
- Template provisioning has governance documentation (Template/Shell/)
- No `governedProcedure` wrapper on workspace mutations (uses `protectedProcedure`)

## Runtime References

| File | Location | Reason |
|---|---|---|
| Workspace routers | `server/routers/workspaces*.ts` | Runtime tRPC routers |
| Workspace types | `shared/types.ts` | Shared type definitions |
| Workspace contract | `docs/workspace/WORKSPACE_FOUNDATIONAL_CONTRACT.md` | Doc — left in place |
| Workspace invariants | `docs/workspace/WORKSPACE_INVARIANTS.md` | Doc — left in place |
| Template Shell docs | `Template/Shell/*.md` | Template governance docs — left in place |
| Workspace definition | `Workspaces/workspace-definition.md` | Doc — left in place |
