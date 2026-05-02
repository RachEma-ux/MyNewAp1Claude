# Module Client Capsule — Baseline

Generated: 2026-05-02T17:03:55.863Z

Snapshot of the frontend modularity surface at the start of the migration. Each subsequent migration PR should drive these counts down.

## App.tsx hardcoded routes

Total `<Route>` declarations in App.tsx: **275**

Compatibility redirects in App.tsx: **25**

## Module manifest routes

| Module | manifest.routes | routeInventory | nav.ts hrefs | warnings |
|---|---|---|---|---|
| data-analysis | 0 | 14 | 14 | 0 |
| communication | 0 | 5 | 5 | 0 |
| pm-central | 0 | 10 | 9 | 0 |
| code-studio | 0 | 14 | 12 | 0 |
| ps | 0 | 9 | 6 | 0 |
| prm | 0 | 10 | 8 | 0 |
| psm | 10 | 0 | 0 | 4 |
| hr | 4 | 0 | 0 | 4 |
| organization-management | 2 | 0 | 0 | 4 |
| culture-values | 2 | 0 | 0 | 4 |
| ai-types | 2 | 0 | 0 | 4 |
| openrouter | 9 | 0 | 0 | 4 |
| agent-studio | 7 | 0 | 0 | 4 |
| sandbox-wf | 3 | 0 | 0 | 4 |
| kgra-agent | 1 | 0 | 0 | 4 |

## Duplicate paths

| Path | Sources |
|---|---|
| `/agent-studio` | App.tsx, manifest:agent-studio |
| `/agent-studio/:agentId` | App.tsx, manifest:agent-studio |
| `/agent-studio/catalog` | App.tsx, manifest:agent-studio |
| `/agent-studio/import` | App.tsx, manifest:agent-studio |
| `/agent-studio/marketplace` | App.tsx, manifest:agent-studio |
| `/agent-studio/new` | App.tsx, manifest:agent-studio |
| `/agent-studio/templates` | App.tsx, manifest:agent-studio |
| `/ai-types` | App.tsx, manifest:ai-types |
| `/ai-types/:rest*` | App.tsx, manifest:ai-types |
| `/automation/sandbox-wf` | App.tsx, manifest:sandbox-wf |
| `/automation/sandbox-wf/:id` | App.tsx, manifest:sandbox-wf |
| `/automation/sandbox-wf/new` | App.tsx, manifest:sandbox-wf |
| `/code-studio` | routeInventory:code-studio, routes.tsx:code-studio |
| `/code-studio/agents` | routeInventory:code-studio, routes.tsx:code-studio |
| `/code-studio/ai-catalog` | routeInventory:code-studio, routes.tsx:code-studio |
| `/code-studio/approvals` | routeInventory:code-studio, routes.tsx:code-studio |
| `/code-studio/control-panel` | routeInventory:code-studio, routes.tsx:code-studio |
| `/code-studio/dashboard` | routeInventory:code-studio, routes.tsx:code-studio |
| `/code-studio/how-to` | routeInventory:code-studio, routes.tsx:code-studio |
| `/code-studio/jobs` | routeInventory:code-studio, routes.tsx:code-studio |
| `/code-studio/jobs/:id` | routeInventory:code-studio, routes.tsx:code-studio |
| `/code-studio/opencode-settings` | routeInventory:code-studio, routes.tsx:code-studio |
| `/code-studio/policies` | routeInventory:code-studio, routes.tsx:code-studio |
| `/code-studio/repos` | routeInventory:code-studio, routes.tsx:code-studio |
| `/code-studio/sessions` | routeInventory:code-studio, routes.tsx:code-studio |
| `/code-studio/templates` | routeInventory:code-studio, routes.tsx:code-studio |
| `/communication` | routeInventory:communication, routes.tsx:communication |
| `/communication/chat` | routeInventory:communication, routes.tsx:communication |
| `/communication/conversations` | routeInventory:communication, routes.tsx:communication |
| `/communication/notifications` | routeInventory:communication, routes.tsx:communication |
| `/communication/video-meeting` | routeInventory:communication, routes.tsx:communication |
| `/cv` | App.tsx, manifest:culture-values |
| `/cv/:item` | App.tsx, manifest:culture-values |
| `/data-analysis` | routeInventory:data-analysis, routes.tsx:data-analysis |
| `/data-analysis/data-acquisition` | routeInventory:data-analysis, routes.tsx:data-analysis |
| `/data-analysis/data-acquisition/canonical-records` | routeInventory:data-analysis, routes.tsx:data-analysis |
| `/data-analysis/data-acquisition/classification` | routeInventory:data-analysis, routes.tsx:data-analysis |
| `/data-analysis/data-acquisition/document-intelligence` | routeInventory:data-analysis, routes.tsx:data-analysis |
| `/data-analysis/data-acquisition/items` | routeInventory:data-analysis, routes.tsx:data-analysis |
| `/data-analysis/data-acquisition/outputs` | routeInventory:data-analysis, routes.tsx:data-analysis |
| `/data-analysis/data-acquisition/processing` | routeInventory:data-analysis, routes.tsx:data-analysis |
| `/data-analysis/data-acquisition/routing` | routeInventory:data-analysis, routes.tsx:data-analysis |
| `/data-analysis/data-acquisition/runs` | routeInventory:data-analysis, routes.tsx:data-analysis |
| `/data-analysis/data-acquisition/settings` | routeInventory:data-analysis, routes.tsx:data-analysis |
| `/data-analysis/data-acquisition/sources` | routeInventory:data-analysis, routes.tsx:data-analysis |
| `/data-analysis/data-warehouse` | routeInventory:data-analysis, routes.tsx:data-analysis |
| `/data-analysis/graphrag` | routeInventory:data-analysis, routes.tsx:data-analysis |
| `/data-analysis/kgra-agent` | App.tsx, manifest:kgra-agent |
| `/hr` | App.tsx, manifest:hr |
| `/hr/directory` | App.tsx, manifest:hr |
| `/hr/organization` | App.tsx, manifest:hr |
| `/hr/reports` | App.tsx, manifest:hr |
| `/om` | App.tsx, manifest:organization-management |
| `/om/:item` | App.tsx, manifest:organization-management |
| `/openrouter` | App.tsx, manifest:openrouter |
| `/openrouter/activity` | App.tsx, manifest:openrouter |
| `/openrouter/connect` | App.tsx, manifest:openrouter |
| `/openrouter/guardrails` | App.tsx, manifest:openrouter |
| `/openrouter/health` | App.tsx, manifest:openrouter |
| `/openrouter/models` | App.tsx, manifest:openrouter |
| `/openrouter/playground` | App.tsx, manifest:openrouter |
| `/openrouter/routing` | App.tsx, manifest:openrouter |
| `/openrouter/usage` | App.tsx, manifest:openrouter |
| `/pm` | routeInventory:pm-central, routes.tsx:pm-central |
| `/pm/decisions` | routeInventory:pm-central, routes.tsx:pm-central |
| `/pm/handoffs` | routeInventory:pm-central, routes.tsx:pm-central |
| `/pm/issues` | routeInventory:pm-central, routes.tsx:pm-central |
| `/pm/milestones` | routeInventory:pm-central, routes.tsx:pm-central |
| `/pm/projects` | routeInventory:pm-central, routes.tsx:pm-central |
| `/pm/projects/:id` | routeInventory:pm-central, routes.tsx:pm-central |
| `/pm/risks` | routeInventory:pm-central, routes.tsx:pm-central |
| `/pm/settings` | routeInventory:pm-central, routes.tsx:pm-central |
| `/pm/tasks` | routeInventory:pm-central, routes.tsx:pm-central |
| `/prm` | routeInventory:prm, routes.tsx:prm |
| `/prm/ai-catalog` | routeInventory:prm, routes.tsx:prm |
| `/prm/cases` | routeInventory:prm, routes.tsx:prm |
| `/prm/cases/:id` | routeInventory:prm, routes.tsx:prm |
| `/prm/catalog` | routeInventory:prm, routes.tsx:prm |
| `/prm/control-panel` | routeInventory:prm, routes.tsx:prm |
| `/prm/dashboard` | routeInventory:prm, routes.tsx:prm |
| `/prm/methods` | routeInventory:prm, routes.tsx:prm |
| `/prm/new` | routeInventory:prm, routes.tsx:prm |
| `/prm/playbooks` | routeInventory:prm, routes.tsx:prm |
| `/ps` | routeInventory:ps, routes.tsx:ps |
| `/ps/ai-catalog` | routeInventory:ps, routes.tsx:ps |
| `/ps/catalog` | routeInventory:ps, routes.tsx:ps |
| `/ps/control-panel` | routeInventory:ps, routes.tsx:ps |
| `/ps/ideation` | routeInventory:ps, routes.tsx:ps |
| `/ps/ideation/:id` | routeInventory:ps, routes.tsx:ps |
| `/ps/ideation/:id/convert` | routeInventory:ps, routes.tsx:ps |
| `/ps/list` | routeInventory:ps, routes.tsx:ps |
| `/ps/wizard` | routeInventory:ps, routes.tsx:ps |
| `/psm` | App.tsx, manifest:psm |
| `/psm/admin` | App.tsx, manifest:psm |
| `/psm/analytics` | App.tsx, manifest:psm |
| `/psm/cases` | App.tsx, manifest:psm |
| `/psm/cases/:id` | App.tsx, manifest:psm |
| `/psm/dashboard` | App.tsx, manifest:psm |
| `/psm/library` | App.tsx, manifest:psm |
| `/psm/methods/:id` | App.tsx, manifest:psm |
| `/psm/runs/:id` | App.tsx, manifest:psm |
| `/psm/selector` | App.tsx, manifest:psm |

## Orphan / unknown routes

| Path | Source | Owner | Notes |
|---|---|---|---|
| `/` | unknown | — |  |
| `/404` | unknown | — |  |
| `/agent-dashboard` | unknown | — |  |
| `/agent-detail/:id` | unknown | — |  |
| `/agent-studio/:agentId/:section` | unknown | agentStudio |  |
| `/agent-studio/:agentId/runs/:runId` | unknown | agentStudio |  |
| `/agent-studio/:agentId/versions/compare` | unknown | agentStudio |  |
| `/agent-studio/catalog/:section` | unknown | agentStudio |  |
| `/agents` | unknown | — |  |
| `/agents/:agentId/chat` | unknown | — |  |
| `/agents/:id` | unknown | — |  |
| `/agents/control-panel` | unknown | — |  |
| `/agents/create` | unknown | — |  |
| `/agents/dashboard` | unknown | — |  |
| `/agents/list` | unknown | — |  |
| `/agents/templates` | unknown | — |  |
| `/agents/wizard` | unknown | — |  |
| `/analytics` | unknown | — |  |
| `/analytics/downloads` | unknown | — |  |
| `/auto-remediation` | unknown | — |  |
| `/automation` | unknown | — |  |
| `/automation/actions` | unknown | — |  |
| `/automation/airbyte` | unknown | — |  |
| `/automation/airflow` | unknown | — |  |
| `/automation/builder` | unknown | — |  |
| `/automation/executions` | unknown | — |  |
| `/automation/executions/:id` | unknown | — |  |
| `/automation/flowchart` | unknown | — |  |
| `/automation/secrets` | unknown | — |  |
| `/automation/settings` | unknown | — |  |
| `/automation/triggers` | unknown | — |  |
| `/bots` | unknown | — |  |
| `/bots/analytics` | unknown | — |  |
| `/bots/control-panel` | unknown | — |  |
| `/bots/dashboard` | unknown | — |  |
| `/bots/list` | unknown | — |  |
| `/bots/wizard` | unknown | — |  |
| `/catalog/agents/:catalogEntryId/chat` | unknown | — |  |
| `/code` | unknown | — |  |
| `/collaboration` | unknown | — |  |
| `/compliance-export` | unknown | — |  |
| `/components/ai-catalog` | unknown | — |  |
| `/components/double-shell` | unknown | — |  |
| `/components/home-template` | unknown | — |  |
| `/components/opencode-chat` | unknown | — |  |
| `/components/opencode-home` | unknown | — |  |
| `/components/simple-shell` | unknown | — |  |
| `/deploy` | unknown | — |  |
| `/deployment-status` | unknown | — |  |
| `/documents` | unknown | — |  |
| `/documents/dashboard` | unknown | — |  |
| `/documents/upload` | unknown | — |  |
| `/drift-detection` | unknown | — |  |
| `/embeddings` | unknown | — |  |
| `/error-analysis` | unknown | — |  |
| `/governance-center/:item` | unknown | — |  |
| `/hardware` | unknown | — |  |
| `/hr/analytics` | unknown | hr |  |
| `/hr/analytics-reporting` | unknown | hr |  |
| `/hr/benefits` | unknown | hr |  |
| `/hr/certifications` | unknown | hr |  |
| `/hr/compensation` | unknown | hr |  |
| `/hr/compensation-benefits` | unknown | hr |  |
| `/hr/compliance` | unknown | hr |  |
| `/hr/compliance-mgmt` | unknown | hr |  |
| `/hr/compliance/risk-management` | unknown | hr |  |
| `/hr/employee-records` | unknown | hr |  |
| `/hr/employee-records/letters-certificates` | unknown | hr |  |
| `/hr/employee-records/work-permits` | unknown | hr |  |
| `/hr/employee-relations` | unknown | hr |  |
| `/hr/engagement` | unknown | hr |  |
| `/hr/goals` | unknown | hr |  |
| `/hr/grievances` | unknown | hr |  |
| `/hr/incidents` | unknown | hr |  |
| `/hr/learning-development` | unknown | hr |  |
| `/hr/leave` | unknown | hr |  |
| `/hr/lifecycle` | unknown | hr |  |
| `/hr/offboarding` | unknown | hr |  |
| `/hr/onboarding` | unknown | hr |  |
| `/hr/overtime` | unknown | hr |  |
| `/hr/performance-talent` | unknown | hr |  |
| `/hr/policies` | unknown | hr |  |
| `/hr/positions` | unknown | hr |  |
| `/hr/recruitment` | unknown | hr |  |
| `/hr/reviews` | unknown | hr |  |
| `/hr/role-definitions` | unknown | hr |  |
| `/hr/role-definitions/:id` | unknown | hr |  |
| `/hr/role-definitions/:id/compare` | unknown | hr |  |
| `/hr/role-definitions/:id/edit` | unknown | hr |  |
| `/hr/role-definitions/new` | unknown | hr |  |
| `/hr/role-definitions/review` | unknown | hr |  |
| `/hr/security-access` | unknown | hr |  |
| `/hr/security-access/access-controls` | unknown | hr |  |
| `/hr/security-access/audit-logs` | unknown | hr |  |
| `/hr/settings` | unknown | hr |  |
| `/hr/shifts` | unknown | hr |  |
| `/hr/skills` | unknown | hr |  |
| `/hr/staffing` | unknown | hr |  |
| `/hr/surveys` | unknown | hr |  |
| `/hr/talent` | unknown | hr |  |
| `/hr/talent-acquisition` | unknown | hr |  |
| `/hr/time-attendance` | unknown | hr |  |
| `/hr/timesheet` | unknown | hr |  |
| `/hr/training` | unknown | hr |  |
| `/hr/wellbeing-engagement` | unknown | hr |  |
| `/hr/workforce-planning` | unknown | hr |  |
| `/hr/workforce-planning/job-architecture` | unknown | hr |  |
| `/inference` | unknown | — |  |
| `/infrastructure/hardware/:category` | unknown | — |  |
| `/infrastructure/software/:item` | unknown | — |  |
| `/kgia` | unknown | — |  |
| `/kgia/benchmarks` | unknown | — |  |
| `/kgia/governance` | unknown | — |  |
| `/kgia/oversight` | unknown | — |  |
| `/kgia/sources` | unknown | — |  |
| `/list/:type` | unknown | — |  |
| `/llm` | unknown | — |  |
| `/llm/:id` | unknown | — |  |
| `/llm/catalogue` | unknown | — |  |
| `/llm/catalogue/candidate` | unknown | — |  |
| `/llm/catalogue/manage` | unknown | — |  |
| `/llm/list` | unknown | — |  |
| `/llm/new-provider` | unknown | — |  |
| `/llm/promotions` | unknown | — |  |
| `/llm/provider-wizard` | unknown | — |  |
| `/llm/training` | unknown | — |  |
| `/llm/wizard` | unknown | — |  |
| `/models` | unknown | — |  |
| `/models/browse` | unknown | — |  |
| `/models/browser` | unknown | — |  |
| `/models/control-panel` | unknown | — |  |
| `/models/dashboard` | unknown | — |  |
| `/models/list` | unknown | — |  |
| `/models/wizard` | unknown | — |  |
| `/personal/:workspaceId` | unknown | — |  |
| `/personal/:workspaceId/*` | unknown | — |  |
| `/pm-central` | unknown | — |  |
| `/pm-central/:item` | unknown | — |  |
| `/pm-central/agent-engine` | unknown | — |  |
| `/pm-central/agent-engine/run/:id` | unknown | — |  |
| `/pm-central/changes` | unknown | — |  |
| `/pm-central/collaboration` | unknown | — |  |
| `/pm-central/dashboard` | unknown | — |  |
| `/pm-central/execution` | unknown | — |  |
| `/pm-central/idea-builder` | unknown | — |  |
| `/pm-central/inbox` | unknown | — |  |
| `/pm-central/methodes` | unknown | — |  |
| `/pm-central/methodes/:categoryId` | unknown | — |  |
| `/pm-central/methodes/detail/:methodId` | unknown | — |  |
| `/pm-central/p/:id` | unknown | — |  |
| `/pm-central/p/:id/:tool` | unknown | — |  |
| `/pm-central/p/:id/wizard` | unknown | — |  |
| `/pm-central/p/:id/wizard/:step` | unknown | — |  |
| `/pm-central/plans` | unknown | — |  |
| `/pm-central/project/:id` | unknown | — |  |
| `/pm-central/project/:id/:tool` | unknown | — |  |
| `/pm-central/projects` | unknown | — |  |
| `/pm-central/reports` | unknown | — |  |
| `/pm-central/risks` | unknown | — |  |
| `/pm-central/shell` | unknown | — |  |
| `/pm-central/shell/clone/:sourceId` | unknown | — |  |
| `/pm-central/shell/new` | unknown | — |  |
| `/pm-central/templates` | unknown | — |  |
| `/project/:workspaceId` | unknown | — |  |
| `/project/:workspaceId/*` | unknown | — |  |
| `/promotion-requests` | unknown | — |  |
| `/protocols` | unknown | — |  |
| `/providers` | unknown | — |  |
| `/providers-analytics` | unknown | — |  |
| `/providers/:id` | unknown | — |  |
| `/providers/connections` | unknown | — |  |
| `/providers/control-panel` | unknown | — |  |
| `/providers/dashboard` | unknown | — |  |
| `/providers/list` | unknown | — |  |
| `/providers/wizard` | unknown | — |  |
| `/psm/ai-catalog` | unknown | psm |  |
| `/research/:workspaceId` | unknown | — |  |
| `/research/:workspaceId/*` | unknown | — |  |
| `/resources` | unknown | — |  |
| `/run-console` | unknown | — |  |
| `/settings` | unknown | — |  |
| `/setup/ollama` | unknown | — |  |
| `/templates` | unknown | — |  |
| `/tools-management` | unknown | — |  |
| `/ui-showcase` | unknown | — |  |
| `/vectordb` | unknown | — |  |
| `/w/:workspaceId` | unknown | — |  |
| `/w/:workspaceId/*` | unknown | — |  |
| `/wcp/executions` | unknown | — |  |
| `/wcp/executions/:id` | unknown | — |  |
| `/wcp/workflows` | unknown | — |  |
| `/wcp/workflows/builder` | unknown | — |  |
| `/wiki` | unknown | — |  |
| `/wiki/:slug` | unknown | — |  |
| `/wiki/edit/:id` | unknown | — |  |
| `/work-console` | unknown | — |  |
| `/work-console/:id` | unknown | — |  |
| `/work-console/:id/:tab` | unknown | — |  |
| `/work-console/new` | unknown | — |  |

## Cross-module frontend API findings

_None._

## MainLayout imports under client/src/modules

_None — modules cleanly avoid mounting MainLayout._

## AWI client-route baseline

Tracked separately by `pnpm run check:awi` and the wiring inventory.

## Unmigrated RTLM capsule status

| Module | manifest | baseRoute | capsuleEntrypoint | layoutMode | routeInventory |
|---|---|---|---|---|---|
| data-analysis | ✅ | ✅ | ✅ | ✅ | ✅ |
| communication | ✅ | ✅ | ✅ | ✅ | ✅ |
| pm-central | ✅ | ✅ | ✅ | ✅ | ✅ |
| code-studio | ✅ | ✅ | ✅ | ✅ | ✅ |
| ps | ✅ | ✅ | ✅ | ✅ | ✅ |
| prm | ✅ | ✅ | ✅ | ✅ | ✅ |
| psm | ✅ | ⚪ | ⚪ | ⚪ | ⚪ |
| hr | ✅ | ⚪ | ⚪ | ⚪ | ⚪ |
| organization-management | ✅ | ⚪ | ⚪ | ⚪ | ⚪ |
| culture-values | ✅ | ⚪ | ⚪ | ⚪ | ⚪ |
| ai-types | ✅ | ⚪ | ⚪ | ⚪ | ⚪ |
| openrouter | ✅ | ⚪ | ⚪ | ⚪ | ⚪ |
| agent-studio | ✅ | ⚪ | ⚪ | ⚪ | ⚪ |
| sandbox-wf | ✅ | ⚪ | ⚪ | ⚪ | ⚪ |
| kgra-agent | ✅ | ⚪ | ⚪ | ⚪ | ⚪ |

---

_Baseline warnings are expected on unmigrated modules._
