# ADR-001: Code Studio Module Boundary

## Status: Accepted

## Context
Code Studio must operate as a standalone module within the MyNewAp1Claude platform.
The platform already has dedicated-database modules (PRMDB, PSMDB, WFDB) that demonstrate
the pattern of module-level database ownership within a shared monorepo.

## Decision
- Code Studio is implemented as a standalone module with its own database (CODEDB),
  backend API, worker/orchestrator, and frontend shell.
- It lives within the existing monorepo structure (`server/code-studio/`, `client/src/pages/code-studio/`)
  following established conventions.
- Runtime state, job lifecycle, approvals, and audit belong exclusively to Code Studio.
- The platform stores only references/summaries for cross-module visibility.
- OpenCode is internal to Code Studio; it is not exposed as a platform-level service.

## Consequences
- Code Studio can be independently tested, audited, and (in future) extracted.
- No other module should query CODEDB directly.
- Platform integration goes through the tRPC API and handoff contract.
