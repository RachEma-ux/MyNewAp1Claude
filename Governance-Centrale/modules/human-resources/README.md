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
| Current version | 8.0.0 |
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
- **66 automated nav validation tests** covering structure, routes, visibility, scope, masking
- **Rollout feature flags** (carbonSideNavRollout, navConfigValidation, backwardCompatAliases)

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

## Phase-Specific Documents

| File | Phase | Purpose |
|---|---|
| [hr-nav-architecture.md](hr-nav-architecture.md) | Phase 1-4 | Carbon SideNav nav model, scope, masking, auth helpers |
| [hr-phase2-section-landing-pages.md](hr-phase2-section-landing-pages.md) | Phase 2 | Section landing pages implementation record |
| [hr-phase4-backend-expansion.md](hr-phase4-backend-expansion.md) | Phase 4 | Backend expansion (6 new capabilities) |
| [hr-phase6-stabilization.md](hr-phase6-stabilization.md) | Phase 6/8 | Stabilization, testing, rollout readiness |
| [CARBON_SIDENAV_ACCEPTANCE_SUMMARY.md](CARBON_SIDENAV_ACCEPTANCE_SUMMARY.md) | Phase 8 | Final rollout acceptance status and gap summary |

## Related Documentation

| Location | Purpose |
|---|---|
| `HR/HR_MODULE_IMPLEMENTATION_ROADMAP.md` | Full strategic roadmap |
| `HR/HR_MODULE_REPO_SCAFFOLD.md` | Repo-aligned implementation scaffold |
| `HR/HR_MODULE_PHASE1_PR_PLAN.md` | Phase 1 PR breakdown |
| `HR/HR_MODULE_AUDIT_REPORT.md` | Post-Phase 5 acceptance audit |
| `AGENTS.md` | Mandatory 5-agent orchestration model |
| `ARCHITECTURE.md` | Platform layer architecture |
