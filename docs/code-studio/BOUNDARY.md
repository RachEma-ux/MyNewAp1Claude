# Code Studio — Module Boundary

## Ownership Boundaries

| Concern | Owner | NOT Owner |
|---------|-------|-----------|
| Coding job lifecycle | Code Studio | Platform |
| Coding workflow execution | Code Studio | Platform |
| Coding agent orchestration | OpenCode (inside Code Studio) | Platform orchestrator |
| CODEDB runtime state | Code Studio | Main app DB |
| Approval decisions (coding) | Code Studio | Platform governance |
| Audit trail (coding) | Code Studio (CODEDB) | Platform audit |
| Repository workspace | Code Studio | Platform |
| Platform routing | Platform | Code Studio |
| User authentication | Platform (shared) | Code Studio |
| Business orchestration | Platform | Code Studio / OpenCode |
| AI Types catalog | Platform | Code Studio |

## Database Boundary

- **CODEDB** (`codedb` PostgreSQL database): ALL Code Studio runtime state
- **Main app DB** (`mynewap1claude`): Only stores references/summary for cross-platform visibility
- Code Studio MUST NOT write runtime state to the main app DB
- Platform MUST NOT query CODEDB directly; use Code Studio API

## Runtime Boundary

- OpenCode runs as an internal process bound to `127.0.0.1:4096`
- OpenCode is NOT exposed publicly
- Only the Code Studio OpenCode adapter communicates with OpenCode
- Platform components MUST NOT call OpenCode directly
- OpenCode manages coding agents only, not platform workflows

## API Boundary

- Code Studio exposes its API via `trpc.codeStudio.*` namespace
- Platform-to-module communication uses the handoff contract
- Module-to-platform callbacks use the result contract
- No direct database queries across module boundaries

## Frontend Boundary

- Code Studio pages live under `/code-studio/*` routes
- Code Studio reuses shared UI components (shadcn, Radix) but not business components
- Code Studio sidebar/shell are self-contained (cloned, not imported from other modules)
