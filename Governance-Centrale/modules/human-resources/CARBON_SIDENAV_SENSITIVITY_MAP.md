# HR Carbon SideNav — Sensitivity Map

## Document Status

- **Type:** Sensitivity and masking classification
- **Phase:** 0 — Governance-first definition
- **Date:** 2026-03-24
- **Canonical source of truth:** `client/src/config/hrNavConfig.ts`
- **Masking implementation:** `server/hr/permissions.ts`

---

## 1. What "Sensitive" Means in HR SideNav Context

An item is governance-sensitive when accessing it exposes data that:
- Contains personally identifiable information (PII) beyond basic directory info
- Reveals financial data (salary, bonus, benefits amounts)
- Contains disciplinary, investigation, or grievance records with legal implications
- Exposes talent assessment data that could affect career decisions
- Provides access to security configurations or audit trails

Sensitivity is declared at the nav item level via `scopeType: "sensitive"`, `maskingRequired: true`, and `sensitiveReadAudit: true`. These declarations are governance commitments — they constrain both current and future implementation.

---

## 2. Masking Classification

### Items Requiring Field Masking (15)

| Item | Section | Masking Field Set | Fields Masked |
|---|---|---|---|
| employee-profile | Employee Records | directory | primaryPhone, notes, costCenter, legalEntity |
| contracts-documents | Employee Records | directory | primaryPhone, notes, costCenter, legalEntity |
| employment-changes | Employee Records | directory | primaryPhone, notes, costCenter, legalEntity |
| hr-letters-certificates | Employee Records | directory | primaryPhone, notes, costCenter, legalEntity |
| salary-structure | Compensation & Benefits | compensation | baseSalary, amount, budgetPercent, employerContribution, employeeContribution |
| annual-salary-review | Compensation & Benefits | compensation | baseSalary, amount, budgetPercent, employerContribution, employeeContribution |
| bonus-incentives | Compensation & Benefits | compensation | baseSalary, amount, budgetPercent, employerContribution, employeeContribution |
| health-insurance | Compensation & Benefits | compensation | baseSalary, amount, budgetPercent, employerContribution, employeeContribution |
| pension-retirement | Compensation & Benefits | compensation | baseSalary, amount, budgetPercent, employerContribution, employeeContribution |
| allowances-perks | Compensation & Benefits | compensation | baseSalary, amount, budgetPercent, employerContribution, employeeContribution |
| grievances-complaints | Employee Relations | relations | description, resolutionNotes, findings, recommendation, appealNotes |
| disciplinary-actions | Employee Relations | relations | description, resolutionNotes, findings, recommendation, appealNotes |
| workplace-investigations | Employee Relations | relations | description, resolutionNotes, findings, recommendation, appealNotes |
| talent-reviews | Performance & Talent | talent | retentionRisk, developmentAreas, developmentNeeds, nineBoxPosition, readinessForPromotion |

Note: Some items with `maskingRequired: true` are not yet implemented but their masking obligation is established.

### Masking Bypass

Users with the item's `sensitiveAction` bypass field masking:
- `hr.compensation.read.sensitive` → unmasked compensation data
- `hr.relations.read.sensitive` → unmasked relations data
- `hr.talent.write` → unmasked talent data

Only HRBP, admin, and workspace_admin roles typically hold these sensitive actions.

---

## 3. Sensitive-Read Audit Classification

### Items Triggering Sensitive-Read Audit (10)

| Item | Section | Sensitive Action | Audit Function |
|---|---|---|---|
| salary-structure | Compensation & Benefits | hr.compensation.read.sensitive | logSensitiveRead() |
| annual-salary-review | Compensation & Benefits | hr.compensation.read.sensitive | logSensitiveRead() |
| bonus-incentives | Compensation & Benefits | hr.compensation.read.sensitive | logSensitiveRead() |
| health-insurance | Compensation & Benefits | hr.compensation.read.sensitive | logSensitiveRead() |
| pension-retirement | Compensation & Benefits | hr.compensation.read.sensitive | logSensitiveRead() |
| allowances-perks | Compensation & Benefits | hr.compensation.read.sensitive | logSensitiveRead() |
| grievances-complaints | Employee Relations | hr.relations.read.sensitive | logSensitiveRead() |
| disciplinary-actions | Employee Relations | hr.relations.read.sensitive | logSensitiveRead() |
| workplace-investigations | Employee Relations | hr.relations.read.sensitive | logSensitiveRead() |
| talent-reviews | Performance & Talent | hr.talent.write | logSensitiveRead() |

### Items with Masking but No Sensitive-Read Audit (5)

| Item | Section | Rationale |
|---|---|---|
| employee-profile | Employee Records | Directory masking is privacy-protective but not audit-worthy for reads |
| contracts-documents | Employee Records | Not yet implemented; audit expectation will be set on implementation |
| employment-changes | Employee Records | Not yet implemented; audit expectation will be set on implementation |
| hr-letters-certificates | Employee Records | Letter generation is audited as a mutation, not a read |

---

## 4. Governance-Sensitive Items (Even If Not Fully Implemented)

The following items carry governance sensitivity obligations that must be honored when implemented:

### Compensation Domain (4 not-started)
- annual-salary-review, bonus-incentives, pension-retirement, allowances-perks
- **Obligation:** Must implement compensation masking and sensitive-read audit before going live

### Employee Relations Domain (2 not-started)
- disciplinary-actions, workplace-investigations
- **Obligation:** Must implement relations masking and sensitive-read audit; content is legally protected

### Security & Access Domain (2 not-started)
- data-privacy-settings, security-policies
- **Obligation:** Admin-only access; changes to these items must be mutation-audited

### Compliance Domain (3 not-started)
- policy-management, audit-reporting, privacy-access-controls
- **Obligation:** Compliance items must be auditable; privacy controls require sensitive-read tracking

### Onboarding/Offboarding Domain (1 not-started)
- offboarding-exit-interview
- **Obligation:** Exit interview content is sensitive; masking and audit should be considered

---

## 5. Sensitivity Summary

| Category | Count | Description |
|---|---|---|
| Items with field masking | 15 | Backend applies `mask*Fields()` function |
| Items with sensitive-read audit | 10 | Reads trigger `logSensitiveRead()` |
| Items with both masking and audit | 10 | All audited items also have masking |
| Items with masking only (no audit) | 5 | Directory masking without audit |
| Governance-sensitive not-started items | 12 | Carry binding governance obligations for future implementation |
| Non-sensitive items | 53 | Standard access with basic auth check only |

---

## 6. Source of Truth

- **Masking declarations:** `client/src/config/hrNavConfig.ts` → `maskingRequired`, `maskingFieldSet`
- **Audit declarations:** `client/src/config/hrNavConfig.ts` → `sensitiveReadAudit`, `sensitiveAction`
- **Masking functions:** `server/hr/permissions.ts` → `maskDirectoryFields()`, `maskCompensationFields()`, `maskRelationsFields()`, `maskTalentFields()`
- **Audit logging:** `server/hr/audit.ts` → `logSensitiveRead()`
- **Client-side masking awareness:** `client/src/lib/hrNavAuth.ts` → `wouldSeeMaskedData()`
