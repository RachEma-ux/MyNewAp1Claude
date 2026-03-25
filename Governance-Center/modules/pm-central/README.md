# PM Central — Module Governance

## Overview

PM Central is the project management module with task tracking, planning, and team coordination.

## Governance Status: Partial

- PMT module has a governance schema (`server/modules/pmt/governance-schema.ts`)
- PM governance badge on UI (`client/src/components/workspace/PMGovernanceBadge.tsx`)
- Uses `protectedProcedure` for most operations

## Runtime References

| File | Location | Reason |
|---|---|---|
| PMT module | `server/modules/pmt/` | Runtime PM engine |
| PMT governance schema | `server/modules/pmt/governance-schema.ts` | Runtime schema |
| PM execution plans | `PM/` | Documentation — left in place |
| PM governance badge | `client/src/components/workspace/PMGovernanceBadge.tsx` | Vite build tree |

---

## Ownership Clarification (OM–HR–PS Alignment)

### PM Central Owns

- Project demand
- Project roles (WBS roles, not employee roles)
- Work breakdown structure (WBS)
- Execution tracking
- Reporting

### PM Central Does NOT Own

| Capability | Actual Owner | Why PM Central Cannot Own It |
|---|---|---|
| Employee master data | HR | Employees are HR-governed entities |
| Workforce structure | OM (future) / HR (transitional) | Org hierarchy is not a project artifact |
| Organizational authority | OM (future) / HR (transitional) | Reporting lines are outside project scope |

### Governed Bridge Requirement

PM Central **must** request resources through the governed bridge (`resource_request`).

PM Central **must not** directly assign or own employees.

Any staffing need originating from PM Central must flow through:

```
PM Central (demand) → resource_request → HR validation → approval gate → resource_assignment
```

See: [`Governance-Center/platform-domains/workforce-assignment/`](../platform-domains/workforce-assignment/README.md)
