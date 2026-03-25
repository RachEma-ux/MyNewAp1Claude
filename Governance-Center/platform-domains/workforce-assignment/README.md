# Workforce Assignment — Cross-Domain Governance Pack

## Overview

This is a **cross-domain governance pack** that defines the staffing bridge between Project Services (PS), Human Resources (HR), and Organization Management (OM).

It is **not owned by a single module**. It operates as a **central integration layer** that enforces governed resource allocation across module boundaries.

## Purpose

- Define the `resource_request` and `resource_assignment` governance objects
- Establish cross-domain authority rules for staffing decisions
- Prevent any single module (PM, HR, or OM) from unilaterally owning employees or assignments
- Provide governance controls before any runtime implementation is built

## Integration Map

```
┌──────────────┐     resource_request     ┌──────────────┐
│  PM Central  │ ──────────────────────→  │   Workforce   │
│  (PS demand) │                          │  Assignment   │
└──────────────┘                          │   Bridge      │
                                          │               │
┌──────────────┐     HR validation        │               │
│     HR       │ ←───────────────────────→│               │
│  (workforce) │                          │               │
└──────────────┘                          │               │
                                          │               │
┌──────────────┐     org structure        │               │
│     OM       │ ←───────────────────────→│               │
│  (structure) │                          └──────────────┘
└──────────────┘
```

## Key Governance Objects

| Object | Owner | Description |
|---|---|---|
| `resource_request` | PS (PM Central) | Demand signal — project needs a resource with specific skills/role |
| `resource_assignment` | Cross-domain (bridge-governed) | Governed record linking an employee to a project role |

## Authority Model

| Actor | Authority |
|---|---|
| PS (PM Central) | Creates demand (`resource_request`), defines role requirements |
| HR | Validates employee availability, skills, contractual eligibility |
| OM (future) | Provides organizational structure, position authority, reporting lines |
| Approval Gate | Final assignment authority — no single module can bypass |

## Pack Contents

| File | Purpose |
|---|---|
| [MODULE_GOVERNANCE_PROFILE.md](MODULE_GOVERNANCE_PROFILE.md) | Bridge governance model and authority |
| [MODULE_CONTROL_SURFACE.md](MODULE_CONTROL_SURFACE.md) | Governed actions and performers |
| [MODULE_AUDIT_MODEL.md](MODULE_AUDIT_MODEL.md) | Audit requirements and evidence chain |
| [MODULE_PERIODIC_CHECKS.md](MODULE_PERIODIC_CHECKS.md) | Recurring validation checks |
| [MODULE_RISKS.md](MODULE_RISKS.md) | Risk register |
| [MODULE_OPEN_GAPS.md](MODULE_OPEN_GAPS.md) | Known gaps and dependencies |
| [MODULE_RUNTIME_REFERENCES.md](MODULE_RUNTIME_REFERENCES.md) | Future runtime locations and related files |

## Status

**Governance-defined, pre-runtime.** No runtime implementation exists. This pack defines the governance architecture that must be enforced when implementation begins.
