# Automation — Module Runtime References

## Key File Paths

| File | Purpose |
|---|---|
| `client/src/config/automationNavConfig.ts` | Canonical nav config (source of truth) |
| `client/src/config/automationNavConfigValidator.ts` | Config validation utilities |
| `client/src/navigation/moduleNavRegistry.ts` | Platform adoption registry entry |
| `client/src/navigation/moduleNavTypes.ts` | Shared type contract |
| `client/src/navigation/moduleNavHelpers.ts` | Shared validation helpers |
| `client/src/components/MainLayout.tsx` | Sidebar rendering (config-driven) |

## Route Registration

All routes registered in `client/src/App.tsx`:
- `/automation` — Workflow list
- `/automation/builder` — Workflow builder
- `/automation/executions` — Execution history
- `/automation/executions/:id` — Execution details
- `/automation/triggers` — Triggers store
- `/automation/actions` — Actions store
- `/automation/secrets` — Secrets management
- `/automation/settings` — Automation settings

## Backend References

| Server Path | Purpose |
|---|---|
| `server/automation/` | Workflow engine, execution |
| `server/routers/` | Triggers, actions, templates routers |
| `server/secrets/` | Secret management |

## Test References

| Test File | Purpose |
|---|---|
| `server/hr/__tests__/hr-phase12-cross-module.test.ts` | Cross-module validation |

## Governance Pack

Located at `Governance-Centrale/modules/automation/`
