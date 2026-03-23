# HR Re-Audit Against Current State (v7.2.0)

**Date**: 2026-03-23
**Auditor**: Claude (Opus 4.6) — Combined Governance + Acceptance re-audit
**Repo**: `RachEma-ux/MyNewAp1Claude` @ commit `b281f38`
**Scope**: Full HR module — 14 sub-routers, schema, permissions, frontend, seed data
**Method**: Evidence-based verification against actual repo files (not trusting earlier summaries)

---

## 1. Executive Combined Verdict

| Dimension | Score | Verdict |
|---|---|---|
| **Governance-to-HR Compatibility** | **7.0 / 10** | COMPATIBLE WITH REQUIRED ADAPTATIONS |
| **HR Module Acceptance** | **7.5 / 10** | ACCEPT WITH GAPS |
| **Combined Recommendation** | — | **Ship for dev/internal use; remediate 3 HIGH items before production** |

---

## 2. Hardening Verification Summary

Six specific claims from Phase 7.1/7.2 were verified against actual code:

| # | Claim | File(s) | Verified? | Evidence |
|---|---|---|---|---|
| 1 | Missing `await` on `checkHrAccess` fixed | All 14 sub-routers | **YES** | Every call uses `await checkHrAccess(...)` or `await requireHrPermission(...)` |
| 2 | `requireHrPermission` on all write mutations | 14 routers | **YES** | All `governedProcedure` mutations call `await requireHrPermission(ctx.user, HR_ACTIONS.*)` before DB writes |
| 3 | Self-approval prevention | time, compensation, performance routers | **YES** | `preventSelfApproval(ctx.user, input.workerId)` in approve/reject mutations for leave, overtime, bonus, manager review |
| 4 | Time mutation governance | time/router.ts | **YES** | All 19 mutations use `governedProcedure`; all reads use `protectedProcedure` with `checkHrAccess` |
| 5 | Unified audit endpoint | analytics/router.ts:278-304 | **YES** | `listAuditLog` with filters (actorId, targetWorkerId, action, actionPrefix, dateFrom, dateTo), requires `ANALYTICS_MANAGE` |
| 6 | Version bump to 7.2.0 | hr/router.ts:46 | **YES** | `version: "7.2.0"` in settings |

---

## 3. PART A — Governance-to-HR Compatibility Audit

### 3.1 Governance Layer Integration

**Mechanism**: `governedProcedure` (server/_core/trpc.ts) chains: `requireUser` → `requireGovernance` → handler
**Governance middleware**: freeze check → action-key resolution → `requireGovernedAction()`

| Aspect | Status | Detail |
|---|---|---|
| All HR writes use `governedProcedure` | PASS | Every mutation across 14 routers confirmed |
| All HR reads use `protectedProcedure` | PASS | Auth required; HR-specific RBAC layered on top |
| Governance freeze respects HR | PASS | If workspace is frozen, all HR mutations block at middleware level |
| Action-key resolution | PARTIAL | Action keys are resolved by governance middleware, but HR defines its own `HR_ACTIONS` enum — these are parallel systems, not unified |

### 3.2 Auth Model Alignment

**Platform auth**: `publicProcedure` / `protectedProcedure` / `adminProcedure`
**HR auth**: `checkHrAccess()` / `requireHrPermission()` with 5-role RBAC (`employee`, `manager`, `hrbp`, `admin`, `workspace_admin`)

| Check | Result |
|---|---|
| HR procedures sit on top of platform auth | YES — `protectedProcedure` guarantees `ctx.user` exists before HR checks run |
| HR roles stored persistently | YES — `hrRoleAssignments` table with composite unique (userId, role), cached 60s |
| HR role checks are async-safe | YES — all `await`-ed after Phase 7.1 fixes |
| Platform `adminProcedure` and HR `workspace_admin` overlap | MINOR RISK — a platform admin might not have an HR role assignment; HR checks could block them. Mitigated by fallback: `getHrRoleForUser` returns `"employee"` if no assignment found |

### 3.3 Audit Trail Compatibility

| Aspect | Status |
|---|---|
| HR has its own audit table (`hrAuditLog`) | YES |
| Platform has `routing_audit_logs` | YES |
| They are separate | YES — no cross-reference |
| Unified query exists | YES — `analytics.listAuditLog` queries `hrAuditLog` |
| Platform audit is NOT queried by HR | CORRECT — intentional separation |

### 3.4 Compatibility Score Breakdown

| Dimension | Weight | Score | Weighted |
|---|---|---|---|
| Procedure-level integration | 25% | 9/10 | 2.25 |
| Auth model alignment | 20% | 7/10 | 1.40 |
| Audit trail compatibility | 15% | 7/10 | 1.05 |
| Freeze/governance respect | 15% | 9/10 | 1.35 |
| Action-key unification | 10% | 5/10 | 0.50 |
| Frontend governance awareness | 15% | 3/10 | 0.45 |
| **Total** | **100%** | — | **7.0/10** |

**Verdict**: COMPATIBLE WITH REQUIRED ADAPTATIONS

---

## 4. PART B — Final HR Acceptance Audit

### 4.1 Schema & Data Model

- **Tables**: 46 HR tables across 14 schema files in `drizzle/tables/`
- **Core tables** (`hr-core.ts`): `hrPeople`, `hrWorkerProfiles`, `hrEmploymentRecords`, `hrAuditLog`, `hrRoleAssignments`
- **FK references**: Properly defined with `references(() => table.column)`
- **Indexes**: Present on frequently queried columns (status, workerId, dates)
- **Composite unique constraint** on `hrRoleAssignments(userId, role)` — prevents duplicate assignments

**Score**: 9/10 — Schema is well-structured with proper constraints

### 4.2 Permission System

- **5 roles**: employee, manager, hrbp, admin, workspace_admin
- **~60 actions** in `HR_ACTIONS` enum covering all 14 domains
- **Role-permission matrix**: `HR_ROLE_PERMISSIONS` maps each role to allowed actions
- **Field masking**: Generic `maskFields()` with domain wrappers:
  - `maskDirectoryFields` — SSN, salary, bank details
  - `maskCompensationFields` — salary amounts, bonus details
  - `maskRelationsFields` — complaint details, investigation notes
  - `maskTalentFields` — **IMPORTED BUT NEVER CALLED** (see Finding #1)
- **Scope enforcement**: `resolveDataScope()` returns all/team/self/none
- **Self-approval prevention**: `preventSelfApproval()` blocks actor === target

**Score**: 8/10 — Comprehensive but talent masking gap

### 4.3 Sub-Router Coverage

All 14 sub-routers verified:

| Router | Reads Protected | Writes Governed | Permission Enforced | Masking Applied | Self-Approval |
|---|---|---|---|---|---|
| directory | YES | YES | YES | YES | N/A |
| organization | YES | YES | YES | N/A | N/A |
| staffing | YES | YES | YES | N/A | N/A |
| recruiting | YES | YES | YES | N/A | N/A |
| lifecycle | YES | YES | YES | N/A | N/A |
| time | YES | YES | YES | N/A | YES |
| learning | YES | YES | YES | N/A | N/A |
| performance | YES | YES | YES | N/A | YES |
| compensation | YES | YES | YES | YES | YES |
| relations | YES | YES | YES | YES | N/A |
| engagement | YES | YES | YES | N/A | N/A |
| compliance | YES | YES | YES | N/A | N/A |
| analytics | YES | YES | YES | N/A | N/A |
| talent | YES | YES | YES | **NO** (gap) | N/A |

### 4.4 Seed Data

- **28 employees** across 9 org units (Engineering, HR, Finance, Sales, Marketing, Operations, Legal, Product, Executive)
- **Manager hierarchies** properly defined
- **HR role assignments** seeded for all 28 employees
- **Related data**: skills, certifications, training, leave, compensation, benefits, performance cycles, grievances, incidents, talent reviews, succession plans, engagement surveys, risk items, compliance obligations
- **Realistic variety**: Mixed statuses, dates, amounts

**Score**: 9/10 — Comprehensive demo dataset

### 4.5 Frontend Integration

- **32 HR routes** in App.tsx (lines 225-256) using `ProtectedRoute` wrapper
- **HR landing page** (HRHomePage.tsx) with KPI tiles from `analytics.getDashboardSummary`
- **Navigation**: MainLayout shows 10 of 29 HR sections in sidebar
- **Role gating**: **NONE** — frontend routes use `ProtectedRoute` (auth-only), not HR role checks
- **tRPC hooks**: Properly typed via `AppRouter`

**Score**: 6/10 — Functional but no role-aware UI gating

### 4.6 Testing

- **Phase 6 test file**: `server/hr/__tests__/hr-phase6.test.ts` (585 lines)
- **Coverage**: Router structure, masked fields, seed data validation, role differentiation, version check, audit coverage
- **Gap**: Tests at lines 23-65 don't `await` async `checkHrAccess()` — assertions may pass vacuously
- **No integration tests** for actual DB queries or tRPC endpoint calls

**Score**: 6/10 — Unit tests exist but async gaps and no integration tests

### 4.7 Acceptance Score Breakdown

| Dimension | Weight | Score | Weighted |
|---|---|---|---|
| Schema & data model | 15% | 9/10 | 1.35 |
| Permission system | 20% | 8/10 | 1.60 |
| Sub-router coverage | 20% | 9/10 | 1.80 |
| Seed data | 10% | 9/10 | 0.90 |
| Frontend integration | 15% | 6/10 | 0.90 |
| Testing | 10% | 6/10 | 0.60 |
| Audit & compliance | 10% | 7/10 | 0.70 |
| **Total** | **100%** | — | **7.85 → 7.5/10** (rounded for masking gap severity) |

**Verdict**: ACCEPT WITH GAPS

---

## 5. Delta Since Earlier Audits

| # | Item | Previous State | Current State (v7.2.0) |
|---|---|---|---|
| 1 | Missing `await` on `checkHrAccess` | Present in multiple routers | **FIXED** — all awaited |
| 2 | `protectedProcedure` on HR writes | Some routers used it | **FIXED** — all writes use `governedProcedure` |
| 3 | No permission enforcement on mutations | Several routers lacked it | **FIXED** — `requireHrPermission` on all mutations |
| 4 | No self-approval prevention | Not implemented | **ADDED** — time, compensation, performance |
| 5 | No unified audit query | Audit log write-only | **ADDED** — `analytics.listAuditLog` |
| 6 | 5-employee seed dataset | Minimal demo data | **EXPANDED** — 28 employees, 9 org units |
| 7 | Version 6.0 | Phase 6 | **BUMPED** — 7.2.0 |
| 8 | Talent masking gap | Not identified | **STILL PRESENT** — `maskTalentFields` imported but unused |
| 9 | Frontend role gating | Not implemented | **STILL MISSING** — routes auth-only |
| 10 | Test async gaps | Not identified | **STILL PRESENT** — missing `await` in test assertions |
| 11 | Time read scope | Not scoped | **PARTIALLY** — employee can read all time entries (no self-scope filter) |

---

## 6. Current Top Remaining Risks

### HIGH Severity

| # | Risk | Location | Impact | Remediation |
|---|---|---|---|---|
| H1 | **Talent masking gap** | `server/hr/talent/router.ts` | Talent review scores, succession ratings, and career potential visible to unauthorized roles | Call `maskTalentFields(result, shouldMask)` in `listTalentReviews` and `getTalentReview` |
| H2 | **Employee self-scope on time reads** | `server/hr/time/router.ts` | Employee role can read ALL time entries/leave requests, not just their own | Apply `resolveDataScope()` filter on time/leave/overtime list queries |
| H3 | **Frontend has no role gating** | `client/src/App.tsx`, `MainLayout.tsx` | All 32 HR routes visible to any authenticated user; nav shows all sections | Implement `useHrRole()` hook and gate routes + nav items by `HR_ROLE_PERMISSIONS` |

### MEDIUM Severity

| # | Risk | Location | Impact |
|---|---|---|---|
| M1 | Test async gap | `hr-phase6.test.ts:23-65` | `checkHrAccess` assertions may pass vacuously without `await` |
| M2 | No integration tests | `server/hr/__tests__/` | Only structural/unit tests; no actual DB or tRPC endpoint testing |
| M3 | Parallel auth systems | `HR_ACTIONS` vs governance action-keys | Two action registries that don't reference each other; could diverge |

### LOW Severity

| # | Risk | Location | Impact |
|---|---|---|---|
| L1 | Nav shows 10/29 sections | `MainLayout.tsx:255-264` | 19 HR sections only reachable via direct URL |
| L2 | `logSensitiveRead` param mismatch | `talent/router.ts` getTalentReview | Audit log entry may have wrong field names |

---

## 7. Final Release Judgment

| Environment | Ready? | Conditions |
|---|---|---|
| **Development / Demo** | **YES** | Current state is functional with comprehensive data; gaps are non-blocking for dev use |
| **Internal / Staging** | **CONDITIONAL** | Fix H1 (talent masking) and H2 (time scope) first |
| **Production** | **NO** | Must fix all 3 HIGH items + M1 + M2 before production deployment |

---

## 8. Recommended Next Steps

### Must-Fix (Before Production)

1. **Fix talent masking** — Add `maskTalentFields(result, shouldMask)` calls in `talent/router.ts` list and get endpoints
2. **Add time read scoping** — Apply `resolveDataScope()` to time entry, leave request, and overtime list queries so employees only see their own records
3. **Implement frontend role gating** — Create `useHrRole()` hook consuming `hr.me.getRole`, gate routes and nav items

### Should-Fix (Before Staging)

4. **Fix test async gaps** — Add `await` to all `checkHrAccess` calls in test file
5. **Add integration tests** — At minimum: one tRPC call per sub-router with mocked DB
6. **Fix `logSensitiveRead` params** in talent router
7. **Unify action registries** — Map `HR_ACTIONS` to governance action-keys or document the intentional separation

### Nice-to-Have (Backlog)

8. Add remaining 19 HR nav sections to sidebar
9. Add HR role badge to user profile/header
10. Add bulk operations audit (e.g., mass status changes)
11. Add retention policies for audit log entries

---

*Report generated by Claude (Opus 4.6) on 2026-03-23 against commit b281f38.*
