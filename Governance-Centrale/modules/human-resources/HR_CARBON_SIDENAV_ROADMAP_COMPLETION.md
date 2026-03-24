# HR Carbon SideNav — Roadmap Completion Summary

## Document Status

- **Type:** Roadmap completion verification
- **Date:** 2026-03-24
- **Scope:** Phases 0–14
- **Status:** All phases verified complete

---

## 1. Overview

The HR Carbon SideNav roadmap spanned 15 phases (0–14), evolving from a governance-first definition through implementation, platform standardization, enforcement, and contributor handoff. HR serves as the **reference implementation** for the shared module-nav standard adopted across the platform.

This document verifies each phase against its requirements and lists the evidence artifacts.

---

## 2. Phase-by-Phase Completion Status

### Phase 0 — Governance-First Definition

**Status:** Complete

| Artifact | Location | Verified |
|---|---|---|
| Governance impact note | `CARBON_SIDENAV_PHASE0_GOVERNANCE_IMPACT_NOTE.md` | Yes |
| Capability inventory | `CARBON_SIDENAV_CAPABILITY_INVENTORY.md` | Yes |
| Route visibility classification | `CARBON_SIDENAV_ROUTE_VISIBILITY_CLASSIFICATION.md` | Yes |
| Permission map | `CARBON_SIDENAV_PERMISSION_MAP.md` | Yes |
| Scope map | `CARBON_SIDENAV_SCOPE_MAP.md` | Yes |
| Sensitivity map | `CARBON_SIDENAV_SENSITIVITY_MAP.md` | Yes |
| Audit expectations | `CARBON_SIDENAV_AUDIT_EXPECTATIONS.md` | Yes |
| Phase 0 summary | `CARBON_SIDENAV_PHASE0_SUMMARY.md` | Yes |

### Phase 1 — Capability Mapping & Route Normalization

**Status:** Complete

| Deliverable | Evidence |
|---|---|
| Canonical nav config | `client/src/config/hrNavConfig.ts` — 13 sections, 68 items |
| All mandatory metadata fields | id, label, href, section, requiredAction, scopeType, visibilityMode, backedBy, backendDomain, implementationStatus |
| Route mapping | All live items have `currentRoute` or `href` resolving to mounted routes |
| Derived helpers | `getAllHrNavItems()`, `findNavItemByHref()`, `findSectionById()`, etc. |
| Backend domain constants | `HR_BACKEND_DOMAINS` (14 domains) |

### Phase 2 — Section Landing Pages

**Status:** Complete

| Deliverable | Evidence |
|---|---|
| Generic section landing page | `client/src/pages/hr/HRSectionLandingPage.tsx` |
| All 13 section landing routes | Mounted in `App.tsx` via `/hr/:sectionId` pattern |
| Phase doc | `hr-phase2-section-landing-pages.md` |

### Phase 3 — Role, Permission, & Scope Completion

**Status:** Complete

| Deliverable | Evidence |
|---|---|
| Masking metadata | `maskingRequired`, `maskingFieldSet` on applicable items |
| Sensitive-read audit flags | `sensitiveReadAudit`, `sensitiveAction` on 8+ items |
| Scope actions | `scopeActions` (global/team/self) on items with mixed scope |
| Phase tests | `server/hr/__tests__/hr-phase3.test.ts` |

**Known exception:** 6 mixed-scope items lack explicit `scopeActions` — tracked as EX-001 in the exception registry. Runtime scope resolution works via fallback.

### Phase 4 — Config-Driven Carbon SideNav Implementation

**Status:** Complete

| Deliverable | Evidence |
|---|---|
| Config-driven sidebar rendering | `MainLayout.tsx` uses nav config for HR section |
| Phase doc | `hr-phase4-backend-expansion.md` |
| Phase tests | `server/hr/__tests__/hr-phase4.test.ts` |
| 14 backend domain sub-routers | Composed in `server/hr/router.ts` |

### Phase 5 — Backend/Domain Expansion

**Status:** Complete

| Deliverable | Evidence |
|---|---|
| All 14 domain routers | directory, organization, staffing, recruiting, lifecycle, time, learning, performance, compensation, relations, engagement, compliance, analytics, talent |
| Role definitions domain | `server/hr/role-definitions/router.ts` |
| Phase tests | `server/hr/__tests__/hr-phase5.test.ts` |

No route sprawl — backend routers are broad domain-level, not mirroring nav leaves.

### Phase 6 — Security, Middleware, & Sensitive-Read Hardening

**Status:** Complete

| Deliverable | Evidence |
|---|---|
| Permission system | `server/hr/permissions.ts` — 5 roles, 50+ actions |
| Self/team scope enforcement | `enforceSelfScope()`, `enforceTeamScope()` helpers |
| Field masking | `applyDirectoryMasking()`, `applyCompensationMasking()`, etc. |
| Sensitive-read audit | `logSensitiveRead()` for audit trail |
| Phase tests | `server/hr/__tests__/hr-phase6.test.ts` |
| Stabilization doc | `hr-phase6-stabilization.md` |

### Phase 7 — Governance-Centrale Update

**Status:** Complete

| Required Doc | Exists |
|---|---|
| README.md | Yes |
| MODULE_GOVERNANCE_PROFILE.md | Yes |
| MODULE_CONTROL_SURFACE.md | Yes |
| MODULE_AUDIT_MODEL.md | Yes |
| MODULE_PERIODIC_CHECKS.md | Yes |
| MODULE_RISKS.md | Yes |
| MODULE_OPEN_GAPS.md | Yes |
| MODULE_RUNTIME_REFERENCES.md | Yes |

Plus 8 Phase 0 governance docs, architecture doc, 4 phase-specific docs, acceptance summary, and reference implementation doc.

### Phase 8 — Testing & Rollout

**Status:** Complete

| Deliverable | Evidence |
|---|---|
| Nav validation tests | `server/hr/__tests__/hr-nav-validation.test.ts` (66 tests) |
| Phase 8 tests | `server/hr/__tests__/hr-phase8.test.ts` |
| Acceptance summary | `CARBON_SIDENAV_ACCEPTANCE_SUMMARY.md` |
| Reference implementation doc | `CARBON_SIDENAV_REFERENCE_IMPLEMENTATION.md` |

### Phase 9 — Operationalization, Observability, Maintainability

**Status:** Complete

| Deliverable | Evidence |
|---|---|
| Backend domain constants | `HR_BACKEND_DOMAINS` in hrNavConfig.ts |
| Drift detection helpers | `findUnknownBackendDomains()`, `getImplementationBreakdown()` |
| Referenced domains helper | `getReferencedBackendDomains()` |
| Phase tests | `server/hr/__tests__/hr-phase9.test.ts` |
| Operationalization doc | `hr-phase9-operationalization.md` |

### Phase 10 — Platform Standardization, Template Extraction, Handoff

**Status:** Complete

| Deliverable | Evidence |
|---|---|
| Shared types contract | `client/src/navigation/moduleNavTypes.ts` (4 enums, 3 interfaces) |
| Shared helpers | `client/src/navigation/moduleNavHelpers.ts` (validation + utilities) |
| Platform standard doc | `Governance-Centrale/global/MODULE_NAV_STANDARD.md` |
| Governance rules | `Governance-Centrale/global/MODULE_NAV_GOVERNANCE_RULES.md` |
| Adoption checklist | `Governance-Centrale/global/MODULE_NAV_ADOPTION_CHECKLIST.md` |
| Nav config template | `Governance-Centrale/templates/module-nav/MODULE_NAV_CONFIG.template.ts` |
| 7 additional templates | governance review, deferred items, section landing checklist, adoption entry, exception entry, validation checklist, rollout plan |
| Phase tests | `server/hr/__tests__/hr-phase10.test.ts` |

### Phase 11 — Pilot Adoption (PM Central)

**Status:** Complete

| Deliverable | Evidence |
|---|---|
| PM Central nav config | `client/src/config/pmNavConfig.ts` — 8 sections, 12 items, all live |
| PM governance pack | `Governance-Centrale/modules/pm-central/` (6 docs) |
| Cross-module tests | `server/hr/__tests__/module-nav-cross-module.test.ts` |
| Registry entry | PM Central registered as "pilot" with complianceStatus "compliant" |

### Phase 12 — Wave 1 Expansion, Registry, & Governance Enforcement

**Status:** Complete

| Deliverable | Evidence |
|---|---|
| Automation nav config | `client/src/config/automationNavConfig.ts` — 3 sections, 7 items, all live |
| Automation governance pack | `Governance-Centrale/modules/automation/` (8 docs) |
| Code-facing registry | `client/src/navigation/moduleNavRegistry.ts` — 11 modules |
| Adoption registry doc | `Governance-Centrale/global/MODULE_NAV_ADOPTION_REGISTRY.md` |
| Wave plan | `Governance-Centrale/global/MODULE_NAV_WAVE_PLAN.md` |
| Cross-module tests | `server/hr/__tests__/hr-phase12-cross-module.test.ts` |

### Phase 13 — Enforcement, Exception Handling, & Compliance Automation

**Status:** Complete

| Deliverable | Evidence |
|---|---|
| Enforcement policy | `Governance-Centrale/global/MODULE_NAV_ENFORCEMENT_POLICY.md` |
| Exception registry | `Governance-Centrale/global/MODULE_NAV_EXCEPTION_REGISTRY.md` (8 active exceptions) |
| Compliance report | `Governance-Centrale/global/MODULE_NAV_COMPLIANCE_REPORT.md` |
| Machine validation | `server/__tests__/module-nav-compliance.test.ts` (25+ tests, 7+ groups) |
| Registry extended | `moduleNavRegistry.ts` with `complianceStatus`, `exceptionStatus`, `exceptionIds`, `validationPasses` |
| Compliance helpers | `countByComplianceStatus()`, `getModulesWithExceptions()` |

### Phase 14 — Contributor Workflow, Scaffolding, & Handoff

**Status:** Complete

| Deliverable | Evidence |
|---|---|
| Contributor workflow | `Governance-Centrale/global/MODULE_NAV_WORKFLOW.md` |
| Decision tree | `Governance-Centrale/global/MODULE_NAV_DECISION_TREE.md` |
| Handoff guide | `Governance-Centrale/global/MODULE_NAV_HANDOFF_GUIDE.md` |
| Common failures | `Governance-Centrale/global/MODULE_NAV_COMMON_FAILURES.md` |
| Operating checklist | `Governance-Centrale/global/MODULE_NAV_OPERATING_CHECKLIST.md` |
| Scaffolding script | `scripts/scaffold-module-nav.ts` |
| PR review checklist | `Governance-Centrale/templates/module-nav/MODULE_NAV_PR_REVIEW_CHECKLIST.md` |

---

## 3. Test Coverage Summary

| Test File | Location | Scope |
|---|---|---|
| hr-nav-validation.test.ts | `server/hr/__tests__/` | Nav config structural integrity (66 tests) |
| hr-phase3.test.ts | `server/hr/__tests__/` | Masking, scope, audit metadata |
| hr-phase4.test.ts | `server/hr/__tests__/` | Backend expansion |
| hr-phase5.test.ts | `server/hr/__tests__/` | Domain router coverage |
| hr-phase6.test.ts | `server/hr/__tests__/` | Security hardening |
| hr-phase8.test.ts | `server/hr/__tests__/` | Rollout readiness |
| hr-phase9.test.ts | `server/hr/__tests__/` | Operationalization |
| hr-phase10.test.ts | `server/hr/__tests__/` | Platform standardization |
| hr-phase12-cross-module.test.ts | `server/hr/__tests__/` | Cross-module validation |
| hr-module.test.ts | `server/hr/__tests__/` | Core HR module |
| hr-lifecycle.test.ts | `server/hr/__tests__/` | Lifecycle operations |
| hr-role-definitions.test.ts | `server/hr/__tests__/` | Role definitions domain |
| module-nav-cross-module.test.ts | `server/hr/__tests__/` | PM + HR cross-module |
| module-nav-compliance.test.ts | `server/__tests__/` | Platform compliance (25+ tests) |

---

## 4. Platform Adoption Status

| Module | Status | Compliance | Exception |
|---|---|---|---|
| Human Resources | Reference | Compliant | EX-001 |
| PM Central | Pilot | Compliant | None |
| Automation | Wave 1 | Partial | EX-002 |
| AI Types | Legacy | Exempt | EX-003 |
| Digital HQ | Legacy | Exempt | EX-004 |
| Governance Center | Legacy | Exempt | EX-005 |
| Infrastructure | Deferred | Exempt | EX-006 |
| WS Sandbox | Deferred | Exempt | EX-007 |
| Communication | Deferred | Exempt | EX-008 |
| Wiki | N/A | Exempt | — |
| Resources | N/A | Exempt | — |

Adoption rate: **3 of 11 modules (27%)**. Compliance: 2 compliant, 1 partial, 8 exempt, 0 non-compliant.

---

## 5. Architecture Compliance

| Rule | Status |
|---|---|
| No nav tree mirrored into backend routers | Verified — 14 broad domain routers |
| No route sprawl | Verified — section landing pages use `:sectionId` pattern |
| HR as reference implementation | Verified — registered as "reference" in registry |
| Canonical config as source of truth | Verified — hrNavConfig.ts is authoritative |
| Shared module-nav contract as platform standard | Verified — moduleNavTypes.ts + moduleNavHelpers.ts |
| AGENTS.md 5-agent model followed | Verified — all substantial phases used orchestrated agent passes |

---

## 6. Remaining Follow-Up Items (Post-Roadmap)

These are **future work**, not blockers to roadmap completion:

1. **EX-001:** Enrich 6 HR mixed-scope items with explicit `scopeActions`
2. **EX-002:** Add Automation frontend permission gating when auth model matures
3. **Wave 2 adoption:** Digital HQ, Governance Center, AI Types
4. **Compliance report refresh:** Update after each future phase

---

## 7. Conclusion

The HR Carbon SideNav roadmap (Phases 0–14) is **fully completed**. All implementation, governance, testing, standardization, enforcement, and handoff artifacts are in place. HR serves as the verified reference implementation for the platform module-nav standard.
