# Automation — Module Audit Model

## Audit Scope

The Automation module has standard audit requirements:

| Audit Area | Status | Notes |
|---|---|---|
| Workflow execution logs | Active | Tracked in `workflow_executions` table |
| Workflow creation/modification | Active | Standard tRPC audit |
| Secret access | Active | Encrypted storage, access via `protectedProcedure` |
| Navigation events | Deferred | Will use shared nav observability when enabled |

## Sensitive Operations

| Operation | Audit Level | Notes |
|---|---|---|
| Secret creation/update | High | API keys and credentials |
| Workflow deletion | Medium | Destructive action |
| Workflow execution | Standard | Execution tracking built-in |

## No PII Audit Requirements

Automation does not handle PII. No field-level masking or sensitive-read audit logging is needed. This is a key simplification compared to the HR reference implementation.
