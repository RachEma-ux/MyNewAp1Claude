# Workspaces — Governance Documentation

This directory contains governance documentation, compliance audits, and design specifications for the Workspace Wizard feature.

## Contents

| File | Description |
|------|-------------|
| `WS Wizard — Governance-First Design.md` | Original governance-first design specification |
| `workspace-definition.md` | Workspace entity definition and field reference |
| `ws-scoop.md` | Workspace scope and boundary documentation |
| `ws-governance-roadmap.md` | Governance feature roadmap |
| `ws-wizard-compliance-checklist.md` | Compliance checklist for wizard implementation |
| `prompt.md` | Prompt engineering reference for workspace agents |
| `workspace-sidebar-comparison.md` | Sidebar layout comparison and design notes |
| `audit2.md` | Fresh compliance audit report (2026-03-24) |
| `ImplimentationAudit Report.md` | Implementation audit report |

## Governance Model

The Workspace Wizard follows a **governance-first** model with three authority phases:

1. **Manager Phase** (Steps 1-7): Identity, Purpose, Anchor, Scope, Actors, Activities, Needs
2. **Admin Phase** (Step 8): Configuration — modules, routing, resources, capabilities, shell
3. **Governance Phase** (Steps 9-10): Readiness Review, Approval, Publication, Activation

### Lifecycle Statuses

```
draft → ready_for_review → under_review → approved → published → active
                                        ↘ rejected → draft (retry) / archived
                                                     archived → deleted
```

All governance transitions (review, approve, publish, activate, reject, archive, delete) require **admin role**. Returning from `archived → draft` also requires admin role. Content completeness is re-validated at every promotion transition.
