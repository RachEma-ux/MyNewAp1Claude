# HR Phase 4 — Backend/Domain Expansion (Carbon SideNav)

**Date:** 2026-03-24
**Phase:** 4 — Carbon SideNav Backend Expansion
**Status:** Implemented

## Summary

Phase 4 selectively expands the HR module backend to implement 6 high-value capabilities
that were marked `not-yet-implemented` in the canonical nav config (`hrNavConfig.ts`).
The expansion follows the principle of extending existing broad domain routers rather than
creating one router per nav leaf.

## Capabilities Implemented

| # | Capability | Nav Item ID | Section | Backend Domain | Router Extended |
|---|-----------|-------------|---------|----------------|-----------------|
| 1 | Job Architecture & Role Definitions | `job-architecture` | Workforce Planning | organization | `server/hr/organization/router.ts` |
| 2 | Work Permits & Compliance | `work-permits-compliance` | Employee Records | compliance | `server/hr/compliance/router.ts` |
| 3 | HR Letters & Certificates | `hr-letters-certificates` | Employee Records | directory | `server/hr/directory/router.ts` |
| 4 | Risk Management | `risk-management` | Compliance | compliance | (backend already existed) |
| 5 | Audit Logs | `audit-logs` | Security & Access | analytics | (backend already existed) |
| 6 | Access Controls | `access-controls` | Security & Access | analytics | `server/hr/analytics/router.ts` |

## Schema Changes

Two new tables added to existing schema files (no new table files created):

### `hr_work_permits` (in `drizzle/tables/hr-compliance.ts`)
- Worker-linked work authorization tracking
- Fields: permitType, permitNumber, issuingCountry, issuingAuthority, issueDate, expiryDate, status
- Statuses: active | expired | pending_renewal | revoked | cancelled
- Indexes: worker, expiry, status, type

### `hr_letters` (in `drizzle/tables/hr-core.ts`)
- Worker-linked HR letter/certificate tracking
- Fields: letterType, title, description, referenceNumber, issueDate, expiryDate, status, documentRef, templateId, metadata
- Statuses: draft | issued | revoked | expired
- Letter types: employment_verification | salary_certificate | experience_letter | noc | recommendation | warning | offer | promotion | transfer | other
- Indexes: worker, type, status, reference

## Backend Router Extensions

### Organization Router (`server/hr/organization/router.ts`)
- `createJobFamily` — governed mutation with audit
- `updateJobFamily` — governed mutation with audit
- `createJobLevel` — governed mutation with audit
- `updateJobLevel` — governed mutation with audit

### Compliance Router (`server/hr/compliance/router.ts`)
- `listWorkPermits` — protected query with filters
- `getWorkPermit` — protected query with sensitive-read audit
- `createWorkPermit` — governed mutation with audit
- `updateWorkPermit` — governed mutation with audit

### Directory Router (`server/hr/directory/router.ts`)
- `listLetters` — protected query with filters
- `getLetter` — protected query with sensitive-read audit
- `createLetter` — governed mutation with audit
- `updateLetter` — governed mutation with audit

### Analytics Router (`server/hr/analytics/router.ts`)
- `listRoleAssignments` — protected query (admin-only)
- `createRoleAssignment` — governed mutation with audit
- `updateRoleAssignment` — governed mutation with audit

## Frontend Pages Created

| Page Component | Route | Permission Gate |
|---------------|-------|-----------------|
| `HRJobArchitecturePage` | `/hr/workforce-planning/job-architecture` | `hr.organization.read` |
| `HRWorkPermitsPage` | `/hr/employee-records/work-permits` | `hr.compliance.read` |
| `HRLettersCertificatesPage` | `/hr/employee-records/letters-certificates` | `hr.directory.read` |
| `HRRiskManagementPage` | `/hr/compliance/risk-management` | `hr.risk.read` |
| `HRAuditLogsPage` | `/hr/security-access/audit-logs` | `hr.analytics.manage` |
| `HRAccessControlsPage` | `/hr/security-access/access-controls` | `hr.analytics.manage` |

## Nav Config Updates

6 items changed from `not-yet-implemented`/`not-started` to `existing-page`/`live`:
- `job-architecture`, `work-permits-compliance`, `hr-letters-certificates`
- `risk-management`, `audit-logs`, `access-controls`

Post-Phase 4 nav config stats:
- existing-page: 32 (was 26)
- tab-in-existing-page: 1 (unchanged)
- not-yet-implemented: 35 (was 41)

## Security Model

All new endpoints follow the established Phase 1-3 security model:
- **Reads**: `protectedProcedure` + `checkHrAccess()` or `requireHrPermission()`
- **Writes**: `governedProcedure` + `requireHrPermission()` + `logHrAudit()`
- **Sensitive reads**: `logSensitiveRead()` for work permits and letters
- **Role gating**: All frontend pages wrapped with `hrGated()` + `HrGate` component
- **Scope**: Uses existing HR_ACTIONS constants (no new permission constants needed)

## Design Decisions

1. **Extend, don't create**: Added endpoints to 4 existing domain routers rather than creating 6 new routers
2. **Minimal schema**: Only 2 new tables where truly required (work permits, letters); risk items and audit log already had tables
3. **Dynamic imports**: New table references use `await import()` to avoid circular dependency issues
4. **Consistent patterns**: All new endpoints follow the exact same tRPC + Drizzle + audit pattern as existing endpoints
