# Workforce Assignment — Governance Profile

## Purpose

The Workforce Assignment bridge exists to **govern cross-module staffing decisions**. No single module (PM Central, HR, or OM) may unilaterally assign employees to projects. All assignments must pass through a governed lifecycle with explicit authority checks.

## Governance Maturity: Defined (Pre-Runtime)

This governance pack is **fully defined** but has **no runtime implementation**. It serves as the binding specification for future implementation.

## Cross-Module Ownership

| Domain | Owner | Responsibility |
|---|---|---|
| Demand (resource requests) | PS / PM Central | Defines what is needed — role, skills, duration, project |
| Workforce reality | HR | Validates availability, skills, contracts, classification |
| Organizational structure | OM (future) | Provides position hierarchy, reporting lines, job architecture |
| Assignment governance | Bridge (this pack) | Enforces lifecycle, authority, and audit across all three |

**No module owns the assignment itself.** The assignment is a cross-domain governed record.

## Governance Intent

1. **Separation of demand from supply** — PM Central creates demand; HR validates supply; neither can bypass the other.
2. **Authority chain enforcement** — Every assignment requires validated authority from the appropriate organizational level.
3. **Audit completeness** — Every assignment decision is traceable from request to release.
4. **No hidden assignments** — All staffing must flow through the bridge; direct PM-to-employee links are forbidden.

## Authority Model

| Role | Authority | Constraint |
|---|---|---|
| PM Central (PS) | Create `resource_request` | Cannot assign employees directly |
| HR | Validate employee eligibility | Cannot override project demand |
| OM (future) | Provide structural authority | Cannot bypass HR validation |
| Approval Gate | Authorize `resource_assignment` | Requires all upstream validations |

## Lifecycle Overview

```
1. REQUEST    → PS creates resource_request (demand signal)
2. VALIDATE   → HR validates employee availability, skills, eligibility
3. PROPOSE    → HR proposes candidate(s) to requesting PM
4. APPROVE    → Approval gate checks authority chain + governance rules
5. ASSIGN     → resource_assignment created (governed cross-domain record)
6. RELEASE    → Assignment ends — triggered by project completion, reassignment, or HR action
```

Each stage is a governed transition. Skipping stages is a governance violation.

## Key Governance Objects

### `resource_request`

- **Owner:** PS (PM Central)
- **Contains:** project ID, role requirements, skill requirements, duration, priority
- **Lifecycle:** draft → submitted → validated → fulfilled / cancelled
- **Constraint:** Does not reference specific employees — only role/skill demand

### `resource_assignment`

- **Owner:** Bridge (cross-domain)
- **Contains:** request ID, employee ID, project ID, assignment dates, authority chain, approval record
- **Lifecycle:** proposed → approved → active → released
- **Constraint:** Cannot be created without completed validation and approval
