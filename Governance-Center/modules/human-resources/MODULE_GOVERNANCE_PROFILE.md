# HR Module — Governance Profile

## Governance Maturity: Full Compliance (10/10)

The HR module has the most complete governance implementation in the platform.
As of 2026-03-24, all governance dimensions score 10/10 with zero open gaps.

## Controls Implemented

| Control | Implementation | Status |
|---|---|---|
| Governed mutations | `governedProcedure` on all 16 sub-routers (212 procedures) | Complete |
| Permission enforcement | `requireHrPermission` / `checkHrAccess` on every procedure | Complete |
| Data scope enforcement | `resolveDataScope` for self/team/all scoping on 11+ endpoints | Complete |
| Field masking — directory | `maskDirectoryFields` on list/search/getById | Complete |
| Field masking — compensation | `maskCompensationFields` with `COMPENSATION_READ_SENSITIVE` gate | Complete |
| Field masking — relations | `maskRelationsFields` with `RELATIONS_READ_SENSITIVE` gate | Complete |
| Field masking — talent | `maskTalentFields` on talent reviews and succession data | Complete |
| Field masking — performance | `maskPerformanceFields` on goals and reviews (scope-aware) | Complete |
| Field masking — incidents | `maskIncidentFields` with `INCIDENT_MANAGE` gate | Complete |
| Field masking — work permits | `maskWorkPermitFields` with `COMPLIANCE_MANAGE` gate | Complete |
| Field masking — role definitions | `maskRoleDefRestrictedFields` + `maskRoleDefManagerFields` | Complete |
| Sensitive-read logging | `logSensitiveRead` on talent, succession, compliance, role-def reads | Complete |
| Separation of Duties | `preventSelfApproval` on time, leave, overtime, performance, role-def approvals | Complete |
| Frontend route gating | `HrGate` component on all 34+ HR routes (including 12 self-service) | Complete |
| Nav role filtering | `useHrRole` hook filters sidebar items and homepage sections | Complete |
| Homepage role filtering | `HRHomePage` filters section cards by `can(requiredAction)` | Complete |
| Lifecycle state machines | 18 domain-specific transition maps enforced at runtime | Complete |
| Audit trail | `logHrAudit` on every mutation across all routers | Complete |

## Permission Model

HR uses a dedicated action-based permission model with 70+ granular actions:
- 5 roles: employee, manager, hrbp, admin, workspace_admin
- Self-scope actions: `*_READ_SELF` (employee sees own data)
- Team-scope actions: `*_READ_TEAM` (manager sees direct reports)
- Sensitive-read actions: `*_READ_SENSITIVE` (gates field unmasking)
- Workspace-scoped: permissions are per-workspace

### Employee Self-Service Actions

| Action | Purpose |
|---|---|
| `DIRECTORY_READ_SELF` | View own profile |
| `TIME_READ_SELF` | View own time entries |
| `LEAVE_READ_SELF` | View own leave requests |
| `OVERTIME_READ_SELF` | View own overtime requests |
| `LEARNING_READ_SELF` | View own assignments/history |
| `PERFORMANCE_READ_SELF` | View own goals/reviews |
| `ROLE_DEF_READ_SELF` | View own role definition |

## Audit Phases

| Phase | Description | Status |
|---|---|---|
| Phase 5 | Initial implementation | Complete |
| Phase 6 | Governance hardening (async perms, scope, audit) | Complete |
| Phase 7 | Full governance pass (SoD, unified audit) | Complete |
| Phase 7.2 | Re-audit | Complete |
| Phase 7.3 | Read governance (masking, scope, frontend gating) | Complete |
| Phase 8 | Role definitions (versioned lifecycle, visibility, position linkage) | Complete |
| Phase 8.1 | Full compliance remediation (all P0-P3 gaps closed) | Complete |

## Latest Audit

- **Date:** 2026-03-24
- **Score:** 10/10
- **Report:** `Governance-Center/reports/HR_COMPLIANCE_REAUDIT_2026-03-24.md`
- **Full report:** `HR/HR_GOVERNANCE_COMPLIANCE_REAUDIT_FINAL.md`
