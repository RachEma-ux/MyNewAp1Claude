# Module Nav Adoption Registry

## Document Status

- **Type:** Platform-wide adoption status
- **Date:** 2026-03-24
- **Last updated:** Phase 13 (compliance + exception state added, file-existence verified)

---

## Adoption & Compliance Status Overview

| Module | Adoption | Compliance | Exception | Nav Config | Gov Pack | Validation | Next Action |
|---|---|---|---|---|---|---|---|
| Human Resources | **Reference** | Compliant | EX-001 | `hrNavConfig.ts` | Full | Pass | Maintain as reference |
| PM Central | **Pilot** | Compliant | None | `pmNavConfig.ts` | Full | Pass | Stable pilot |
| Automation | **Wave 1** | Partial | EX-002 | `automationNavConfig.ts` | Full | Pass | Add permission gating |
| AI Types | Legacy | Exempt | EX-003 | — | — | N/A | Wave 2 candidate |
| Digital HQ | Legacy | Exempt | EX-004 | — | — | N/A | Wave 2 candidate |
| Governance Center | Legacy | Exempt | EX-005 | — | — | N/A | Wave 2 candidate |
| Infrastructure | Deferred | Exempt | EX-006 | — | — | N/A | Re-evaluate when mature |
| WS Sandbox | Deferred | Exempt | EX-007 | — | — | N/A | Re-evaluate post-Wave 2 |
| Communication | Deferred | Exempt | EX-008 | — | — | N/A | Re-evaluate if grows |
| Wiki | N/A | Exempt | — | — | — | N/A | Not applicable |
| Resources | N/A | Exempt | — | — | — | N/A | Not applicable |

---

## Adoption Counts

| Status | Count |
|---|---|
| Reference | 1 |
| Pilot | 1 |
| Wave 1 | 1 |
| Legacy | 3 |
| Deferred | 3 |
| Not Applicable | 2 |
| **Total** | **11** |

## Compliance Counts

| Status | Count |
|---|---|
| Compliant | 2 |
| Partially Compliant | 1 |
| Exempt | 8 |
| Non-Compliant | 0 |

## Adoption Rate

**3 out of 11 modules** (27%) have adopted the shared module-nav standard.

Of the 8 non-adopted modules, 3 are legacy (good Wave 2 candidates), 3 are deferred (too small or immature), and 2 are not applicable (single-page modules).

---

## Code-Facing Registry

The canonical code-facing registry is at:

`client/src/navigation/moduleNavRegistry.ts`

This file can be imported by admin dashboards, validation tools, and governance checks to determine the platform-wide adoption and compliance state programmatically.

Phase 13 extended this registry with `complianceStatus`, `exceptionStatus`, `exceptionIds`, and `validationPasses` fields.

---

## Exception Registry

All exceptions are tracked in:

`Governance-Centrale/global/MODULE_NAV_EXCEPTION_REGISTRY.md`

See that document for full exception details, review dates, and compensating controls.

---

## Next Adoption Candidates (Wave 2)

| Candidate | Justification | Effort |
|---|---|---|
| Digital HQ | 8 clear items, good structure, governance-aligned | Low |
| Governance Center | 8 items, natural governance alignment, meta-consistency | Low |
| AI Types | Complex (5 sub-entity types with 3-level nav), high value | Medium-High |

---

## Compliance Enforcement

Compliance is enforced via:

1. **Policy:** `Governance-Centrale/global/MODULE_NAV_ENFORCEMENT_POLICY.md`
2. **Exceptions:** `Governance-Centrale/global/MODULE_NAV_EXCEPTION_REGISTRY.md`
3. **Machine validation:** `server/__tests__/module-nav-compliance.test.ts` (runs in `npm test`)
4. **Compliance report:** `Governance-Centrale/global/MODULE_NAV_COMPLIANCE_REPORT.md`
