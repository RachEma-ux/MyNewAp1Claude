# PM Central Module — Runtime References

## Document Status

- **Type:** Runtime file and path reference
- **Module:** PM Central
- **Last updated:** 2026-03-24

---

## Key Files

| File | Purpose |
|---|---|
| `client/src/config/pmNavConfig.ts` | Canonical nav config (source of truth) |
| `client/src/config/pmNavConfigValidator.ts` | Nav config validation utility |
| `client/src/config/moduleNavTypes.ts` | Shared module-nav standard types |
| `client/src/pages/PMCentralPage.tsx` | Top-level PM Central page router |
| `client/src/pages/pm-central/ProjectPage.tsx` | Project-level layout with tool panels |
| `client/src/pages/pm-central/DashboardPanel.tsx` | Portfolio dashboard |
| `client/src/pages/pm-central/InboxPage.tsx` | PM Inbox |
| `client/src/pages/pm-central/MethodesPage.tsx` | Methodology library |
| `client/src/pages/pm-central/IdeaBuilderWizard.tsx` | AI idea builder |
| `client/src/pages/pm-central/AgentEnginePanel.tsx` | Agent engine |
| `client/src/components/MainLayout.tsx` | Sidebar (PM Central section is config-driven) |

---

## Route Mapping

| Nav Config Section | Section Route | Primary Component |
|---|---|---|
| Portfolio & Projects | `/pm-central/dashboard` | DashboardPanel |
| Planning | `/pm-central/plans` | PlansPanel |
| Execution | `/pm-central/execution` | ExecutionPanel |
| Control & Risk | `/pm-central/risks` | RisksPanel |
| Collaboration | `/pm-central/collaboration` | ParticipantsPanel |
| Reports & Analytics | `/pm-central/reports` | ReportsPanel |
| Methodology | `/pm-central/methodes` | MethodesPage |
| AI & Agent Engine | `/pm-central/agent-engine` | AgentEnginePanel |

---

## Test Coverage

| Test File | Scope |
|---|---|
| `server/hr/__tests__/module-nav-cross-module.test.ts` | Cross-module standard validation (HR + PM Central) |
