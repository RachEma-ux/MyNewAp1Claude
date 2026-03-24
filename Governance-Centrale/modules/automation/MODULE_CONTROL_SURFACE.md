# Automation — Module Control Surface

## Nav-as-Governance Surface

The Automation module uses the shared module-nav standard to declare its full control surface. The canonical nav config (`automationNavConfig.ts`) serves as the governance source of truth for:

- What capabilities the module exposes
- What permissions are required
- What implementation status each item has
- What backend domain serves each capability

## Control Points

| Control Point | Mechanism | Status |
|---|---|---|
| Route registration | All 7 routes mounted in App.tsx | Active |
| Sidebar rendering | Config-driven via AUTOMATION_NAV_CONFIG | Active |
| Permission gating | `requiredAction` declared per item | Declared (not enforced at runtime) |
| Structural validation | `automationNavConfigValidator.ts` | Active |
| Cross-module validation | Phase 12 test suite | Active |

## Route Surface

| Route | Component | Nav Item |
|---|---|---|
| `/automation` | Automation | workflow-list |
| `/automation/builder` | AutomationBuilder | workflow-builder |
| `/automation/executions` | AutomationExecutions | workflow-executions |
| `/automation/triggers` | TriggersStore | triggers-store |
| `/automation/actions` | ActionsStore | actions-store |
| `/automation/secrets` | SecretsPage | automation-secrets |
| `/automation/settings` | AutomationSettings | automation-settings |

## Backend Domains

| Domain | Purpose | Router |
|---|---|---|
| `workflows` | Workflow CRUD and execution | `server/automation/` |
| `components` | Triggers and actions store | `server/routers/` (triggers, actions) |
| `config` | Secrets and settings | `server/secrets/`, automation settings |

## Gaps

- Permission enforcement is declared but not enforced at runtime (platform auth model not yet mature)
- No WCP workflows included in nav config (separate route namespace `/wcp/`)
- No automation templates surface (exists as flat route `/automation/templates` but mapped to general templates page)
