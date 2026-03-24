# HR Carbon SideNav — Scope Map

## Document Status

- **Type:** Data scope classification
- **Phase:** 0 — Governance-first definition
- **Date:** 2026-03-24
- **Canonical source of truth:** `client/src/config/hrNavConfig.ts`
- **Backend implementation:** `server/hr/permissions.ts` → `resolveDataScope()`
- **Client-side mirror:** `client/src/lib/hrNavAuth.ts` → `resolveClientScope()`

---

## 1. Scope Types

Every leaf item declares a `scopeType` that classifies what data the user will see when accessing that capability.

| Scope Type | Meaning | Resolution | Count |
|---|---|---|---|
| `self` | User sees only their own data | Backend returns own records only | 4 |
| `team` | Manager sees direct reports' data | Backend returns team member records | 0 |
| `all` | User sees all records in the domain | No scope filtering applied | 25 |
| `sensitive` | Restricted data requiring elevated permissions | `checkHrAccess()` with sensitive action; masking applied | 20 |
| `mixed` | Scope varies by user's role | `resolveDataScope()` cascades global → team → self | 19 |

---

## 2. Scope Resolution Chain

For `mixed` scope items, the backend `resolveDataScope()` function cascades through the item's `scopeActions`:

1. If user has `scopeActions.global` action → returns `"all"` scope (all records)
2. If user has `scopeActions.team` action → returns `"team"` scope + team worker IDs
3. If user has `scopeActions.self` action → returns `"self"` scope + own worker ID
4. None → returns `"none"` (access denied)

The client-side `resolveClientScope()` mirrors this logic for UI scope indicators.

---

## 3. Items by Scope Type

### Self-Scope Items (4)

| Item | Section | Action | Scope Actions |
|---|---|---|---|
| time-tracking | Time & Attendance | hr.time.read | global: hr.time.read, team: hr.time.read.team, self: hr.time.read.self |
| leave-management | Time & Attendance | hr.leave.read | global: hr.leave.read, self: hr.leave.read.self |
| training-catalog | Learning & Development | hr.learning.read | global: hr.learning.read, self: hr.learning.read.self |
| goal-setting | Performance & Talent | hr.performance.read | global: hr.performance.read, self: hr.performance.read.self |

These items always resolve to `self` scope for employees and `all` scope for HRBP/admin.

### Sensitive-Scope Items (20)

| Item | Section | Why Sensitive |
|---|---|---|
| offer-management | Talent Acquisition | Job offer terms and salary details |
| offboarding-termination | Onboarding & Offboarding | Termination reasons and circumstances |
| offboarding-exit-interview | Onboarding & Offboarding | Exit interview content — candid feedback |
| work-permits-compliance | Employee Records | Immigration and work authorization data |
| salary-structure | Compensation & Benefits | Salary bands and individual pay |
| annual-salary-review | Compensation & Benefits | Review cycle compensation decisions |
| bonus-incentives | Compensation & Benefits | Bonus amounts and incentive payouts |
| pension-retirement | Compensation & Benefits | Retirement and pension financial data |
| talent-reviews | Performance & Talent | Talent assessments, nine-box, retention risk |
| succession-planning | Performance & Talent | Successor identification — career-sensitive |
| grievances-complaints | Employee Relations | Grievance details and investigation notes |
| disciplinary-actions | Employee Relations | Disciplinary records — legal implications |
| workplace-investigations | Employee Relations | Investigation findings and recommendations |
| role-based-access | Security & Access | Role assignment controls |
| access-controls | Security & Access | Access policy configuration |
| data-privacy-settings | Security & Access | Privacy settings and consent data |
| audit-logs | Security & Access | Audit trail — security-critical metadata |
| security-policies | Security & Access | Security policy definitions |
| privacy-access-controls | Compliance | Data privacy access controls |
| risk-management | Compliance | Risk assessment data |

### Mixed-Scope Items (19)

| Item | Section | scopeActions Declared? |
|---|---|---|
| onboarding-checklist | Onboarding & Offboarding | No |
| onboarding-orientation | Onboarding & Offboarding | No |
| employee-profile | Employee Records | **Yes** — global/team/self |
| contracts-documents | Employee Records | No |
| hr-letters-certificates | Employee Records | No |
| health-insurance | Compensation & Benefits | No |
| allowances-perks | Compensation & Benefits | No |
| overtime-requests | Time & Attendance | No |
| mandatory-training | Learning & Development | No |
| skill-development | Learning & Development | No |
| certifications | Learning & Development | No |
| learning-history | Learning & Development | No |
| performance-reviews | Performance & Talent | **Yes** — global/self |
| feedback-360 | Performance & Talent | No |

**Gap note:** 6 live mixed-scope items lack explicit `scopeActions` definitions. Runtime scope resolution uses fallback logic (checks `requiredAction` only). This is tracked as exception EX-001 in the Module Nav Exception Registry.

### All-Scope Items (25)

The remaining 25 items use `all` scope — no scope narrowing is applied. These are typically administrative or organizational capabilities visible to any user with the required action.

---

## 4. Scope Governance Rules

1. **Self-scope items must declare `scopeActions`** to enable proper scope cascade
2. **Mixed-scope items should declare `scopeActions`** when multiple scope levels exist — the 6 undeclared items are a known gap
3. **Sensitive-scope items use `checkHrAccess()`** instead of `resolveDataScope()` — they require an elevated permission rather than scope narrowing
4. **All-scope items have no scope restriction** — any user with the required action sees all records
5. **Backend enforces scope independently of nav config** — the config declares scope intent; `resolveDataScope()` enforces it per query

---

## 5. Source of Truth

- **Scope declarations:** `client/src/config/hrNavConfig.ts` → each item's `scopeType` and `scopeActions`
- **Backend scope resolution:** `server/hr/permissions.ts` → `resolveDataScope()`
- **Client-side scope:** `client/src/lib/hrNavAuth.ts` → `resolveClientScope()`
- **Scope type contract:** `client/src/navigation/moduleNavTypes.ts` → `ScopeType`
