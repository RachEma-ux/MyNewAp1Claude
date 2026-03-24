# Module Nav — Compliance Report

## Document Status

- **Type:** Platform-wide compliance snapshot
- **Date:** 2026-03-24
- **Phase:** 13 (final review)
- **Generated from:** `client/src/navigation/moduleNavRegistry.ts`
- **Machine-validated by:** `server/__tests__/module-nav-compliance.test.ts` (10 test groups)

---

## 1. Executive Summary

| Metric | Value |
|---|---|
| Total modules tracked | 11 |
| Adopted (standard in use) | 3 (27%) |
| Compliant | 2 |
| Partially compliant | 1 |
| Exempt (legacy/deferred/N-A) | 8 |
| Non-compliant | 0 |
| Active exceptions | 8 |
| Machine validation integrated | Yes (`npm test`) |

---

## 2. Compliance by Module

| Module | Adoption Status | Compliance | Exception | Validation | Nav Config | Gov Pack |
|---|---|---|---|---|---|---|
| Human Resources | Reference | **Compliant** | EX-001 | Pass | Yes | Full |
| PM Central | Pilot | **Compliant** | None | Pass | Yes | Full |
| Automation | Wave 1 | **Partial** | EX-002 | Pass | Yes | Full |
| AI Types | Legacy | Exempt | EX-003 | N/A | No | No |
| Digital HQ | Legacy | Exempt | EX-004 | N/A | No | No |
| Governance Center | Legacy | Exempt | EX-005 | N/A | No | No |
| Infrastructure | Deferred | Exempt | EX-006 | N/A | No | No |
| WS Sandbox | Deferred | Exempt | EX-007 | N/A | No | No |
| Communication | Deferred | Exempt | EX-008 | N/A | No | No |
| Wiki | N/A | Exempt | — | N/A | No | No |
| Resources | N/A | Exempt | — | N/A | No | No |

---

## 3. Compliant Modules Detail

### Human Resources (Reference Implementation)

- **Status:** Compliant with one active exception (EX-001: mixed-scope scopeActions gap)
- **Nav config:** `client/src/config/hrNavConfig.ts` — 13 sections, 68 items
- **Governance pack:** Full (README, profile, control surface, audit model, risks, gaps, references)
- **Structural validation:** Passes shared validator with zero errors
- **Route normalization:** Complete — 48 routes in App.tsx
- **Visibility alignment:** Complete — 5 HR roles with permission matrix
- **Exception:** 6 live mixed-scope items lack explicit `scopeActions` — runtime scope resolution works via fallback

### PM Central (Pilot)

- **Status:** Compliant with no exceptions
- **Nav config:** `client/src/config/pmNavConfig.ts` — 8 sections, 12 items (all live)
- **Governance pack:** Full (README, profile, control surface, risks, gaps, references)
- **Structural validation:** Passes shared validator with zero errors
- **Route normalization:** Complete
- **Visibility alignment:** Complete — simpler permission model (project-role based)

---

## 4. Partially Compliant Modules Detail

### Automation (Wave 1)

- **Status:** Partially compliant — visibility alignment gap (EX-002)
- **Nav config:** `client/src/config/automationNavConfig.ts` — 3 sections, 7 items (all live)
- **Governance pack:** Full
- **Structural validation:** Passes shared validator with zero errors
- **Gap:** All items use `visibilityMode: "show"` even for sensitive items. No frontend permission gating because auth model for automation is not mature.
- **Compensating control:** Backend tRPC procedures enforce access control
- **Next action:** Add frontend role-gating when workspace auth model matures

---

## 5. Exempt Modules Summary

### Legacy (Wave 2 candidates)

| Module | Items | Wave 2 Effort | Priority |
|---|---|---|---|
| Digital HQ | ~8 | Low | High |
| Governance Center | ~8 | Low | High |
| AI Types | ~15+ (complex) | Medium-High | Medium |

### Deferred

| Module | Reason |
|---|---|
| Infrastructure | Placeholder pages, no real domain logic |
| WS Sandbox | Small surface (5 items), lower priority |
| Communication | Only 3 items, too small for section nav |

### Not Applicable

| Module | Reason |
|---|---|
| Wiki | Single-page module with sub-routes |
| Resources | Single-page module |

---

## 6. Most Common Gaps

| Gap | Affected Modules | Severity |
|---|---|---|
| No frontend permission gating | Automation | Medium |
| Mixed-scope items without explicit scopeActions | HR | Low |
| Legacy modules not yet migrated | AI Types, Digital HQ, Governance Center | Low (planned for Wave 2) |

---

## 7. Next Adoption Priority

1. **Digital HQ** — 8 items, clear structure, low effort, high governance value
2. **Governance Center** — 8 items, natural governance alignment, meta-consistency benefit
3. **AI Types** — Complex (5 sub-entity types), high value but requires design work

---

## 8. Enforcement Status

| Mechanism | Status |
|---|---|
| Enforcement policy defined | Yes (`MODULE_NAV_ENFORCEMENT_POLICY.md` v1.1.0) |
| Exception registry active | Yes (`MODULE_NAV_EXCEPTION_REGISTRY.md`, 8 entries) |
| Machine validation integrated | Yes (`server/__tests__/module-nav-compliance.test.ts`, 10 groups) |
| File-existence verification | Yes (nav configs + governance packs verified on disk) |
| Exception cross-reference | Yes (all exception IDs validated against registry) |
| Runs in `npm test` | Yes (vitest) |
| Governance-first rule documented | Yes (in enforcement policy + governance rules) |
| Compliance report maintained | Yes (this document) |
