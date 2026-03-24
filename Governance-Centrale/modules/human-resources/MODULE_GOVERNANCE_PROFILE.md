# HR Module — Governance Profile

## Document Status

- **Type:** Governance identity card
- **Module:** Human Resources
- **Last updated:** 2026-03-24

---

## 1. Module Identity

| Field | Value |
|---|---|
| Module key | `hr` |
| Display name | Human Resources |
| tRPC root namespace | `hr.*` |
| Backend domain path | `server/hr/` |
| Frontend route prefix | `/hr/*` |
| Database table prefix | `hr_*` |
| Schema files | `drizzle/tables/hr-*.ts` (14 files) |
| Module version | 9.0.0 |
| Module posture | First-class domain module, workspace-consumable |

---

## 2. Governance Classification

| Dimension | Classification |
|---|---|
| Data sensitivity | **High** — contains PII, compensation, disciplinary, investigation data |
| Mutation sensitivity | **High** — employment lifecycle, assignment changes, compensation changes |
| Audit requirement | **Mandatory** — all mutations logged, sensitive reads logged |
| Policy enforcement | **Active** — role-based access, field masking, scope resolution |
| Self-approval prevention | **Active** — enforced on time/leave/overtime/bonus/review approvals |
| Fail mode | **Fail-closed** — missing permission = denied |

---

## 3. Carbon SideNav as Governance Surface

The HR module's IBM Carbon-style SideNav is not just navigation — it is a **governance surface**. The complete governance-first analysis is documented in the **Phase 0 governance package** — see [CARBON_SIDENAV_PHASE0_SUMMARY.md](CARBON_SIDENAV_PHASE0_SUMMARY.md) for the full artifact index.

Every one of the 68 leaf items in the nav config declares governance metadata:

### Nav-Level Governance Fields

| Field | Governance Purpose |
|---|---|
| `requiredAction` | Maps to an HR_ACTIONS constant; determines who can see/access the item |
| `visibilityMode` | Controls whether unauthorized users see the item (show, hide, show-disabled, redirect) |
| `scopeType` | Classifies data visibility scope (self, team, all, sensitive, mixed) |
| `maskingRequired` | Indicates backend applies field-level masking |
| `maskingFieldSet` | Identifies which masking function applies (directory, compensation, relations, talent) |
| `sensitiveReadAudit` | Whether reads trigger audit log entries |
| `sensitiveAction` | Elevated permission that grants unmasked data access |
| `scopeActions` | Scope resolution actions matching backend `resolveDataScope()` |

### Why This Matters

The canonical nav config (`client/src/config/hrNavConfig.ts`) serves as the single source of truth for:

1. **What capabilities exist** — 68 items across 13 sections
2. **Who can see what** — via `requiredAction` + `visibilityMode`
3. **What data scope applies** — via `scopeType` + `scopeActions`
4. **What gets masked** — via `maskingRequired` + `maskingFieldSet`
5. **What triggers audit** — via `sensitiveReadAudit`
6. **Implementation status** — via `backedBy` + `implementationStatus`

This makes the nav config a **governance declaration**, not just a UI artifact.

---

## 4. Permission Model

### Roles

| Role | Scope | Description |
|---|---|---|
| `employee` | Self | Basic self-service access (own profile, timesheet, goals, leave) |
| `manager` | Team | Team-scoped access (direct reports' data, team time/performance) |
| `hrbp` | All | Organization-wide access with sensitive data (compensation, relations, talent) |
| `admin` | All | Full administrative access including security and configuration |
| `workspace_admin` | All | Same as admin; workspace-level administrative authority |

### Permission Matrix

The `HR_ROLE_PERMISSIONS` matrix in `server/hr/permissions.ts` maps each role to a set of ~60+ allowed actions. The actions follow a consistent naming pattern:

```
hr.<domain>.<operation>[.<scope>]
```

Examples: `hr.directory.read`, `hr.compensation.read.sensitive`, `hr.time.read.team`

### Role Determination

User's HR role is determined by `getHrRoleForUser()` in `server/hr/permissions.ts`. The role and allowed actions are exposed to the frontend via `hr.me.getRole` tRPC endpoint, consumed by `useHrRole()` hook.

---

## 5. Scope Model

### Scope Types

| Scope | Meaning | Resolution |
|---|---|---|
| `self` | User sees only own data | `resolveDataScope()` returns worker's own records |
| `team` | Manager sees direct reports | `resolveDataScope()` returns team member records |
| `all` | HRBP/admin sees all records | `resolveDataScope()` returns all records |
| `sensitive` | Restricted data requiring elevated permissions | `checkHrAccess()` with sensitive action |
| `mixed` | Scope varies by role | `resolveDataScope()` cascades global → team → self |

### Scope Resolution Chain

Backend `resolveDataScope(globalAction, teamAction, selfAction)` cascades:
1. User has global action → returns `"all"` scope
2. User has team action → returns `"team"` scope + team worker IDs
3. User has self action → returns `"self"` scope + own worker ID
4. None → returns `"none"` (denied)

Client-side `resolveClientScope()` in `client/src/lib/hrNavAuth.ts` mirrors this logic for UI-level scope indicators.

---

## 6. Field Masking Model

### Masking Functions

| Function | Fields Masked | Domain |
|---|---|---|
| `maskDirectoryFields()` | primaryPhone, notes, costCenter, legalEntity | Directory |
| `maskCompensationFields()` | baseSalary, amount, budgetPercent, employerContribution, employeeContribution | Compensation |
| `maskRelationsFields()` | description, resolutionNotes, findings, recommendation, appealNotes | Relations |
| `maskTalentFields()` | retentionRisk, developmentAreas, developmentNeeds, nineBoxPosition, readinessForPromotion | Talent |

### Masking Bypass

Users with the item's `sensitiveAction` (e.g., `hr.compensation.read.sensitive`) bypass field masking and see full data. All unmasked reads of sensitive data are audit-logged via `logSensitiveRead()`.

---

## 7. Self-Approval Prevention

The `preventSelfApproval()` function in `server/hr/permissions.ts` blocks users from approving their own:

- Time entry submissions
- Leave requests
- Overtime requests
- Bonus awards
- Performance reviews (manager self-review)

---

## 8. Workspace Integration

HR is both a standalone module and a workspace-consumable service:

| Surface | Namespace | Purpose |
|---|---|---|
| Global HR | `hr.*` | Full HR operations (directory, org, compensation, etc.) |
| Workspace HR | `modules.hr.*` | Workspace-facing queries (staffing, assignments, availability) |

Other modules consume HR through `modules.hr.*` — they never read HR tables directly.

---

## 9. Sensitive Governance Sections

The following HR sections contain governance-sensitive data and require elevated controls. For each, the governance expectation is stated explicitly.

### 9.1 Compensation & Benefits

| Aspect | Value |
|---|---|
| Why sensitive | Contains salary, bonus, and benefit amounts — PII and financial data |
| Permission gate | `hr.compensation.read` (basic), `hr.compensation.read.sensitive` (unmasked) |
| Scope | `sensitive` — HRBP/admin only for unmasked data |
| Masking | `maskCompensationFields()` applied to all responses; baseSalary, amount, budgetPercent masked |
| Audit | All reads trigger `logSensitiveRead()`; all writes trigger `logHrAudit()` |
| Self-approval | Bonus approvals blocked by `preventSelfApproval()` |
| Nav exposure | 2 of 6 items live (salary-structure, health-insurance); 4 deferred |

### 9.2 Performance & Talent Management

| Aspect | Value |
|---|---|
| Why sensitive | Contains performance ratings, talent assessments, nine-box positions, succession plans |
| Permission gate | `hr.performance.read` (reviews), `hr.talent.read` (talent reviews) |
| Scope | `mixed` for reviews (self/team/all), `sensitive` for talent reviews |
| Masking | `maskTalentFields()` applied; retentionRisk, nineBoxPosition, readinessForPromotion masked |
| Audit | Talent review reads trigger `logSensitiveRead()` |
| Self-approval | Manager review submissions blocked by `preventSelfApproval()` |
| Nav exposure | 3 of 5 items live (goals, reviews, talent-reviews); 2 deferred (360 feedback, succession) |

### 9.3 Employee Relations

| Aspect | Value |
|---|---|
| Why sensitive | Contains grievances, disciplinary actions, investigation records |
| Permission gate | `hr.relations.read` (basic), `hr.relations.read.sensitive` (unmasked) |
| Scope | `sensitive` — HRBP/admin only |
| Masking | `maskRelationsFields()` applied; description, resolutionNotes, findings masked |
| Audit | All grievance/disciplinary/investigation reads trigger `logSensitiveRead()` |
| Nav exposure | 2 of 4 items live (policies, grievances); 2 deferred (disciplinary, investigations) |

### 9.4 Security & Access

| Aspect | Value |
|---|---|
| Why sensitive | Controls who can see what — role assignments, audit trail, access policies |
| Permission gate | `hr.analytics.manage` — admin-only for all 5 items |
| Scope | `sensitive` — admin only |
| Masking | None (admin access assumed) |
| Audit | Role assignment mutations trigger `logHrAudit()` |
| Nav exposure | 3 of 5 items live (role-based-access as tab, audit-logs, access-controls); 2 deferred (data-privacy, security-policies) |

### 9.5 Compliance

| Aspect | Value |
|---|---|
| Why sensitive | Incident reports, risk assessments, compliance obligations — legal/regulatory data |
| Permission gate | `hr.compliance.read` (basic), `hr.risk.read` (risk items), `hr.incident.read` (incidents) |
| Scope | `all` for most items, `sensitive` for risk management and privacy controls |
| Masking | None currently; work permit reads trigger sensitive-read audit |
| Audit | Work permit reads trigger `logSensitiveRead()`; all writes trigger `logHrAudit()` |
| Nav exposure | 3 of 6 items live (incidents, compliance-mgmt, risk-management); 3 deferred |

### 9.6 Audit Logs (cross-cutting)

| Aspect | Value |
|---|---|
| Why sensitive | The audit trail itself is security-critical metadata |
| Permission gate | `hr.analytics.manage` — admin-only |
| Scope | `sensitive` |
| Masking | None |
| Audit | Audit log reads are not themselves audited (intentional — avoids recursion) |
| Nav exposure | Live at `/hr/security-access/audit-logs` |

---

## 10. Phase 8 — Carbon SideNav Rollout Readiness

### 10.1 Rollout Control

| Aspect | Value |
|---|---|
| Feature flag | `carbonSideNavRollout: true` in `hr.settings.get` |
| Config validation | `hrNavConfigValidator.ts` — structural + governance integrity checks |
| Backward compatibility | 28 route aliases documented, all original routes preserved |
| Test coverage | `hr-nav-validation.test.ts` — 66 assertions across 9 test groups |

### 10.2 Nav-to-Route Alignment (verified)

| Surface | Count | Status |
|---|---|---|
| Section landing routes | 13 | All mounted in App.tsx |
| Flat page routes | 29 | All mounted, 12 self-service + 16 role-gated + /hr home |
| Phase 4 deep routes | 6 | All mounted with role gating |
| Route aliases | 28 | Documented, redirect activation deferred |
| **Total mounted routes** | **48** | **Stable** |

### 10.3 Validation Utility

`client/src/config/hrNavConfigValidator.ts` performs:
- Section/item field completeness checks
- ID uniqueness enforcement
- Action string format validation (`hr.<domain>.<operation>`)
- Route coherence (live items have valid routes)
- Governance metadata integrity (masking ↔ fieldSet, scope ↔ scopeActions)
- Route alias target section validation

### 10.4 Automated Test Coverage

Two test files cover the Carbon SideNav rollout:

**`server/hr/__tests__/hr-nav-validation.test.ts`** (Phase 6-8):
- Structural integrity (13 sections, 68 items, field completeness)
- Route coherence (App.tsx mounting, route ordering)
- Backward compatibility (28 aliases, resolve helpers)
- Governance metadata (masking, audit, scope completeness)
- Role/visibility profiles (employee, manager, hrbp, admin)
- Scope resolution per role (self, team, all, none)
- Masking classification per role
- Rollout readiness (feature flags, version, router composition)
- Validation utility self-test

**`server/hr/__tests__/hr-phase8.test.ts`** (Phase 8 — final acceptance):
- Config-to-reality alignment (live items have page files on disk)
- Route compatibility (aliases valid, flat + section routes coexist)
- Section visibility coherence (every section has live children)
- Item visibility coherence (all actions in HR_ACTIONS, show-mode accessible)
- Deferred item consistency (35 items properly classified)
- Rollout mechanism state (feature flags, version, namespaces)
- Real surface verification (page files exist, no theater)
- Sensitive governance alignment (masking functions, hide-if-no-access)
- Validator clean result (no errors)
- Cross-phase permission coverage (admin/employee alignment)

### 10.5 Acceptance Status

See [CARBON_SIDENAV_ACCEPTANCE_SUMMARY.md](CARBON_SIDENAV_ACCEPTANCE_SUMMARY.md) for the full rollout acceptance decision.

---

## 11. Phase 9 — Operationalization & Long-Term Maintainability

### 11.1 Drift Detection

| Aspect | Value |
|---|---|
| Feature flag | `navDriftDetection: true`, `navObservability: true` in `hr.settings.get` |
| Digest function | `getNavConfigDigest()` — returns frozen count snapshot |
| Drift comparison | `detectConfigDrift(baseline)` — returns list of structural changes |
| Baseline check | `checkBaselineDrift(baseline)` — typed result for programmatic use |
| Coverage | Section count, item count, live/placeholder/not-started counts, alias count, masking count, audit count, section IDs |

### 11.2 Nav Health Dashboard

| Aspect | Value |
|---|---|
| Feature flag | `navHealthSummary: true` in `hr.settings.get` |
| Health summary | `getNavHealthSummary()` — aggregated health for admin settings page |
| Section completion | `getSectionCompletionStats()` — per-section live/planned/% complete |
| Admin visibility | HRSettingsPage shows validation status, completion progress, dead-end count |
| Deferred analysis | `getSectionDeferredAnalysis()` — identifies sections with high deferral rates |

### 11.3 Dead-End Handling

| Aspect | Value |
|---|---|
| Feature flag | `deferredItemTracking: true` in `hr.settings.get` |
| Detection | `getDeadEndItems()` — finds live items with broken/missing routes |
| UX improvement | Not-started items render with dashed border, context message |
| Placeholder badge | Live placeholder items show "Preview" badge |
| Progress indicator | Section landing pages show % complete per section |

### 11.4 Test Coverage (Phase 9 additions)

3 new test groups added to `hr-nav-validation.test.ts`:

| Group | Focus | Assertions |
|---|---|---|
| J | Drift detection | Digest determinism, baseline counts, drift comparison, section removal detection |
| K | Dead-end detection | Zero dead ends in current config, live routes valid, backedBy coherence |
| L | Section completion & health | 13 section stats, time-attendance 100%, health summary validity, feature flags |

---

## 12. Governance Orchestration Model

Per AGENTS.md, all substantial HR changes must follow:

**Planner → Builder → Reviewer → Tester → Governance**

This governance pack documents the Governance agent's verification surface.
