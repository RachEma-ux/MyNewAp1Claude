# Code Studio — Architecture

## Module Identity
- **Module name**: Code Studio
- **Dedicated database**: CODEDB (`codedb`)
- **Primary route**: `/code-studio`
- **Internal runtime engine**: OpenCode (coding workflow orchestration only)

## Architectural Role

Code Studio is a **standalone platform module** within the MyNewAp1Claude monorepo.
It owns the complete coding job lifecycle: workspace preparation, coding agent execution,
approval gating, diff review, testing, governance, and artifact persistence.

**OpenCode** operates as the internal coding-agent runtime engine inside Code Studio.
It is NOT the whole-platform orchestrator. The outer platform retains ownership of
broad business/platform orchestration.

## Layer Diagram

```
┌───────────────────────────────────────────────────┐
│  MyNewAp1Claude Platform                          │
│  (routing, auth, navigation, business orchestr.)  │
├───────────────┬───────────────────────────────────┤
│               │  Code Studio Module               │
│  Platform     │  ┌─────────────────────────────┐  │
│  Handoff      │  │  Frontend Shell             │  │
│  Contract     │  │  (Dashboard, Jobs, Sessions, │  │
│               │  │   Approvals, Repos, Agents,  │  │
│               │  │   Policies, Audit/Control)   │  │
│               │  ├─────────────────────────────┤  │
│               │  │  Backend API (tRPC)          │  │
│               │  │  /api/trpc/codeStudio.*      │  │
│               │  ├─────────────────────────────┤  │
│               │  │  Worker / Orchestrator       │  │
│               │  │  Job state machine           │  │
│               │  ├─────────────────────────────┤  │
│               │  │  OpenCode Runtime Adapter    │  │
│               │  │  (HTTP client to OC serve)   │  │
│               │  ├─────────────────────────────┤  │
│               │  │  CODEDB (PostgreSQL)         │  │
│               │  │  20+ tables, append audit    │  │
│               │  └─────────────────────────────┘  │
├───────────────┴───────────────────────────────────┤
│  OpenCode Runtime (internal, 127.0.0.1:4096)      │
│  Sessions, agents, diffs, permissions              │
└───────────────────────────────────────────────────┘
```

## Directory Layout

```
server/code-studio/
  connection.ts          — CODEDB connection (lazy singleton)
  seed.ts                — Table creation + seed data
  api/
    router.ts            — tRPC router composition
    jobs.router.ts       — Job CRUD + lifecycle endpoints
    sessions.router.ts   — Session tracking endpoints
    approvals.router.ts  — Approval queue endpoints
    repos.router.ts      — Repository registry endpoints
    agents.router.ts     — Agent config endpoints
    policies.router.ts   — Policy profile endpoints
    audit.router.ts      — Audit log endpoints
    handoffs.router.ts   — Platform handoff endpoints
  worker/
    job-orchestrator.ts  — Job state machine + transitions
    workspace-manager.ts — Git workspace lifecycle
  opencode/
    client.ts            — OpenCode HTTP/SDK client
    types.ts             — Normalized types
    sessions.ts          — Session management
    messages.ts          — Message operations
    diffs.ts             — Diff retrieval
    permissions.ts       — Permission request/response
    agents.ts            — Agent listing/selection
    events.ts            — Event stream consumption
    config.ts            — Runtime configuration
  shared/
    types.ts             — Shared types for module
    schemas.ts           — Zod validation schemas
    constants.ts         — Constants and enums
  repository.ts          — CODEDB query functions

drizzle/tables/codedb.ts — All CODEDB table definitions

client/src/pages/code-studio/
  CodeStudioShellPage.tsx
  CodeStudioDashboardPage.tsx
  CodeStudioJobsPage.tsx
  CodeStudioJobDetailPage.tsx
  CodeStudioSessionDetailPage.tsx
  CodeStudioApprovalsPage.tsx
  CodeStudioControlPanelPage.tsx

client/src/components/code-studio/
  CodeStudioShell.tsx
  CodeStudioSidebar.tsx

docs/code-studio/          — Architecture, boundary, ADR docs
infra/code-studio/         — Docker compose, env examples
```

## Data Flow

1. Platform creates inbound handoff → Code Studio
2. Code Studio creates job in CODEDB (status: draft)
3. Worker prepares workspace (git clone, branch)
4. Worker starts OpenCode session via adapter
5. Planner agent runs → plan produced
6. If risky: approval request created, job waits
7. Builder agent runs → code changes produced
8. Reviewer agent audits changes
9. Tester agent validates
10. Governance agent checks policy compliance
11. Artifacts persisted (diffs, evidence bundle)
12. Callback to platform with result summary
