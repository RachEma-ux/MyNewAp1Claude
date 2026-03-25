# Workforce Assignment — Runtime References

## Current Status

**Runtime implementation is live.** Phase 4 implementation complete. All bridge components are operational.

## Bridge Components

| Component | Path | Status |
|---|---|---|
| DB Schema (requests) | `drizzle/tables/workforce-assignment.ts` | Implemented |
| DB Schema (assignments) | `drizzle/tables/workforce-assignment.ts` | Implemented |
| Lifecycle state machine | `server/workforce-assignment/lifecycle.ts` | Implemented |
| Enforcement guard | `server/workforce-assignment/enforcement.ts` | Implemented |
| Authority resolver | `server/workforce-assignment/authority.ts` | Implemented (transitional — OM dependent) |
| HR validation | `server/workforce-assignment/validation.ts` | Implemented |
| Audit logging | `server/workforce-assignment/audit.ts` | Implemented |
| tRPC Router | `server/workforce-assignment/router.ts` | Implemented |
| Tests | `server/workforce-assignment/__tests__/bridge.test.ts` | Implemented |
| Schema export | `drizzle/schema.ts` (re-exports workforce-assignment) | Registered |
| App router | `server/routers.ts` → `workforceAssignment` | Registered |

## API Namespace

All bridge procedures live under `workforceAssignment.*`:

```
workforceAssignment.requests.create       — Create draft request (PM)
workforceAssignment.requests.update       — Update draft request (PM)
workforceAssignment.requests.submit       — Submit request: draft → requested (PM)
workforceAssignment.requests.cancel       — Cancel request (PM)
workforceAssignment.requests.list         — List requests (filtered)
workforceAssignment.requests.get          — Get single request

workforceAssignment.hrValidation.startReview      — Start HR review: requested → under_hr_review (HR)
workforceAssignment.hrValidation.validateCandidate — Validate candidate eligibility (HR)
workforceAssignment.hrValidation.proposeCandidate  — Propose candidate: under_hr_review → candidate_proposed (HR)

workforceAssignment.approval.submitForApproval — Submit for approval: candidate_proposed → pending_approval
workforceAssignment.approval.approve           — Approve: pending_approval → approved
workforceAssignment.approval.reject            — Reject request

workforceAssignment.assignments.create    — Create governed assignment (requires approved request)
workforceAssignment.assignments.activate  — Activate: pending → active
workforceAssignment.assignments.release   — Release: active → released
workforceAssignment.assignments.complete  — Complete: active → completed
workforceAssignment.assignments.cancel    — Cancel: pending → cancelled
workforceAssignment.assignments.list      — List assignments (filtered)
```

## Related HR Files (Existing)

| File | Relevance |
|---|---|
| `drizzle/tables/hr-core.ts` | HR worker profiles — source of employee identity and status |
| `drizzle/tables/hr-staffing.ts` | HR worker skills — used for skill/level validation |
| `server/hr/audit.ts` | HR audit infrastructure — reused by bridge audit |
| `server/hr/permissions.ts` | HR permission model — role resolution |

## Related PM Central Files (Existing)

| File | Relevance |
|---|---|
| `server/modules/pmt/schema.ts` | PM Central projects — source of project demand |
| `server/modules/pmt/router.ts` | PM Central router — project CRUD |

## Governance Engine Hooks

| Hook | Purpose | Status |
|---|---|---|
| `governedProcedure` integration | All bridge mutations use `governedProcedure` | Implemented |
| `logBridgeAudit` | Cross-domain audit trail for all bridge actions | Implemented |
| Lifecycle enforcement | State machine validation on every transition | Implemented |
| Authority resolution | Transitional role-based authority (OM placeholder) | Implemented |
| Separation of duties | Requester cannot approve own request | Implemented |
| Allocation overflow | Detects over-allocation at assignment creation | Implemented |
