# ADR-004: OpenCode Runtime Role

## Status: Accepted

## Context
OpenCode is a powerful coding agent runtime. The question is: what role does it
play in the platform architecture?

## Decision
- OpenCode is the **internal coding-workflow orchestration/runtime engine** inside
  Code Studio only.
- OpenCode is NOT the whole-platform orchestrator.
- OpenCode manages coding agent sessions, subagents, diffs, and file actions.
- Code Studio's worker/orchestrator owns the job state machine; OpenCode
  operates within that context.
- OpenCode runs headless (`opencode serve`) bound to 127.0.0.1.
- The Code Studio OpenCode adapter normalizes all interactions.

## Consequences
- Platform orchestration remains independent of OpenCode.
- If OpenCode's API changes, only the adapter layer needs updating.
- Browsers never communicate directly with OpenCode.
- OpenCode sessions are tracked in CODEDB with Code Studio's own IDs
  (OpenCode native IDs are stored as references, not primary keys).
