# HR Module — Governance Profile

## Governance Maturity: High (not perfect)

The HR module has the most complete governance implementation in the platform. It covers all mutation and read endpoints with enforced permissions, scoping, masking, and audit logging. However, some areas remain partially implemented or deferred — see [MODULE_OPEN_GAPS.md](MODULE_OPEN_GAPS.md) for the honest gap list.

**Module version:** 9.0.0 (Phase 9 — Operationalization)

## Controls Implemented

| Control | Implementation | Status |
|---|---|---|
| Governed mutations | `governedProcedure` on all 15 domain sub-routers | Complete |
| Permission enforcement | `requireHrPermission` / `checkHrAccess` on all procedures | Complete |
| Data scope enforcement | `resolveDataScope` for self/team/all scoping | Complete |
| Field masking — directory | `maskDirectoryFields` (primaryPhone, notes, costCenter, legalEntity) | Complete |
| Field masking — compensation | `maskCompensationFields` with `COMPENSATION_READ_SENSITIVE` gate | Complete |
| Field masking — relations | `maskRelationsFields` with `RELATIONS_READ_SENSITIVE` gate | Complete |
| Field masking — talent | `maskTalentFields` on talent reviews and succession data | Complete |
| Field masking — performance | `maskPerformanceFields` on goals and reviews | Complete |
| Field masking — incidents | `maskIncidentFields` on incident reports | Complete |
| Field masking — work permits | `maskWorkPermitFields` on work permit data | Complete |
| Field masking — role definitions | `maskRoleDefRestrictedFields` + `maskRoleDefManagerFields` | Complete |
| Sensitive-read logging | `logSensitiveRead` on talent, compensation, relations, role-def reads | Complete |
| Separation of Duties | `preventSelfApproval` on approvals (time, leave, overtime, performance, role-def) | Complete |
| Frontend route gating | `HrGate` component on HR routes | Complete |
| Nav role filtering | `HRSideNav` consumes `getVisibleSections()` filtered by user's allowed actions | Complete |
| Carbon SideNav | 3-level accordion with observability tracking | Complete |
| Nav drift detection | `findUnknownBackendDomains()` + `getImplementationBreakdown()` helpers | Complete |
| Worker status state machine | `WORKER_STATUS_FLOW` enforced at runtime | Complete |
| Role cache | 60-second TTL cache for HR role lookups | Complete |

## Permission Model

HR uses a dedicated action-based permission model defined in `server/hr/permissions.ts`.

### Roles (5)

| Role | Privilege Level | Description |
|---|---|---|
| `employee` | 1 | Self-service access only |
| `manager` | 2 | Team access + limited write |
| `hrbp` | 3 | Broad HR access + sensitive reads |
| `admin` | 4 | All HR actions |
| `workspace_admin` | 5 | All HR actions (platform admin) |

### Action Categories (70+)

- **Directory:** read, read.team, read.self, write
- **Organization:** read, write
- **Staffing:** read, assign, end, export
- **Recruiting:** read, write, manage
- **Lifecycle:** read, write, manage + onboarding/offboarding sub-actions
- **Time:** read, read.self, read.team, write, approve
- **Leave:** read, read.self, write, approve
- **Overtime:** read, read.self, write, approve
- **Shift:** read, write, manage
- **Learning:** read, read.self, write, manage
- **Certification:** read, write, manage
- **Performance:** read, read.self, write, manage
- **Compensation:** read, read.sensitive, write, manage
- **Benefits:** read, write, manage
- **Relations:** read, read.sensitive, write, manage
- **Policy:** read, write, manage
- **Engagement:** read, write, manage
- **Survey:** read, write, manage
- **Recognition:** read, write
- **Compliance:** read, write, manage
- **Incident:** read, write, manage
- **Risk:** read, write, manage
- **Analytics:** read, write, manage
- **Talent:** read, write, manage
- **Succession:** read, write, manage
- **Role Definitions:** read, read.self, read.restricted, draft, submit, review, approve, publish, retire, link_position

### Employee Self-Service Scope

| Action | Purpose |
|---|---|
| `hr.directory.read.self` | View own profile |
| `hr.time.read.self` | View own time entries |
| `hr.leave.read.self` | View own leave requests |
| `hr.overtime.read.self` | View own overtime |
| `hr.learning.read.self` | View own learning assignments |
| `hr.performance.read.self` | View own goals/reviews |
| `hr.roledef.read.self` | View own role definition |

## Phase History

| Phase | Focus | Key Deliverables |
|---|---|---|
| 1–4 | Domain build-out | 14 backend domains, 30+ pages |
| 5 | Integration | Reminders, workforce breakdown, role-permission matrix |
| 6 | Hardening | Role-aware masking, API permission enforcement |
| 7 | Data & governance | 28-employee seed, persistent role resolution, SoD |
| 7.3 | Read governance | Talent masking, self-service scope, frontend gating |
| 8 | Carbon SideNav | Nav config validation, backward compat, role definitions |
| 9 | Operationalization | Drift detection, nav health, observability, deferred tracking |

## Audit History

| Document | Location |
|---|---|
| Module audit report | `HR/HR_MODULE_AUDIT_REPORT.md` |
| Governance compliance audit | `HR/HR_GOVERNANCE_COMPLIANCE_AUDIT.md` |
| Phase 7.2 re-audit | `HR/HR_V72_REAUDIT.md` |
| Final re-audit | `HR/HR_GOVERNANCE_COMPLIANCE_REAUDIT_FINAL.md` |
| Final acceptance audit | `HR/HR_FINAL_ACCEPTANCE_AUDIT.md` |
| Compatibility assessment | `HR/GOVERNANCE_HR_COMPATIBILITY_ASSESSMENT.md` |
| Deep compatibility analysis | `HR/HR_DEEP_COMPATIBILITY_ANALYSIS.md` |

## Global Doctrine Alignment

| Global Doctrine | HR Alignment |
|---|---|
| Governance Model | HR uses `governedProcedure` — the platform's governed mutation enforcement layer |
| Security Model | HR implements field-level masking beyond platform RBAC — stricter than most modules |
| Audit Model | HR has its own `logHrAudit` trail, separate from platform audit — creates fragmentation (known gap) |
| Operational Compliance | HR follows periodic review cadence — see [MODULE_PERIODIC_CHECKS.md](MODULE_PERIODIC_CHECKS.md) |
| Control Matrix | HR controls are the most complete entry in the platform control matrix |
| Coverage Matrix | HR has full mutation + read governance coverage |
