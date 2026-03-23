# HR Module — Governance Profile

## Governance Maturity: High

The HR module has the most complete governance implementation in the platform.

## Controls Implemented

| Control | Implementation | Status |
|---|---|---|
| Governed mutations | `governedProcedure` on all 14 sub-routers | Complete |
| Permission enforcement | `requireHrPermission` with action-based checks | Complete |
| Data scope enforcement | `resolveDataScope` for self/team/all scoping | Complete |
| Sensitive-read logging | `logSensitiveRead` on talent reviews | Complete |
| Talent data masking | `maskTalentFields` for non-privileged readers | Complete |
| Separation of Duties | `preventSelfApproval` on approvals | Complete |
| Frontend route gating | `HrGate` component + `hrGated()` HOC | Complete |
| Nav role filtering | `useHrRole` hook filters nav items by role | Complete |

## Permission Model

HR uses a dedicated action-based permission model:
- Actions like `TIME_READ_SELF`, `TIME_READ_TEAM`, `PAYROLL_WRITE`, etc.
- Roles: employee (self actions), manager (team actions), hrbp/admin (all actions)
- Workspace-scoped: permissions are per-workspace

## Audit Phases

| Phase | Description | Status |
|---|---|---|
| Phase 5 | Initial implementation | Complete |
| Phase 6 | Governance hardening (async perms, scope, audit) | Complete |
| Phase 7 | Full governance pass (SoD, unified audit) | Complete |
| Phase 7.2 | Re-audit | Complete |
| Phase 7.3 | Read governance (masking, scope, frontend gating) | Complete |
