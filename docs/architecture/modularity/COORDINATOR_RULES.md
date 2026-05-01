# Coordinator Rules

The Central Coordinator orchestrates **multi-module workflows**. It is not a
god module, not a router, and never owns module data.

## Coordinator MAY

- Receive workflow intent (from a client, gateway, or event).
- Create workflow / coordinator jobs.
- Track workflow state (running, paused, completed, failed, compensated).
- Create handoffs (via Handoff Manager).
- Publish events (via Event Bus).
- Call Module Gateway.
- Attach governance receipts to outbound calls.
- Track retry / compensation state.
- Expose status for Digital HQ.
- Persist its own audit trail.

## Coordinator MUST NOT

- Import module **repositories**.
- Import module **DB connections**.
- Query module **private tables**.
- Write **module databases** directly.
- Import module **private services**.
- Import module **private schemas**.
- Own module **business logic**.
- Bypass **Governance**.

## Sizing rule

If the proposed flow is just `A → B`, **do not** add a coordinator step.
Use a handoff (or a gateway call). The coordinator is reserved for flows
that genuinely need workflow state, retry, compensation, or correlation
across more than two modules.

## File map

- `server/platform/coordinator/index.ts` — public entry: `submitWorkflow`,
  `getWorkflow`, `cancelWorkflow`, `listWorkflows`.
- `server/platform/coordinator/types.ts` — `Workflow`, `WorkflowStep`,
  `WorkflowStatus`, etc.
- `server/platform/coordinator/runtime.ts` — step driver (calls Gateway / Handoff /
  Event Bus only).
- `server/platform/coordinator/audit.ts` — coordinator audit trail.
- `server/orchestrator/` — legacy operator runtime; the coordinator delegates
  to it for `auditor`, `governance`, `deploy`, `builder` operator jobs but
  **does not** import its private state.

## Enforcement

- `scripts/check-coordinator-boundaries.ts` fails CI if any file under
  `server/platform/coordinator/` imports a module-private file.
- The same rule applies to `server/orchestrator/orchestrator.ts` for any
  module-private imports.
