# Workforce Assignment — Control Surface

## Governed Actions

All actions in the workforce assignment bridge are governed. No action may be performed without the appropriate authority and lifecycle prerequisites.

| # | Action | Performer | Lifecycle Stage | Sensitivity | Description |
|---|---|---|---|---|---|
| 1 | Create `resource_request` | PM Central (PS) | REQUEST | Standard | PM creates staffing demand with role/skill requirements |
| 2 | Update `resource_request` | PM Central (PS) | REQUEST | Standard | PM modifies request before HR validation |
| 3 | Cancel `resource_request` | PM Central (PS) | REQUEST / VALIDATE | Standard | PM withdraws demand — audit required |
| 4 | HR validation | HR | VALIDATE | Elevated | HR validates employee availability, skills, contractual eligibility |
| 5 | Candidate proposal | HR | PROPOSE | Elevated | HR proposes one or more candidates to PM |
| 6 | Approval | Approval Gate | APPROVE | High | Authority chain validated; governance rules checked; assignment authorized |
| 7 | Assignment creation | Bridge (system) | ASSIGN | High | `resource_assignment` record created linking employee to project |
| 8 | Release assignment | HR / PM Central | RELEASE | Elevated | Assignment ends — employee returned to available pool |
| 9 | Reject (at any stage) | Appropriate authority | Any | Standard | Request or candidate rejected with documented reason |
| 10 | Conflict escalation | Any participant | Any | High | Raised when authority mismatch, overallocation, or policy violation detected |

## Control Gates

| Gate | Trigger | Enforcement |
|---|---|---|
| Demand validation | `resource_request` submitted | Request must have valid project, role, skills, duration |
| Employee eligibility | HR validation stage | Employee must be active, available, skill-matched, contractually eligible |
| Authority check | Approval stage | Approver must have organizational authority over both project and employee |
| Conflict detection | Assignment creation | System checks for overallocation, schedule conflicts, policy violations |
| Release verification | Release stage | Assignment must be active; release reason documented |

## Sensitivity Levels

| Level | Meaning |
|---|---|
| Standard | Normal governance logging |
| Elevated | Sensitive-read logging; requires role-based access |
| High | Full audit trail; approval chain required; separation of duties enforced |

## Separation of Duties

- The **requester** (PM) cannot approve their own request.
- The **validator** (HR) cannot be the same person as the approver.
- The **approver** must have authority independent of both PM and HR.
- **Self-assignment** (employee assigning themselves) is forbidden.
