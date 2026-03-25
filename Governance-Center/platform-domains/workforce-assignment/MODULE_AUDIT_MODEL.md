# Workforce Assignment — Audit Model

## Audit Requirements

Every workforce assignment action must produce an auditable record. The bridge crosses module boundaries, making traceability critical.

## Audit Fields (per event)

| Field | Description | Required |
|---|---|---|
| `event_type` | Action performed (create_request, validate, propose, approve, assign, release, reject, escalate) | Yes |
| `timestamp` | ISO 8601 event time | Yes |
| `actor_id` | User who performed the action | Yes |
| `actor_role` | Role of the actor (pm, hr, approver, system) | Yes |
| `request_id` | Reference to `resource_request` | Yes |
| `assignment_id` | Reference to `resource_assignment` (when applicable) | Conditional |
| `employee_id` | Employee involved (when applicable) | Conditional |
| `project_id` | Project involved | Yes |
| `authority_chain` | Authority path used for approval | Conditional |
| `reason` | Documented reason (for reject, cancel, escalate, release) | Conditional |
| `previous_state` | State before transition | Yes |
| `new_state` | State after transition | Yes |

## Audit by Lifecycle Stage

### 1. Request

| What | Audited |
|---|---|
| Who requested | Actor ID + role (PM) |
| What was requested | Role, skills, duration, project |
| Request state transitions | draft → submitted, submitted → cancelled |

### 2. Validation

| What | Audited |
|---|---|
| Who validated | Actor ID + role (HR) |
| Validation outcome | pass / fail + reasons |
| Employee eligibility checks | Availability, skills, contracts |

### 3. Proposal

| What | Audited |
|---|---|
| Who proposed | Actor ID + role (HR) |
| Candidates proposed | Employee IDs + match rationale |
| PM response | Accept / reject per candidate |

### 4. Approval

| What | Audited |
|---|---|
| Who approved | Actor ID + role (Approver) |
| Authority chain used | Organizational authority path from approver to employee and project |
| Governance rules checked | Which rules were evaluated and their results |

### 5. Assignment

| What | Audited |
|---|---|
| Assignment created | Assignment ID, employee ID, project ID, dates |
| Link to request | Request ID |
| Link to approval | Approval record ID |

### 6. Release and Feedback

| What | Audited |
|---|---|
| Who released | Actor ID + role |
| Release reason | Project complete, reassignment, HR action, termination |
| Feedback captured | Performance feedback, utilization notes (if applicable) |

### 7. Conflict Overrides

| What | Audited |
|---|---|
| Who escalated | Actor ID + role |
| Conflict type | Overallocation, authority mismatch, policy violation |
| Resolution | Override approved (by whom), rejected, reassigned |
| Override justification | Documented reason for any governance override |

## Retention

- All audit records must be retained for the platform's standard governance retention period.
- Conflict override records must be retained indefinitely or until explicit governance review.

## Audit Integrity

- Audit records are **append-only** — no modification or deletion permitted.
- Audit records must be written **synchronously** with the governed action (not deferred).
