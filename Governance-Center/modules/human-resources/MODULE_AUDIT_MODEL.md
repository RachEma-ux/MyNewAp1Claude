# HR Module — Audit Model

## What HR Audits Today

The HR module maintains its own audit trail via `logHrAudit` calls across all sub-routers. This is separate from the platform-level governance audit system.

### Mutation Audit

All HR mutations go through `governedProcedure`, which provides:
- Caller identity (user ID, role)
- Action performed
- Timestamp
- Workspace context

Additionally, HR-specific audit logging captures:
- The specific HR action (e.g., `hr.staffing.assign`, `hr.time.approve`)
- Target entity (worker ID, record ID)
- Before/after state where relevant

### Sensitive-Read Audit

Reads of sensitive data trigger `logSensitiveRead` audit entries. This covers:

| Domain | Trigger | What Is Logged |
|---|---|---|
| Compensation | Any read of salary/benefit data | User, action, record scope, masked vs unmasked |
| Relations | Read of grievance/investigation details | User, action, record identifiers |
| Talent | Read of talent review / 9-box data | User, action, masked fields |
| Role Definitions | Read of restricted role-def fields | User, action, sensitivity level |

### Status-Change Audit

Worker status transitions are governed by `WORKER_STATUS_FLOW` state machine:
- `active` → `on_leave`, `suspended`, `terminated`, `inactive`
- `on_leave` → `active`, `terminated`
- `suspended` → `active`, `terminated`
- `inactive` → `active`, `terminated`
- `terminated` → (terminal state)

Invalid transitions are blocked at runtime.

### Approval Audit

The `preventSelfApproval` control creates an audit trail for:
- Time approval attempts
- Leave approval attempts
- Overtime approval attempts
- Performance review approvals
- Role definition lifecycle approvals (review, approve, publish)

Self-approval attempts are logged and rejected with `FORBIDDEN`.

## Carbon SideNav Discoverability Implications

The Carbon SideNav introduces a governance-relevant discoverability surface:

1. **Role-filtered visibility**: Sections and items are hidden from users who lack the `requiredAction`. This means the nav config acts as a visibility access control layer.
2. **Observability tracking**: `trackSectionVisit` and `trackItemClick` record navigation patterns, providing evidence of what users access.
3. **Deferred item filtering**: Only `live` and `placeholder` items appear in the sidebar. `not-started` items are invisible to users but remain in the governance config for tracking.
4. **Scope-type metadata**: Each nav item declares its scope type, which the backend enforces. A reviewer can verify that scope claims in the nav config match backend enforcement.

## Module-Level vs Platform-Level Audit

| Dimension | HR Module | Platform |
|---|---|---|
| Audit function | `logHrAudit` (HR-specific) | `governanceAuditService` (platform) |
| Mutation coverage | All HR mutations | Via `governedProcedure` middleware |
| Sensitive-read logging | `logSensitiveRead` (HR-specific) | Not implemented platform-wide |
| SoD enforcement | `preventSelfApproval` (HR-specific) | Not implemented platform-wide |
| Nav observability | `trackSectionVisit` / `trackItemClick` | Not implemented for other modules |

### Known Fragmentation

HR maintains a parallel audit trail alongside the platform's governance audit system. This creates:
- **Dual logging**: Some actions are logged both by HR and by the platform governance middleware
- **Query fragmentation**: A full audit picture requires querying both HR-specific and platform audit tables
- **Unification gap**: The `unifiedAuditQuery` feature flag is enabled (Phase 7.2) but full unification of HR and platform audit logs into a single queryable surface is not yet complete

This fragmentation is documented as an open gap in [MODULE_OPEN_GAPS.md](MODULE_OPEN_GAPS.md).

## Audit Evidence Locations

| Evidence Type | Location |
|---|---|
| HR audit log entries | Database: `hr_audit_logs` table (runtime) |
| Platform governance audit | Database: `governance_audit_logs` table (runtime) |
| Nav observability events | Client-side tracking (in-memory, not persisted to DB) |
| Historical audit reports | `HR/HR_MODULE_AUDIT_REPORT.md`, `HR/HR_GOVERNANCE_COMPLIANCE_AUDIT.md`, `HR/HR_V72_REAUDIT.md`, `HR/HR_GOVERNANCE_COMPLIANCE_REAUDIT_FINAL.md`, `HR/HR_FINAL_ACCEPTANCE_AUDIT.md` |

## Global Doctrine Reference

- Platform audit architecture: [Governance-Center/global/AUDIT_MODEL.md](../../global/AUDIT_MODEL.md)
- Platform security controls: [Governance-Center/global/SECURITY_MODEL.md](../../global/SECURITY_MODEL.md)
- Operational compliance model: [Governance-Center/global/OPERATIONAL_COMPLIANCE_MODEL.md](../../global/OPERATIONAL_COMPLIANCE_MODEL.md)
