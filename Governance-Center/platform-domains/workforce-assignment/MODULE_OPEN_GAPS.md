# Workforce Assignment — Open Gaps

## Overview

This governance pack is **fully defined but has no runtime implementation**. The following gaps are known and documented. They must be resolved before the bridge becomes operational.

## Gap Register

| # | Gap | Severity | Dependency | Description |
|---|---|---|---|---|
| G1 | No runtime implementation | Critical | Builder phase | No code exists for `resource_request`, `resource_assignment`, or lifecycle enforcement |
| G2 | No assignment engine | Critical | G1 | No system component processes requests through the governed lifecycle |
| G3 | No approval workflow | Critical | G1, G2 | No approval gate exists in runtime — assignments cannot be authorized programmatically |
| G4 | No utilization loop | High | G1, G2 | No feedback mechanism tracks actual resource utilization against assignments |
| G5 | HR/PM misalignment risk | High | Governance | HR and PM Central may have conflicting interpretations of ownership boundaries |
| G6 | OM dependency | Critical | Platform roadmap | Organization Management module does not exist — structural authority is unverifiable |

## Gap Details

### G1 — No Runtime Implementation

- **Status:** Pre-runtime. Governance-only.
- **What exists:** This governance pack (8 files) defining authority, lifecycle, controls, audit, and risks.
- **What does not exist:** Database schema, API endpoints, tRPC routers, UI pages.
- **Remediation:** Build phase must implement runtime according to this governance specification.

### G2 — No Assignment Engine

- **Status:** Not started.
- **What is needed:** A server-side component that processes `resource_request` → validation → proposal → approval → `resource_assignment`.
- **Constraint:** Must enforce lifecycle stages as defined in MODULE_GOVERNANCE_PROFILE.md. Stage skipping is a governance violation.

### G3 — No Approval Workflow

- **Status:** Not started.
- **What is needed:** An approval gate that checks authority chain, separation of duties, and governance rules before creating an assignment.
- **Constraint:** Must integrate with platform governance engine (`governedProcedure`).

### G4 — No Utilization Loop

- **Status:** Not started.
- **What is needed:** A mechanism to compare active assignments against actual project activity and flag drift.
- **Constraint:** Requires integration with PM Central (activity data) and HR (availability data).

### G5 — HR/PM Misalignment Risk

- **Status:** Mitigated by governance patches (Part 1 and Part 2 of this task).
- **What was done:** HR MODULE_GOVERNANCE_PROFILE.md now limits ownership. PM Central README.md now forbids employee ownership and requires governed bridge.
- **Remaining risk:** Enforcement depends on runtime implementation respecting these boundaries.

### G6 — OM Dependency

- **Status:** Unresolved. OM module is on the platform roadmap but does not exist.
- **Impact:** The bridge cannot fully validate organizational authority without OM data.
- **Interim:** HR acts as custodian for transitional OM capabilities (org structure, job architecture, position management).
- **Remediation:** OM module must be implemented. When it is, HR relinquishes transitional capabilities and the bridge integrates OM as the structural authority source.
