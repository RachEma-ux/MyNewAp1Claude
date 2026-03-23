# Identity & Access — Platform Domain

## Overview

Covers authentication, authorization, RBAC, and workspace membership across the platform.

## Components

| Component | Location | Purpose |
|---|---|---|
| RBAC model | `server/governance/rbac-model.ts` | Role definitions and access rules |
| Auth middleware | `server/middleware/` | Express auth middleware |
| tRPC procedures | `server/trpc.ts` | publicProcedure, protectedProcedure, adminProcedure |
| Workspace access | Various routers | `hasWorkspaceAccess` checks |
| HR permissions | `server/hr/permissions.ts` | HR-specific permission model |
| OAuth flow | Client + server | OAuth portal integration |
| Users table | `drizzle/schema.ts` | User and workspace_members tables |

## Access Control Levels

| Level | Mechanism | Scope |
|---|---|---|
| Public | `publicProcedure` | No auth required |
| Protected | `protectedProcedure` | Login required |
| Admin | `adminProcedure` | Admin role required |
| Governed | `governedProcedure` | Full governance pipeline |
| HR-governed | `governedProcedure` + `requireHrPermission` | HR action-based |

## All files are runtime-critical and remain in their original locations.
