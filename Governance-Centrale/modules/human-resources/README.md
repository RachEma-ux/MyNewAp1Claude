# Human Resources Module — Governance Pack

## Overview

This directory contains the governance documentation for the **Human Resources (HR)** module of MyNewAp1Claude. The HR module is a first-class, workspace-aware, independently governed domain module providing workforce data management, organizational structure, staffing, lifecycle operations, compensation, compliance, and analytics.

## Module Identity

| Field | Value |
|---|---|
| Module key | `hr` |
| tRPC namespace | `hr.*` (14 sub-routers) |
| Frontend route prefix | `/hr/*` |
| Backend domain path | `server/hr/` |
| Database prefix | `hr_*` tables |
| Current version | 10.0.0 |
| Platform role | **Reference implementation** for module Carbon SideNav pattern |
| Governance model | AGENTS.md 5-agent orchestration |

## Current State

The HR module is in **production-ready** state with:

- **14 backend domain routers** (directory, organization, staffing, recruiting, lifecycle, time, learning, performance, compensation, relations, engagement, compliance, analytics, talent)
- **32 live frontend pages** out of 68 defined nav items (47%)
- **13 section landing pages** via Carbon-style SideNav architecture
- **5 HR roles** with permission matrix (employee, manager, hrbp, admin, workspace_admin)
- **~60+ HR action constants** controlling access
- **4 field masking functions** protecting sensitive data
- **Audit logging** on all mutations and sensitive reads
- **Self-approval prevention** on critical workflows
- **~250 automated test assertions** covering structure, routes, visibility, scope, masking, drift, observability
- **Rollout feature flags** (carbonSideNavRollout, navConfigValidation, backwardCompatAliases)
- **Phase 9 operationalization** — drift detection, nav health summary, observability, deferred UX improvements

## Carbon SideNav Architecture

The HR module uses an IBM Carbon-inspired SideNav with **13 purpose-driven sections** and **68 leaf items**. This nav model serves as a governance surface — every leaf item declares:

- Required permission action (`requiredAction`)
- Visibility mode (`visibilityMode`)
- Scope classification (`scopeType`)
- Masking requirements (`maskingRequired`, `maskingFieldSet`)
- Sensitive audit flag (`sensitiveReadAudit`)
- Scope resolution actions (`scopeActions`)

## Governance Pack Contents

| File | Purpose |
|---|---|
| [README.md](README.md) | This file — module overview and index |
| [MODULE_GOVERNANCE_PROFILE.md](MODULE_GOVERNANCE_PROFILE.md) | Governance identity card and policy classification |
| [MODULE_CONTROL_SURFACE.md](MODULE_CONTROL_SURFACE.md) | API, route, and nav inventory |
| [MODULE_AUDIT_MODEL.md](MODULE_AUDIT_MODEL.md) | Audit logging and compliance model |
| [MODULE_PERIODIC_CHECKS.md](MODULE_PERIODIC_CHECKS.md) | Recurring governance review checklist |
| [MODULE_RISKS.md](MODULE_RISKS.md) | Risk register |
| [MODULE_OPEN_GAPS.md](MODULE_OPEN_GAPS.md) | Honest gap list and deferred items |
| [MODULE_RUNTIME_REFERENCES.md](MODULE_RUNTIME_REFERENCES.md) | Source-of-truth file map |

## Phase 0 — Governance-First Definition

The complete Phase 0 governance package establishes the HR Carbon SideNav as a governed module surface. Every capability's permission, scope, masking, and audit expectations are explicitly defined and reviewable.

| File | Purpose |
|---|---|
| [CARBON_SIDENAV_PHASE0_GOVERNANCE_IMPACT_NOTE.md](CARBON_SIDENAV_PHASE0_GOVERNANCE_IMPACT_NOTE.md) | Why the SideNav is a governed change — impact and risk analysis |
| [CARBON_SIDENAV_CAPABILITY_INVENTORY.md](CARBON_SIDENAV_CAPABILITY_INVENTORY.md) | Full 13-section, 68-item inventory with governance metadata |
| [CARBON_SIDENAV_ROUTE_VISIBILITY_CLASSIFICATION.md](CARBON_SIDENAV_ROUTE_VISIBILITY_CLASSIFICATION.md) | Visibility model — section/item visibility, mixed sections, backward compat |
| [CARBON_SIDENAV_PERMISSION_MAP.md](CARBON_SIDENAV_PERMISSION_MAP.md) | Permission-to-navigation mapping — actions, roles, access promises |
| [CARBON_SIDENAV_SCOPE_MAP.md](CARBON_SIDENAV_SCOPE_MAP.md) | Data scope classification — self/team/all/sensitive/mixed per item |
| [CARBON_SIDENAV_SENSITIVITY_MAP.md](CARBON_SIDENAV_SENSITIVITY_MAP.md) | Masking and sensitivity — which items are masked, audited, governance-sensitive |
| [CARBON_SIDENAV_AUDIT_EXPECTATIONS.md](CARBON_SIDENAV_AUDIT_EXPECTATIONS.md) | Per-item audit expectations — read audit, write audit, SoD enforcement |
| [CARBON_SIDENAV_PHASE0_SUMMARY.md](CARBON_SIDENAV_PHASE0_SUMMARY.md) | Phase 0 completion summary — what was implicit, what is now explicit |

## Phase-Specific Documents

| File | Phase | Purpose |
|---|---|
| [hr-nav-architecture.md](hr-nav-architecture.md) | Phase 1-4 | Carbon SideNav nav model, scope, masking, auth helpers |
| [hr-phase2-section-landing-pages.md](hr-phase2-section-landing-pages.md) | Phase 2 | Section landing pages implementation record |
| [hr-phase4-backend-expansion.md](hr-phase4-backend-expansion.md) | Phase 4 | Backend expansion (6 new capabilities) |
| [hr-phase6-stabilization.md](hr-phase6-stabilization.md) | Phase 6/8 | Stabilization, testing, rollout readiness |
| [CARBON_SIDENAV_ACCEPTANCE_SUMMARY.md](CARBON_SIDENAV_ACCEPTANCE_SUMMARY.md) | Phase 8-9 | Final rollout acceptance status and gap summary |
| [hr-phase9-operationalization.md](hr-phase9-operationalization.md) | Phase 9 | Operationalization, observability, drift detection, maintainability |
| [CARBON_SIDENAV_REFERENCE_IMPLEMENTATION.md](CARBON_SIDENAV_REFERENCE_IMPLEMENTATION.md) | Phase 10 | HR as platform reference implementation for module nav pattern |

## Related Documentation

| Location | Purpose |
|---|---|
| `HR/HR_MODULE_IMPLEMENTATION_ROADMAP.md` | Full strategic roadmap |
| `HR/HR_MODULE_REPO_SCAFFOLD.md` | Repo-aligned implementation scaffold |
| `HR/HR_MODULE_PHASE1_PR_PLAN.md` | Phase 1 PR breakdown |
| `HR/HR_MODULE_AUDIT_REPORT.md` | Post-Phase 5 acceptance audit |
| `AGENTS.md` | Mandatory 5-agent orchestration model |
| `ARCHITECTURE.md` | Platform layer architecture |
| `Governance-Centrale/global/MODULE_NAV_STANDARD.md` | Platform module nav standard |
| `Governance-Centrale/global/MODULE_NAV_GOVERNANCE_RULES.md` | Governance rules for module nav changes |
| `Governance-Centrale/global/MODULE_NAV_ADOPTION_CHECKLIST.md` | Adoption checklist for new modules |
| `client/src/navigation/moduleNavTypes.ts` | Shared type contract for module navs |
| `client/src/navigation/moduleNavHelpers.ts` | Shared helper functions and generic validator |
