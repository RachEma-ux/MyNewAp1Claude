# Human Resources — Module Governance

## Overview

The HR module is the most governance-mature module in the platform, with full enforcement across all mutation and read endpoints.

## Governance Status: Full Coverage

- All mutations use `governedProcedure` + `requireHrPermission`
- All reads use `resolveDataScope` for employee self-service scoping
- Sensitive reads have `logSensitiveRead` audit logging
- Talent data masked via `maskTalentFields` for non-privileged readers
- Separation of Duties (SoD) enforced via `preventSelfApproval`
- Frontend route gating via `HrGate` component
- Current version: 7.3.0

## Sub-Modules

| Sub-Module | Router | Governance |
|---|---|---|
| Core HR | `server/hr/router.ts` | governedProcedure |
| Time & Leave | `server/hr/time/router.ts` | governedProcedure + resolveDataScope |
| Performance | `server/hr/performance/router.ts` | governedProcedure + resolveDataScope |
| Payroll | `server/hr/payroll/router.ts` | governedProcedure + requireHrPermission |
| Benefits | `server/hr/benefits/router.ts` | governedProcedure + requireHrPermission |
| Compliance | `server/hr/compliance/router.ts` | governedProcedure + requireHrPermission |
| Talent | `server/hr/talent/router.ts` | governedProcedure + maskTalentFields |
| Training | `server/hr/training/router.ts` | governedProcedure + requireHrPermission |
| Recruitment | `server/hr/recruitment/router.ts` | governedProcedure + requireHrPermission |
| Onboarding | `server/hr/onboarding/router.ts` | governedProcedure + requireHrPermission |
| Offboarding | `server/hr/offboarding/router.ts` | governedProcedure + requireHrPermission |
| Documents | `server/hr/documents/router.ts` | governedProcedure + requireHrPermission |
| Analytics | `server/hr/analytics/router.ts` | governedProcedure + requireHrPermission |
| Settings | `server/hr/settings/router.ts` | governedProcedure + requireHrPermission |
