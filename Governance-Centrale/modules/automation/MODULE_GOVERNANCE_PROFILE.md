# Automation — Module Governance Profile

## Module Identity

| Field | Value |
|---|---|
| Module ID | `automation` |
| Display Name | Automation |
| Base Route | `/automation` |
| Nav Standard Adoption | Wave 1 (Phase 12) |
| Nav Config Path | `client/src/config/automationNavConfig.ts` |

## Classification

| Aspect | Classification |
|---|---|
| Data Sensitivity | Low (workflow definitions, execution logs) |
| PII Handling | None |
| Compliance Relevance | Low (no regulatory data) |
| Audit Requirements | Standard (execution audit only) |
| Permission Model | Workspace-role based |
| Masking Required | No |

## Permission Model

Action pattern: `automation.<domain>.<operation>`

| Action | Purpose |
|---|---|
| `automation.workflows.read` | View workflow list and details |
| `automation.workflows.write` | Create/edit workflows |
| `automation.components.read` | View triggers and actions store |
| `automation.config.read` | View automation settings |
| `automation.config.write` | Manage secrets and settings |

## Scope Model

| Scope Type | Usage |
|---|---|
| `all` | Most items — workflows, triggers, actions, settings |
| `sensitive` | Secrets management (API keys) |

No self/team/mixed scoping needed. All automation data is workspace-scoped.

## Nav Sections

| Section | Items | Completion |
|---|---|---|
| Workflows | 3 | 100% live |
| Components | 2 | 100% live |
| Configuration | 2 | 100% live |
| **Total** | **7** | **100% live** |

## Visibility Model

All items use `visibilityMode: "show"` — automation is visible to all authenticated workspace members. Permission gating will be added when the platform auth model matures.
