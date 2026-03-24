# HR Carbon SideNav — Phase 0 Completion Summary

## Document Status

- **Type:** Phase completion summary
- **Phase:** 0 — Governance-first definition
- **Date:** 2026-03-24
- **Status:** **Complete**

---

## 1. What Phase 0 Is

Phase 0 is the **governance-first definition phase** of the HR Carbon SideNav. It establishes the formal governance contract for the SideNav as a governed module surface — defining every capability's permission gate, scope classification, masking policy, and audit expectation — before relying on later implementation phases.

Phase 0 is not about building UI or backend features. It is about making the governance analysis explicit, reviewable, and traceable.

---

## 2. Phase 0 Artifact Package

| # | Artifact | File | Status |
|---|---|---|---|
| 1 | Governance Impact Note | [CARBON_SIDENAV_PHASE0_GOVERNANCE_IMPACT_NOTE.md](CARBON_SIDENAV_PHASE0_GOVERNANCE_IMPACT_NOTE.md) | Complete |
| 2 | Capability Inventory | [CARBON_SIDENAV_CAPABILITY_INVENTORY.md](CARBON_SIDENAV_CAPABILITY_INVENTORY.md) | Complete |
| 3 | Route Visibility Classification | [CARBON_SIDENAV_ROUTE_VISIBILITY_CLASSIFICATION.md](CARBON_SIDENAV_ROUTE_VISIBILITY_CLASSIFICATION.md) | Complete |
| 4 | Permission Map | [CARBON_SIDENAV_PERMISSION_MAP.md](CARBON_SIDENAV_PERMISSION_MAP.md) | Complete |
| 5 | Scope Map | [CARBON_SIDENAV_SCOPE_MAP.md](CARBON_SIDENAV_SCOPE_MAP.md) | Complete |
| 6 | Sensitivity Map | [CARBON_SIDENAV_SENSITIVITY_MAP.md](CARBON_SIDENAV_SENSITIVITY_MAP.md) | Complete |
| 7 | Audit Expectations Map | [CARBON_SIDENAV_AUDIT_EXPECTATIONS.md](CARBON_SIDENAV_AUDIT_EXPECTATIONS.md) | Complete |
| 8 | Phase 0 Summary | This document | Complete |

---

## 3. Sources of Truth

| Surface | Source |
|---|---|
| Nav config (canonical, implementation-level) | `client/src/config/hrNavConfig.ts` |
| Permission model (roles, actions, matrix) | `server/hr/permissions.ts` |
| Audit functions | `server/hr/audit.ts` |
| Client-side auth helpers | `client/src/lib/hrNavAuth.ts` |
| Visibility resolution | `client/src/lib/hrNavAuth.ts` |
| Scope resolution (backend) | `server/hr/permissions.ts` → `resolveDataScope()` |
| Route registration | `client/src/App.tsx` |
| Structural validation | `client/src/navigation/moduleNavHelpers.ts` |

The Phase 0 governance artifacts document and analyze the data from these sources. They do not replace them. The canonical nav config (`hrNavConfig.ts`) remains the single source of truth for implementation.

---

## 4. What Was Previously Implicit

Before Phase 0 completion, the following governance information existed only in code or was distributed across multiple existing docs without a unified governance-first framing:

| Information | Where It Was | What Phase 0 Made Explicit |
|---|---|---|
| Full 68-item capability inventory with governance fields | `hrNavConfig.ts` (code) | Reviewable table in CAPABILITY_INVENTORY.md |
| Visibility model (section-level, item-level, mixed) | `hrNavAuth.ts` (code) + partial in MODULE_GOVERNANCE_PROFILE | Full model in ROUTE_VISIBILITY_CLASSIFICATION.md |
| Per-action permission mapping | `permissions.ts` (code) | Action-to-section table in PERMISSION_MAP.md |
| Scope classification per item | `hrNavConfig.ts` (code) | Scope map with resolution chain in SCOPE_MAP.md |
| Masking obligations per item | `hrNavConfig.ts` (code) + MODULE_GOVERNANCE_PROFILE §6 | Full masking inventory in SENSITIVITY_MAP.md |
| Audit expectations per item | `audit.ts` (code) + MODULE_AUDIT_MODEL | Per-section audit tables in AUDIT_EXPECTATIONS.md |
| Why this is a governed change | Not stated | Governance impact note with risk analysis |
| Governance obligations for deferred items | Not stated | Binding commitments in SENSITIVITY_MAP §4 |

---

## 5. What Was Already Explicitly Documented

These artifacts already existed and continue to serve as the authoritative governance pack:

| Artifact | Role | Phase 0 Relationship |
|---|---|---|
| MODULE_GOVERNANCE_PROFILE.md | Governance identity card | Phase 0 provides the detailed backing for §3-§9 |
| MODULE_CONTROL_SURFACE.md | API/route/nav inventory | Phase 0 CAPABILITY_INVENTORY provides the per-item detail |
| MODULE_AUDIT_MODEL.md | Audit model | Phase 0 AUDIT_EXPECTATIONS provides per-nav-item mapping |
| MODULE_RISKS.md | Risk register | Phase 0 GOVERNANCE_IMPACT_NOTE adds SideNav-specific risk analysis |
| MODULE_OPEN_GAPS.md | Gap tracking | Updated to reflect Phase 0 completion |
| MODULE_RUNTIME_REFERENCES.md | File map | Updated to include Phase 0 artifacts |

---

## 6. Remaining Non-Blocking Gaps

| Gap | Severity | Phase 0 Assessment |
|---|---|---|
| 6 mixed-scope items lack explicit `scopeActions` | Low | Runtime fallback works; tracked as EX-001 |
| Offer management not read-audited | Low | Not yet implemented; governance obligation noted |
| Succession plan reads not audited | Low | Not yet implemented; consider audit on implementation |
| Exit interview reads not audited | Low | Not yet implemented; sensitivity noted |
| No export audit category used | Medium | Category exists but no router uses it; architectural gap, not Phase 0 |

None of these gaps block Phase 0 completion. They are documented for tracking and will be addressed in their respective implementation phases.

---

## 7. Phase 0 Completion Criteria

| Criterion | Met? |
|---|---|
| Governance impact note exists | **Yes** |
| Capability inventory exists (all 13 sections, 68 items) | **Yes** |
| Route visibility classification exists | **Yes** |
| Permission map exists | **Yes** |
| Scope map exists | **Yes** |
| Sensitivity map exists | **Yes** |
| Audit expectations map exists | **Yes** |
| Phase 0 summary exists | **Yes** |
| All artifacts discoverable in Governance-Centrale indexes | **Yes** |
| Relationship to canonical nav config is explicit | **Yes** |
| Phase 0 no longer depends on implied implementation alone | **Yes** |
| Repo remains coherent and buildable | **Yes** (no code changes) |

**Phase 0 is now fully implemented.**

---

## 8. Governance Model

This phase followed AGENTS.md orchestration:

- **Planner:** Gap-assessed existing artifacts, identified 8 missing governance docs
- **Builder:** Created 8 Phase 0 artifacts, updated 9 existing files
- **Reviewer:** Verified all artifacts against canonical config and existing governance pack
- **Tester:** Confirmed no code/runtime changes introduced; all docs reference correct files
- **Governance:** Verified separation of concerns, no scope drift, governance-first integrity maintained
