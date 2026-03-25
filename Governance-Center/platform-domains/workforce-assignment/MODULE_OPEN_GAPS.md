# Workforce Assignment — Open Gaps

## Overview

The governance pack is **fully defined and has runtime implementation** (Phase 4 complete). The bridge is now operational with schema, lifecycle enforcement, authority checks, HR validation, and audit logging. Remaining gaps are tracked below.

## Gap Register

| # | Gap | Severity | Dependency | Description |
|---|---|---|---|---|
| G1 | ~~No runtime implementation~~ | ~~Critical~~ **RESOLVED** | Builder phase | Runtime implemented: schema, lifecycle, enforcement, validation, authority, audit, API, tests |
| G2 | ~~No assignment engine~~ | ~~Critical~~ **RESOLVED** | G1 | `requireGovernedAssignmentFlow()` enforces full governed lifecycle |
| G3 | ~~No approval workflow~~ | ~~Critical~~ **RESOLVED** | G1, G2 | Approval gate with authority chain, separation of duties, and `governedProcedure` integration |
| G4 | No utilization loop | High | G1, G2 | No feedback mechanism tracks actual resource utilization against assignments |
| G5 | ~~HR/PM misalignment risk~~ | ~~High~~ **MITIGATED** | Governance | Runtime enforcement now blocks direct PM-to-employee assignment |
| G6 | OM dependency | Critical | Platform roadmap | Organization Management module does not exist — structural authority uses transitional role-based fallback |

## Gap Details

### G1 — Runtime Implementation — RESOLVED

- **Status:** Implemented (Phase 4).
- **What exists:**
  - Schema: `drizzle/tables/workforce-assignment.ts` — `resource_requests`, `resource_assignments`
  - Lifecycle: `server/workforce-assignment/lifecycle.ts` — state machines with transition validation
  - Enforcement: `server/workforce-assignment/enforcement.ts` — governed flow guard, self-approval prevention, allocation overflow
  - Validation: `server/workforce-assignment/validation.ts` — HR employee eligibility (exists, active, skill, level)
  - Authority: `server/workforce-assignment/authority.ts` — temporary OM placeholder (transitional)
  - Audit: `server/workforce-assignment/audit.ts` — bridge audit via HR audit infrastructure
  - API: `server/workforce-assignment/router.ts` — request, HR validation, approval, assignment endpoints
  - Tests: `server/workforce-assignment/__tests__/bridge.test.ts` — lifecycle, enforcement, authority, validation tests
- **Registered:** `workforceAssignmentRouter` in `server/routers.ts` under `appRouter`

### G2 — Assignment Engine — RESOLVED

- **Status:** Implemented.
- **What exists:** `requireGovernedAssignmentFlow()` in `enforcement.ts` checks: request exists, request approved, project match, no duplicate, no overlap.
- **Runtime path:** request create → submit → HR review → candidate propose → approval submit → approve → assignment create (all governed)

### G3 — Approval Workflow — RESOLVED

- **Status:** Implemented.
- **What exists:** `approval.approve` endpoint checks: lifecycle transition valid, separation of duties (`preventRequesterSelfApproval`), authority resolved (`resolveAssignmentAuthority`).
- **Integration:** All mutations use `governedProcedure` from platform governance engine.

### G4 — No Utilization Loop

- **Status:** Not started. Deferred to future phase.
- **What is needed:** A mechanism to compare active assignments against actual project activity and flag drift.
- **Constraint:** Requires integration with PM Central (activity data) and HR (availability data).
- **Current mitigation:** `checkAllocationOverflow()` detects allocation > 100% at assignment creation time.

### G5 — HR/PM Misalignment Risk — MITIGATED

- **Status:** Mitigated by governance patches AND runtime enforcement.
- **What was done:** HR governance limits ownership. PM Central governance forbids employee ownership. Runtime `requireGovernedAssignmentFlow()` blocks any assignment without approved request.
- **Remaining risk:** Low — enforcement is now runtime-real, not just documented.

### G6 — OM Dependency

- **Status:** Unresolved. OM module is on the platform roadmap but does not exist.
- **Impact:** Authority resolution uses transitional role-based fallback (admin/hrbp/workspace_admin).
- **Interim:** `resolveAssignmentAuthority()` is clearly marked `_transitional: true` with `_omDependency` note. Isolated in `authority.ts`.
- **Remediation:** OM module must be implemented. When it is, replace `authority.ts` with OM-derived organizational hierarchy resolution.
