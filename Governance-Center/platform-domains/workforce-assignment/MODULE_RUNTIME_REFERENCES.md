# Workforce Assignment — Runtime References

## Current Status

**No runtime implementation exists.** This governance pack is pre-runtime. All entries below are either future locations or references to related existing files.

## Future Bridge Location

| Component | Expected Path | Status |
|---|---|---|
| Bridge router | `server/workforce-assignment/router.ts` | Not created |
| Bridge queries | `server/workforce-assignment/queries.ts` | Not created |
| Bridge types | `shared/types/workforce-assignment.ts` | Not created |
| DB schema (requests) | `drizzle/tables/resource_requests.ts` | Not created |
| DB schema (assignments) | `drizzle/tables/resource_assignments.ts` | Not created |
| Approval gate | `server/workforce-assignment/approval-gate.ts` | Not created |
| Conflict resolver | `server/workforce-assignment/conflict-resolver.ts` | Not created |
| UI — request page | `client/src/pages/workforce/ResourceRequestPage.tsx` | Not created |
| UI — assignment page | `client/src/pages/workforce/AssignmentDashboard.tsx` | Not created |

## Related HR Files (Existing)

| File | Relevance |
|---|---|
| `server/hr/` | HR backend — source of employee data, availability, skills |
| `server/hr/permissions.ts` | HR permission model — validates HR authority |
| `Governance-Center/modules/human-resources/MODULE_GOVERNANCE_PROFILE.md` | HR ownership boundaries (patched with OM alignment) |

## Related PM Central Files (Existing)

| File | Relevance |
|---|---|
| `server/modules/pmt/` | PM Central backend — source of project demand |
| `server/modules/pmt/governance-schema.ts` | PMT governance schema |
| `Governance-Center/modules/pm-central/README.md` | PM Central ownership boundaries (patched with bridge requirement) |

## Governance Engine Hooks (Future)

| Hook | Purpose | Status |
|---|---|---|
| `governedProcedure` integration | All bridge mutations must use `governedProcedure` | Not implemented |
| Action registry entries | Bridge actions registered in `config/governance/platform_action_registry.yaml` | Not registered |
| Audit logging | `logBridgeAudit` function for cross-domain audit trail | Not implemented |
| Periodic check integration | Bridge checks integrated into governance dashboard | Not implemented |

## Expected Future Paths

When the bridge is implemented, it should follow the existing platform patterns:

1. **Router:** Registered in `server/routers.ts` as a sub-router of `appRouter`
2. **Governance:** All mutations use `governedProcedure` from `server/governance/`
3. **Audit:** Dedicated audit function following `logHrAudit` pattern
4. **UI:** Pages under `client/src/pages/workforce/`
5. **Schema:** Tables in `drizzle/tables/` following existing naming conventions
6. **Types:** Shared types in `shared/types/` for end-to-end type safety
