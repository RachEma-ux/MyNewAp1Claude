# Human Resources — Module Governance Package

## Overview

The Human Resources module is the platform's most governance-mature module. It provides a full-stack HR management system with 15 backend sub-routers, 41 frontend page components, and a Carbon Design System-inspired 3-level SideNav as the primary navigation surface.

**Current runtime version:** 9.0.0 (Phase 9 — Operationalization)

## Governance Package Status

This folder (`Governance-Center/modules/human-resources/`) contains the **current module-side governance package** for Human Resources. It is the canonical governance review surface for the HR module.

| File | Purpose |
|---|---|
| [README.md](README.md) | This file — module front door |
| [MODULE_GOVERNANCE_PROFILE.md](MODULE_GOVERNANCE_PROFILE.md) | Governance maturity, controls, permission model |
| [MODULE_CONTROL_SURFACE.md](MODULE_CONTROL_SURFACE.md) | Control surface: sections, items, scope, masking, access |
| [MODULE_AUDIT_MODEL.md](MODULE_AUDIT_MODEL.md) | Audit model: what HR audits, how, and known limitations |
| [MODULE_PERIODIC_CHECKS.md](MODULE_PERIODIC_CHECKS.md) | Recurring governance review checklist |
| [MODULE_RISKS.md](MODULE_RISKS.md) | Governance, security, privacy, and operational risks |
| [MODULE_OPEN_GAPS.md](MODULE_OPEN_GAPS.md) | Honest list of what remains incomplete or deferred |
| [MODULE_RUNTIME_REFERENCES.md](MODULE_RUNTIME_REFERENCES.md) | Reviewer map to implementation files and historical docs |
| [CARBON_SIDENAV_REFERENCE_IMPLEMENTATION.md](CARBON_SIDENAV_REFERENCE_IMPLEMENTATION.md) | HR as the Carbon SideNav reference implementation |
| [CARBON_SIDENAV_ROLLOUT_STATUS.md](CARBON_SIDENAV_ROLLOUT_STATUS.md) | Current rollout state of the HR Carbon SideNav |
| [MODULE_PACKAGING_COMPLETION_STATUS.md](MODULE_PACKAGING_COMPLETION_STATUS.md) | Packaging task completion artifact |

## Runtime State Summary

| Dimension | Value |
|---|---|
| Backend version | 9.0.0 |
| Sub-routers | 15 domain routers + settings + me |
| HR roles | 5 (employee, manager, hrbp, admin, workspace_admin) |
| Permission actions | 70+ granular actions |
| Frontend pages | 41 components |
| Nav config sections | 13 |
| Nav config leaf items | 69 |
| Live leaf items | 33 |
| Placeholder items | 1 |
| Not-started items | 35 |
| Masking field sets | 8 (directory, compensation, relations, talent, performance, incident, work-permit, role-def) |
| Scope enforcement | self / team / all via `resolveDataScope` |
| Carbon SideNav | Live — 3-level accordion, role-filtered |

## Phase History

| Phase | Description |
|---|---|
| 1 | Directory, Organization, Staffing |
| 2 | Recruiting, Lifecycle (Onboarding/Offboarding) |
| 3 | Time & Attendance, Learning, Performance |
| 4 | Compensation, Relations, Engagement, Compliance, Analytics, Talent |
| 5 | Cross-phase integration, hardened analytics, reminders |
| 6 | Permission enforcement, role-aware masking, audit coverage |
| 7 | Data expansion — 28-employee seed dataset |
| 7.3 | Read governance — talent masking, self-service scope, frontend gating |
| 8 | Carbon SideNav stabilization, nav validation, backward compat, Role Definitions |
| 9 | Operationalization — drift detection, nav health, observability |

## Related Context

### Historical Planning & Audit Archive

The `HR/` folder at the repo root contains historical planning, audit, and roadmap documents:

| File | Purpose |
|---|---|
| `HR/HR_MODULE_IMPLEMENTATION_ROADMAP.md` | Original implementation roadmap |
| `HR/HR_MODULE_REPO_SCAFFOLD.md` | Initial scaffold plan |
| `HR/HR_MODULE_PHASE1_PR_PLAN.md` | Phase 1 PR plan |
| `HR/HR_PHASE5_IMPLEMENTATION_NOTES.md` | Phase 5 implementation notes |
| `HR/HR_ROLE_DEFINITION_FRAMEWORK.md` | Role definition design framework |
| `HR/HR_MODULE_AUDIT_REPORT.md` | Module audit report |
| `HR/HR_GOVERNANCE_COMPLIANCE_AUDIT.md` | Governance compliance audit |
| `HR/HR_GOVERNANCE_COMPLIANCE_REAUDIT_FINAL.md` | Final re-audit |
| `HR/HR_V72_REAUDIT.md` | Phase 7.2 re-audit |
| `HR/HR_FINAL_ACCEPTANCE_AUDIT.md` | Final acceptance audit |
| `HR/GOVERNANCE_HR_COMPATIBILITY_ASSESSMENT.md` | Governance compatibility assessment |
| `HR/HR_DEEP_COMPATIBILITY_ANALYSIS.md` | Deep compatibility analysis |

These files are **historical context** — the governance package in this folder is the current review surface.

### Global Governance Doctrine

The HR module operates within the platform's global governance framework:

| Doctrine | Relevance to HR |
|---|---|
| [GOVERNANCE_MODEL.md](../../global/GOVERNANCE_MODEL.md) | HR uses `governedProcedure` enforcement layer |
| [SECURITY_MODEL.md](../../global/SECURITY_MODEL.md) | HR implements RBAC, field masking, audit logging |
| [AUDIT_MODEL.md](../../global/AUDIT_MODEL.md) | HR has its own audit trail via `logHrAudit` |
| [OPERATIONAL_COMPLIANCE_MODEL.md](../../global/OPERATIONAL_COMPLIANCE_MODEL.md) | HR follows review cadence for periodic checks |
| [CONTROL_MATRIX.md](../../global/CONTROL_MATRIX.md) | HR controls mapped in platform matrix |
| [GOVERNANCE_COVERAGE_MATRIX.md](../../global/GOVERNANCE_COVERAGE_MATRIX.md) | HR has full mutation/read coverage |
