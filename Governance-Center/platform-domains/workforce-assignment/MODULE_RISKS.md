# Workforce Assignment — Risk Register

## Overview

Risks specific to the cross-domain workforce assignment bridge. These risks arise from the multi-module nature of staffing decisions and the absence of runtime implementation.

## Risk Register

| # | Risk | Severity | Likelihood | Category | Description |
|---|---|---|---|---|---|
| R1 | Hidden assignment bypass | Critical | Medium | Control | PM or HR assigns employees outside the bridge — no audit, no approval |
| R2 | Authority mismatch | High | Medium | Authority | Approver lacks organizational authority over the employee or project |
| R3 | PM owning people indirectly | Critical | High | Boundary | PM Central treats project roles as employee ownership — violates HR/OM boundary |
| R4 | HR overreach | High | Low | Boundary | HR makes staffing decisions without PM demand signal — bypasses project authority |
| R5 | OM not enforced | High | High | Dependency | Organization Management module does not exist yet — structural authority is unverifiable |
| R6 | Audit gaps | High | Medium | Audit | Assignment actions occur without complete audit records due to implementation gaps |
| R7 | Conflict mismanagement | Medium | Medium | Process | Staffing conflicts (overallocation, competing demands) resolved informally without governance |

## Risk Details

### R1 — Hidden Assignment Bypass

- **Trigger:** PM directly links an employee to a project in PM tooling without creating a `resource_request`.
- **Impact:** No HR validation, no approval, no audit trail. Employee may be overallocated or ineligible.
- **Mitigation:** Runtime enforcement must prevent direct employee-project links in PM Central. PM Central must only reference `resource_assignment` records.

### R2 — Authority Mismatch

- **Trigger:** Approver signs off on an assignment but does not have authority over the employee's organizational unit.
- **Impact:** Assignment may violate organizational policies. Employee's manager not consulted.
- **Mitigation:** Approval gate must verify organizational authority chain (requires OM data).

### R3 — PM Owning People Indirectly

- **Trigger:** PM Central stores employee IDs, manages employee availability, or tracks employee performance within project scope.
- **Impact:** Blurs boundary between project management and human resources. Creates shadow HR.
- **Mitigation:** PM Central governance explicitly forbids employee master data ownership. Enforced in PM Central README.

### R4 — HR Overreach

- **Trigger:** HR assigns employees to projects without a `resource_request` from PM.
- **Impact:** Projects receive resources they didn't request. PM loses control of project staffing.
- **Mitigation:** Assignment lifecycle requires a valid `resource_request` as prerequisite.

### R5 — OM Not Enforced

- **Trigger:** Organization Management module is not yet implemented. Structural authority (org hierarchy, position management) is unavailable.
- **Impact:** Approval gate cannot verify organizational authority. Assignments may proceed without proper authority validation.
- **Mitigation:** Until OM exists, HR acts as custodian for transitional OM capabilities. This is a known gap, not a permanent solution.

### R6 — Audit Gaps

- **Trigger:** Assignment actions are performed without runtime audit logging (because no runtime exists yet).
- **Impact:** No evidence trail for governance reviews.
- **Mitigation:** Governance pack defines audit requirements. Runtime implementation must implement synchronous audit logging from day one.

### R7 — Conflict Mismanagement

- **Trigger:** Multiple PMs request the same employee. Conflict resolved via email/chat instead of governed escalation.
- **Impact:** No audit trail. Decision may not reflect organizational priorities.
- **Mitigation:** Bridge defines explicit conflict escalation action with audit requirements.
