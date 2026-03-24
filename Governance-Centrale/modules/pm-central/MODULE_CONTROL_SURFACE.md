# PM Central Module — Control Surface

## Document Status

- **Type:** Control surface inventory
- **Module:** PM Central
- **Last updated:** 2026-03-24

---

## 1. Nav Config Control Points

The canonical nav config (`client/src/config/pmNavConfig.ts`) declares 8 sections and 12 leaf items. Each item specifies governance-relevant metadata:

| Section | Items | All Live | Required Action Prefix |
|---|---|---|---|
| Portfolio & Projects | 4 | Yes | `pm.portfolio.*` |
| Planning | 2 | Yes | `pm.planning.*` |
| Execution | 1 | Yes | `pm.execution.*` |
| Control & Risk | 2 | Yes | `pm.control.*` |
| Collaboration | 1 | Yes | `pm.collaboration.*` |
| Reports & Analytics | 1 | Yes | `pm.reporting.*` |
| Methodology | 1 | Yes | `pm.methodology.*` |
| AI & Agent Engine | 1 | Yes | `pm.ai.*` |

---

## 2. Route Control Points

| Route | Component | Permission |
|---|---|---|
| `/pm-central/dashboard` | DashboardPanel | `pm.portfolio.read` |
| `/pm-central/shell` | PMShellPanel | `pm.portfolio.write` |
| `/pm-central/inbox` | InboxPage | `pm.portfolio.read` |
| `/pm-central/plans` | PlansPanel | `pm.planning.read` |
| `/pm-central/idea-builder` | IdeaBuilderWizard | `pm.planning.write` |
| `/pm-central/execution` | ExecutionPanel | `pm.execution.read` |
| `/pm-central/risks` | RisksPanel | `pm.control.read` |
| `/pm-central/changes` | ChangesPanel | `pm.control.write` |
| `/pm-central/collaboration` | ParticipantsPanel | `pm.collaboration.read` |
| `/pm-central/reports` | ReportsPanel | `pm.reporting.read` |
| `/pm-central/methodes` | MethodesPage | `pm.methodology.read` |
| `/pm-central/agent-engine` | AgentEnginePanel | `pm.ai.read` |

---

## 3. Sidebar Integration

PM Central's sidebar in `MainLayout.tsx` is now **config-driven** — it renders sections directly from `PM_NAV_CONFIG.sections`, matching the HR integration pattern.

---

## 4. Project-Level Controls

At the project level (`/pm-central/p/:id/:tool`), additional controls exist:

| Surface | Governance Role |
|---|---|
| Gate Center | Project stage-gate approvals |
| Freeze & Holds | Change freeze enforcement |
| Scorecard | Compliance scoring |
| Policy | Project-level policy display |
| Approvals | Multi-step approval workflows |

These are managed within `ProjectPage.tsx` and its project-level sidebar, not in the top-level nav config.
