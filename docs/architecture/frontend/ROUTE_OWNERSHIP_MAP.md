# Route Ownership Map

Generated: 2026-05-02T18:42:54.079Z

Authoritative view of every URL the app exposes and which surface
owns it. Regenerate with `tsx scripts/generate-route-ownership-map.ts`.

## Summary

| Status | Count |
|---|---|
| ✅ canonical | 158 |
| ↪️ compatibility-redirect | 22 |
| 🚫 deprecated | 0 |
| 🏛 platform-core | 14 |
| ⚠️ orphan | 0 |
| ❓ unknown | 148 |
| **Total** | **342** |

## Per-RTLM

| RTLM | Migration | Declared paths | Manifest baseRoute |
|---|---|---|---|
| dataAnalysis | ✅ migrated | 28 | `/data-analysis` |
| communication | ✅ migrated | 10 | `/communication` |
| pmCentral | ✅ migrated | 19 | `/pm` |
| codeStudio | ✅ migrated | 26 | `/code-studio` |
| ps | ✅ migrated | 15 | `/ps` |
| prm | ✅ migrated | 18 | `/prm` |
| psm | ✅ migrated | 18 | `/psm` |
| hr | ✅ migrated | 55 | `/hr` |
| organizationManagement | ✅ migrated | 13 | `/om` |
| cultureValues | ⏳ pending | 2 | `—` |
| aiTypes | ⏳ pending | 2 | `—` |
| openRouter | ⏳ pending | 9 | `—` |
| agentStudio | ⏳ pending | 7 | `—` |
| sandboxWf | ⏳ pending | 3 | `—` |
| kgraAgent | ⏳ pending | 1 | `—` |

## Routes

| Route | Owner | Source | Target | Status | Notes |
|---|---|---|---|---|---|
| `/` | — | unknown | — | ❓ unknown |  |
| `/404` | — | unknown | — | ❓ unknown |  |
| `/agent-dashboard` | — | unknown | — | ❓ unknown |  |
| `/agent-detail/:id` | — | unknown | — | ❓ unknown |  |
| `/agent-studio` | agentStudio | module-manifest | `AgentStudioShellPage` | ✅ canonical |  |
| `/agent-studio/:agentId` | agentStudio | module-manifest | `AgentStudioShellPage` | ✅ canonical |  |
| `/agent-studio/:agentId/:section` | agentStudio | unknown | — | ❓ unknown |  |
| `/agent-studio/:agentId/runs/:runId` | agentStudio | unknown | — | ❓ unknown |  |
| `/agent-studio/:agentId/versions/compare` | agentStudio | unknown | — | ❓ unknown |  |
| `/agent-studio/catalog` | agentStudio | module-manifest | `AgentStudioShellPage` | ✅ canonical |  |
| `/agent-studio/catalog/:section` | agentStudio | unknown | — | ❓ unknown |  |
| `/agent-studio/import` | agentStudio | module-manifest | `AgentStudioShellPage` | ✅ canonical |  |
| `/agent-studio/marketplace` | agentStudio | module-manifest | `AgentStudioShellPage` | ✅ canonical |  |
| `/agent-studio/new` | agentStudio | module-manifest | `AgentStudioShellPage` | ✅ canonical |  |
| `/agent-studio/templates` | agentStudio | module-manifest | `AgentStudioShellPage` | ✅ canonical |  |
| `/agents` | — | unknown | — | ❓ unknown |  |
| `/agents/:agentId/chat` | — | unknown | — | ❓ unknown |  |
| `/agents/:id` | — | unknown | — | ❓ unknown |  |
| `/agents/control-panel` | — | unknown | — | ❓ unknown |  |
| `/agents/create` | — | unknown | — | ❓ unknown |  |
| `/agents/dashboard` | — | unknown | — | ❓ unknown |  |
| `/agents/list` | — | unknown | — | ❓ unknown |  |
| `/agents/templates` | — | unknown | — | ❓ unknown |  |
| `/agents/wizard` | — | unknown | — | ❓ unknown |  |
| `/ai-types` | aiTypes | module-manifest | `AITypesShell` | ✅ canonical |  |
| `/ai-types/:rest*` | aiTypes | module-manifest | `AITypesShell` | ✅ canonical |  |
| `/analytics` | — | unknown | — | ❓ unknown |  |
| `/analytics/downloads` | — | unknown | — | ❓ unknown |  |
| `/auto-remediation` | — | unknown | — | ❓ unknown |  |
| `/automation` | — | unknown | — | ❓ unknown |  |
| `/automation/actions` | — | unknown | — | ❓ unknown |  |
| `/automation/airbyte` | — | unknown | — | ❓ unknown |  |
| `/automation/airflow` | — | unknown | — | ❓ unknown |  |
| `/automation/builder` | — | unknown | — | ❓ unknown |  |
| `/automation/executions` | — | unknown | — | ❓ unknown |  |
| `/automation/executions/:id` | — | unknown | — | ❓ unknown |  |
| `/automation/flowchart` | — | unknown | — | ❓ unknown |  |
| `/automation/sandbox-wf` | sandboxWf | module-manifest | `SandboxWFPage` | ✅ canonical |  |
| `/automation/sandbox-wf/:id` | sandboxWf | module-manifest | `WFCreationShell` | ✅ canonical |  |
| `/automation/sandbox-wf/new` | sandboxWf | module-manifest | `WFCreationShell` | ✅ canonical |  |
| `/automation/secrets` | — | unknown | — | ❓ unknown |  |
| `/automation/settings` | — | unknown | — | ❓ unknown |  |
| `/automation/triggers` | — | unknown | — | ❓ unknown |  |
| `/bots` | — | unknown | — | ❓ unknown |  |
| `/bots/analytics` | — | unknown | — | ❓ unknown |  |
| `/bots/control-panel` | — | unknown | — | ❓ unknown |  |
| `/bots/dashboard` | — | unknown | — | ❓ unknown |  |
| `/bots/list` | — | unknown | — | ❓ unknown |  |
| `/bots/wizard` | — | unknown | — | ❓ unknown |  |
| `/catalog/agents/:catalogEntryId/chat` | — | unknown | — | ❓ unknown |  |
| `/chat` | — | app-compatibility-redirect | `/communication/chat` | ↪️ compatibility-redirect | redirects to /communication/chat |
| `/code` | — | unknown | — | ❓ unknown |  |
| `/code-studio` | codeStudio | module-manifest | `module:codeStudio` | ✅ canonical |  |
| `/code-studio/agents` | codeStudio | module-manifest | `module:codeStudio` | ✅ canonical |  |
| `/code-studio/ai-catalog` | codeStudio | module-manifest | `module:codeStudio` | ✅ canonical |  |
| `/code-studio/approvals` | codeStudio | module-manifest | `module:codeStudio` | ✅ canonical |  |
| `/code-studio/control-panel` | codeStudio | module-manifest | `module:codeStudio` | ✅ canonical |  |
| `/code-studio/dashboard` | codeStudio | module-manifest | `module:codeStudio` | ✅ canonical |  |
| `/code-studio/how-to` | codeStudio | module-manifest | `module:codeStudio` | ✅ canonical |  |
| `/code-studio/jobs` | codeStudio | module-manifest | `module:codeStudio` | ✅ canonical |  |
| `/code-studio/jobs/:id` | codeStudio | module-manifest | `module:codeStudio` | ✅ canonical |  |
| `/code-studio/opencode-settings` | codeStudio | module-manifest | `module:codeStudio` | ✅ canonical |  |
| `/code-studio/policies` | codeStudio | module-manifest | `module:codeStudio` | ✅ canonical |  |
| `/code-studio/repos` | codeStudio | module-manifest | `module:codeStudio` | ✅ canonical |  |
| `/code-studio/sessions` | codeStudio | module-manifest | `module:codeStudio` | ✅ canonical |  |
| `/code-studio/templates` | codeStudio | module-manifest | `module:codeStudio` | ✅ canonical |  |
| `/collaboration` | — | unknown | — | ❓ unknown |  |
| `/communication` | communication | module-manifest | `module:communication` | ✅ canonical |  |
| `/communication/chat` | communication | module-manifest | `module:communication` | ✅ canonical |  |
| `/communication/conversations` | communication | module-manifest | `module:communication` | ✅ canonical |  |
| `/communication/notifications` | communication | module-manifest | `module:communication` | ✅ canonical |  |
| `/communication/video-meeting` | communication | module-manifest | `module:communication` | ✅ canonical |  |
| `/compliance-export` | — | unknown | — | ❓ unknown |  |
| `/components/ai-catalog` | — | unknown | — | ❓ unknown |  |
| `/components/double-shell` | — | unknown | — | ❓ unknown |  |
| `/components/home-template` | — | unknown | — | ❓ unknown |  |
| `/components/opencode-chat` | — | unknown | — | ❓ unknown |  |
| `/components/opencode-home` | — | unknown | — | ❓ unknown |  |
| `/components/simple-shell` | — | unknown | — | ❓ unknown |  |
| `/conversations` | — | app-compatibility-redirect | `/communication/conversations` | ↪️ compatibility-redirect | redirects to /communication/conversations |
| `/cv` | cultureValues | module-manifest | `CVTopLevelPage` | ✅ canonical |  |
| `/cv/:item` | cultureValues | module-manifest | `CVTopLevelPage` | ✅ canonical |  |
| `/data-analysis` | dataAnalysis | module-manifest | `module:dataAnalysis` | ✅ canonical |  |
| `/data-analysis/data-acquisition` | dataAnalysis | module-manifest | `module:dataAnalysis` | ✅ canonical |  |
| `/data-analysis/data-acquisition/canonical-records` | dataAnalysis | module-manifest | `module:dataAnalysis` | ✅ canonical |  |
| `/data-analysis/data-acquisition/classification` | dataAnalysis | module-manifest | `module:dataAnalysis` | ✅ canonical |  |
| `/data-analysis/data-acquisition/document-intelligence` | dataAnalysis | module-manifest | `module:dataAnalysis` | ✅ canonical |  |
| `/data-analysis/data-acquisition/items` | dataAnalysis | module-manifest | `module:dataAnalysis` | ✅ canonical |  |
| `/data-analysis/data-acquisition/outputs` | dataAnalysis | module-manifest | `module:dataAnalysis` | ✅ canonical |  |
| `/data-analysis/data-acquisition/processing` | dataAnalysis | module-manifest | `module:dataAnalysis` | ✅ canonical |  |
| `/data-analysis/data-acquisition/routing` | dataAnalysis | module-manifest | `module:dataAnalysis` | ✅ canonical |  |
| `/data-analysis/data-acquisition/runs` | dataAnalysis | module-manifest | `module:dataAnalysis` | ✅ canonical |  |
| `/data-analysis/data-acquisition/settings` | dataAnalysis | module-manifest | `module:dataAnalysis` | ✅ canonical |  |
| `/data-analysis/data-acquisition/sources` | dataAnalysis | module-manifest | `module:dataAnalysis` | ✅ canonical |  |
| `/data-analysis/data-warehouse` | dataAnalysis | module-manifest | `module:dataAnalysis` | ✅ canonical |  |
| `/data-analysis/graphrag` | dataAnalysis | module-manifest | `module:dataAnalysis` | ✅ canonical |  |
| `/data-analysis/kgra-agent` | kgraAgent | module-manifest | `KGRAAgentPage` | ✅ canonical |  |
| `/deploy` | — | unknown | — | ❓ unknown |  |
| `/deployment-status` | — | unknown | — | ❓ unknown |  |
| `/digital-hq/:item` | platform-core | app-platform-core | — | 🏛 platform-core |  |
| `/documents` | — | unknown | — | ❓ unknown |  |
| `/documents/dashboard` | — | unknown | — | ❓ unknown |  |
| `/documents/upload` | — | unknown | — | ❓ unknown |  |
| `/drift-detection` | — | unknown | — | ❓ unknown |  |
| `/embeddings` | — | unknown | — | ❓ unknown |  |
| `/error-analysis` | — | unknown | — | ❓ unknown |  |
| `/governance` | platform-core | app-platform-core | `GovernanceCenterPage` | 🏛 platform-core |  |
| `/governance-center/:item` | — | unknown | — | ❓ unknown |  |
| `/governance/:item` | platform-core | app-platform-core | `GovernanceCenterPage` | 🏛 platform-core |  |
| `/governance/agents` | platform-core | app-platform-core | `AgentList` | 🏛 platform-core |  |
| `/governance/agents/:agentId/edit` | platform-core | app-platform-core | `WikiPage` | 🏛 platform-core |  |
| `/governance/agents/create` | platform-core | app-platform-core | `WikiPage` | 🏛 platform-core |  |
| `/governance/scorecard` | platform-core | app-platform-core | `GovernanceScorecard` | 🏛 platform-core |  |
| `/hardware` | — | unknown | — | ❓ unknown |  |
| `/hq/:item` | platform-core | app-platform-core | `DigitalHQPage` | 🏛 platform-core |  |
| `/hr` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/analytics` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/analytics-reporting` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/benefits` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/certifications` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/compensation` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/compensation-benefits` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/compliance` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/compliance-mgmt` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/compliance/risk-management` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/directory` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/employee-records` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/employee-records/letters-certificates` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/employee-records/work-permits` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/employee-relations` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/engagement` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/goals` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/grievances` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/incidents` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/learning-development` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/leave` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/lifecycle` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/offboarding` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/onboarding` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/organization` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/overtime` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/performance-talent` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/policies` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/positions` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/recruitment` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/reports` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/reviews` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/role-definitions` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/role-definitions/:id` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/role-definitions/:id/compare` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/role-definitions/:id/edit` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/role-definitions/new` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/role-definitions/review` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/security-access` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/security-access/access-controls` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/security-access/audit-logs` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/settings` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/shifts` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/skills` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/staffing` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/surveys` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/talent` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/talent-acquisition` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/time-attendance` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/timesheet` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/training` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/wellbeing-engagement` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/workforce-planning` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/hr/workforce-planning/job-architecture` | hr | module-manifest | `module:hr` | ✅ canonical |  |
| `/inference` | — | unknown | — | ❓ unknown |  |
| `/infrastructure/hardware/:category` | — | unknown | — | ❓ unknown |  |
| `/infrastructure/software/:item` | — | unknown | — | ❓ unknown |  |
| `/kgia` | — | unknown | — | ❓ unknown |  |
| `/kgia/benchmarks` | — | unknown | — | ❓ unknown |  |
| `/kgia/governance` | — | unknown | — | ❓ unknown |  |
| `/kgia/oversight` | — | unknown | — | ❓ unknown |  |
| `/kgia/sources` | — | unknown | — | ❓ unknown |  |
| `/list/:type` | — | unknown | — | ❓ unknown |  |
| `/list/bots` | — | app-compatibility-redirect | `/bots/list` | ↪️ compatibility-redirect | redirects to /bots/list |
| `/list/llms` | — | app-compatibility-redirect | `/llm/list` | ↪️ compatibility-redirect | redirects to /llm/list |
| `/list/models` | — | app-compatibility-redirect | `/models/list` | ↪️ compatibility-redirect | redirects to /models/list |
| `/list/providers` | — | app-compatibility-redirect | `/providers/list` | ↪️ compatibility-redirect | redirects to /providers/list |
| `/llm` | — | unknown | — | ❓ unknown |  |
| `/llm/:id` | — | unknown | — | ❓ unknown |  |
| `/llm/catalogue` | — | unknown | — | ❓ unknown |  |
| `/llm/catalogue/candidate` | — | unknown | — | ❓ unknown |  |
| `/llm/catalogue/manage` | — | unknown | — | ❓ unknown |  |
| `/llm/control-panel` | — | app-compatibility-redirect | `/llm/control-panel` | ↪️ compatibility-redirect | redirects to /llm/control-panel |
| `/llm/control-plane` | — | app-compatibility-redirect | `/llm/control-panel` | ↪️ compatibility-redirect | redirects to /llm/control-panel |
| `/llm/create` | — | app-compatibility-redirect | `/llm/register` | ↪️ compatibility-redirect | redirects to /llm/register |
| `/llm/dashboard` | — | app-compatibility-redirect | `/llm/control-panel` | ↪️ compatibility-redirect | redirects to /llm/control-panel |
| `/llm/list` | — | unknown | — | ❓ unknown |  |
| `/llm/new-provider` | — | unknown | — | ❓ unknown |  |
| `/llm/promotions` | — | unknown | — | ❓ unknown |  |
| `/llm/provider-wizard` | — | unknown | — | ❓ unknown |  |
| `/llm/register` | — | app-compatibility-redirect | `/llm/register` | ↪️ compatibility-redirect | redirects to /llm/register |
| `/llm/training` | — | unknown | — | ❓ unknown |  |
| `/llm/wizard` | — | unknown | — | ❓ unknown |  |
| `/models` | — | unknown | — | ❓ unknown |  |
| `/models/browse` | — | unknown | — | ❓ unknown |  |
| `/models/browser` | — | unknown | — | ❓ unknown |  |
| `/models/control-panel` | — | unknown | — | ❓ unknown |  |
| `/models/dashboard` | — | unknown | — | ❓ unknown |  |
| `/models/list` | — | unknown | — | ❓ unknown |  |
| `/models/wizard` | — | unknown | — | ❓ unknown |  |
| `/om` | organizationManagement | module-manifest | `module:organizationManagement` | ✅ canonical |  |
| `/om/control-panel` | organizationManagement | module-manifest | `module:organizationManagement` | ✅ canonical |  |
| `/om/list` | organizationManagement | module-manifest | `module:organizationManagement` | ✅ canonical |  |
| `/om/portfolio` | organizationManagement | module-manifest | `module:organizationManagement` | ✅ canonical |  |
| `/om/settings` | organizationManagement | module-manifest | `module:organizationManagement` | ✅ canonical |  |
| `/om/templates` | organizationManagement | module-manifest | `module:organizationManagement` | ✅ canonical |  |
| `/om/wizard` | organizationManagement | module-manifest | `module:organizationManagement` | ✅ canonical |  |
| `/openrouter` | openRouter | module-manifest | `OpenRouterShellPage` | ✅ canonical |  |
| `/openrouter/activity` | openRouter | module-manifest | `OpenRouterShellPage` | ✅ canonical |  |
| `/openrouter/connect` | openRouter | module-manifest | `OpenRouterShellPage` | ✅ canonical |  |
| `/openrouter/guardrails` | openRouter | module-manifest | `OpenRouterShellPage` | ✅ canonical |  |
| `/openrouter/health` | openRouter | module-manifest | `OpenRouterShellPage` | ✅ canonical |  |
| `/openrouter/models` | openRouter | module-manifest | `OpenRouterShellPage` | ✅ canonical |  |
| `/openrouter/playground` | openRouter | module-manifest | `OpenRouterShellPage` | ✅ canonical |  |
| `/openrouter/routing` | openRouter | module-manifest | `OpenRouterShellPage` | ✅ canonical |  |
| `/openrouter/usage` | openRouter | module-manifest | `OpenRouterShellPage` | ✅ canonical |  |
| `/personal/:workspaceId` | — | unknown | — | ❓ unknown |  |
| `/personal/:workspaceId/*` | — | unknown | — | ❓ unknown |  |
| `/pm` | pmCentral | module-manifest | `module:pmCentral` | ✅ canonical |  |
| `/pm-central` | — | unknown | — | ❓ unknown |  |
| `/pm-central/:item` | — | unknown | — | ❓ unknown |  |
| `/pm-central/agent-engine` | — | unknown | — | ❓ unknown |  |
| `/pm-central/agent-engine/run/:id` | — | unknown | — | ❓ unknown |  |
| `/pm-central/changes` | — | unknown | — | ❓ unknown |  |
| `/pm-central/collaboration` | — | unknown | — | ❓ unknown |  |
| `/pm-central/dashboard` | — | unknown | — | ❓ unknown |  |
| `/pm-central/execution` | — | unknown | — | ❓ unknown |  |
| `/pm-central/idea-builder` | — | unknown | — | ❓ unknown |  |
| `/pm-central/inbox` | — | unknown | — | ❓ unknown |  |
| `/pm-central/methodes` | — | unknown | — | ❓ unknown |  |
| `/pm-central/methodes/:categoryId` | — | unknown | — | ❓ unknown |  |
| `/pm-central/methodes/detail/:methodId` | — | unknown | — | ❓ unknown |  |
| `/pm-central/p/:id` | — | unknown | — | ❓ unknown |  |
| `/pm-central/p/:id/:tool` | — | unknown | — | ❓ unknown |  |
| `/pm-central/p/:id/wizard` | — | unknown | — | ❓ unknown |  |
| `/pm-central/p/:id/wizard/:step` | — | unknown | — | ❓ unknown |  |
| `/pm-central/plans` | — | unknown | — | ❓ unknown |  |
| `/pm-central/project/:id` | — | unknown | — | ❓ unknown |  |
| `/pm-central/project/:id/:tool` | — | unknown | — | ❓ unknown |  |
| `/pm-central/projects` | — | unknown | — | ❓ unknown |  |
| `/pm-central/reports` | — | unknown | — | ❓ unknown |  |
| `/pm-central/risks` | — | unknown | — | ❓ unknown |  |
| `/pm-central/rtlm` | — | app-compatibility-redirect | `/pm` | ↪️ compatibility-redirect | redirects to /pm |
| `/pm-central/rtlm/decisions` | — | app-compatibility-redirect | `/pm/decisions` | ↪️ compatibility-redirect | redirects to /pm/decisions |
| `/pm-central/rtlm/handoffs` | — | app-compatibility-redirect | `/pm/handoffs` | ↪️ compatibility-redirect | redirects to /pm/handoffs |
| `/pm-central/rtlm/issues` | — | app-compatibility-redirect | `/pm/issues` | ↪️ compatibility-redirect | redirects to /pm/issues |
| `/pm-central/rtlm/milestones` | — | app-compatibility-redirect | `/pm/milestones` | ↪️ compatibility-redirect | redirects to /pm/milestones |
| `/pm-central/rtlm/projects` | — | app-compatibility-redirect | `/pm/projects` | ↪️ compatibility-redirect | redirects to /pm/projects |
| `/pm-central/rtlm/projects/:id` | — | app-compatibility-redirect | `/pm/projects` | ↪️ compatibility-redirect | redirects to /pm/projects |
| `/pm-central/rtlm/risks` | — | app-compatibility-redirect | `/pm/risks` | ↪️ compatibility-redirect | redirects to /pm/risks |
| `/pm-central/rtlm/settings` | — | app-compatibility-redirect | `/pm/settings` | ↪️ compatibility-redirect | redirects to /pm/settings |
| `/pm-central/rtlm/tasks` | — | app-compatibility-redirect | `/pm/tasks` | ↪️ compatibility-redirect | redirects to /pm/tasks |
| `/pm-central/shell` | — | unknown | — | ❓ unknown |  |
| `/pm-central/shell/clone/:sourceId` | — | unknown | — | ❓ unknown |  |
| `/pm-central/shell/new` | — | unknown | — | ❓ unknown |  |
| `/pm-central/templates` | — | unknown | — | ❓ unknown |  |
| `/pm/decisions` | pmCentral | module-manifest | `module:pmCentral` | ✅ canonical |  |
| `/pm/handoffs` | pmCentral | module-manifest | `module:pmCentral` | ✅ canonical |  |
| `/pm/issues` | pmCentral | module-manifest | `module:pmCentral` | ✅ canonical |  |
| `/pm/milestones` | pmCentral | module-manifest | `module:pmCentral` | ✅ canonical |  |
| `/pm/projects` | pmCentral | module-manifest | `module:pmCentral` | ✅ canonical |  |
| `/pm/projects/:id` | pmCentral | module-manifest | `module:pmCentral` | ✅ canonical |  |
| `/pm/risks` | pmCentral | module-manifest | `module:pmCentral` | ✅ canonical |  |
| `/pm/settings` | pmCentral | module-manifest | `module:pmCentral` | ✅ canonical |  |
| `/pm/tasks` | pmCentral | module-manifest | `module:pmCentral` | ✅ canonical |  |
| `/policies` | platform-core | app-platform-core | `PolicyManagement` | 🏛 platform-core |  |
| `/prm` | prm | module-manifest | `module:prm` | ✅ canonical |  |
| `/prm/ai-catalog` | prm | module-manifest | `module:prm` | ✅ canonical |  |
| `/prm/cases` | prm | module-manifest | `module:prm` | ✅ canonical |  |
| `/prm/cases/:id` | prm | module-manifest | `module:prm` | ✅ canonical |  |
| `/prm/catalog` | prm | module-manifest | `module:prm` | ✅ canonical |  |
| `/prm/control-panel` | prm | module-manifest | `module:prm` | ✅ canonical |  |
| `/prm/dashboard` | prm | module-manifest | `module:prm` | ✅ canonical |  |
| `/prm/methods` | prm | module-manifest | `module:prm` | ✅ canonical |  |
| `/prm/new` | prm | module-manifest | `module:prm` | ✅ canonical |  |
| `/prm/playbooks` | prm | module-manifest | `module:prm` | ✅ canonical |  |
| `/project/:workspaceId` | — | unknown | — | ❓ unknown |  |
| `/project/:workspaceId/*` | — | unknown | — | ❓ unknown |  |
| `/promotion-requests` | — | unknown | — | ❓ unknown |  |
| `/protocols` | — | unknown | — | ❓ unknown |  |
| `/providers` | — | unknown | — | ❓ unknown |  |
| `/providers-analytics` | — | unknown | — | ❓ unknown |  |
| `/providers/:id` | — | unknown | — | ❓ unknown |  |
| `/providers/connections` | — | unknown | — | ❓ unknown |  |
| `/providers/control-panel` | — | unknown | — | ❓ unknown |  |
| `/providers/dashboard` | — | unknown | — | ❓ unknown |  |
| `/providers/list` | — | unknown | — | ❓ unknown |  |
| `/providers/wizard` | — | unknown | — | ❓ unknown |  |
| `/ps` | ps | module-manifest | `module:ps` | ✅ canonical |  |
| `/ps/ai-catalog` | ps | module-manifest | `module:ps` | ✅ canonical |  |
| `/ps/catalog` | ps | module-manifest | `module:ps` | ✅ canonical |  |
| `/ps/control-panel` | ps | module-manifest | `module:ps` | ✅ canonical |  |
| `/ps/ideation` | ps | module-manifest | `module:ps` | ✅ canonical |  |
| `/ps/ideation/:id` | ps | module-manifest | `module:ps` | ✅ canonical |  |
| `/ps/ideation/:id/convert` | ps | module-manifest | `module:ps` | ✅ canonical |  |
| `/ps/list` | ps | module-manifest | `module:ps` | ✅ canonical |  |
| `/ps/wizard` | ps | module-manifest | `module:ps` | ✅ canonical |  |
| `/psm` | psm | module-manifest | `module:psm` | ✅ canonical |  |
| `/psm/admin` | psm | module-manifest | `module:psm` | ✅ canonical |  |
| `/psm/ai-catalog` | psm | module-manifest | `module:psm` | ✅ canonical |  |
| `/psm/analytics` | psm | module-manifest | `module:psm` | ✅ canonical |  |
| `/psm/cases` | psm | module-manifest | `module:psm` | ✅ canonical |  |
| `/psm/cases/:id` | psm | module-manifest | `module:psm` | ✅ canonical |  |
| `/psm/dashboard` | psm | module-manifest | `module:psm` | ✅ canonical |  |
| `/psm/library` | psm | module-manifest | `module:psm` | ✅ canonical |  |
| `/psm/methods/:id` | psm | module-manifest | `module:psm` | ✅ canonical |  |
| `/psm/runs/:id` | psm | module-manifest | `module:psm` | ✅ canonical |  |
| `/psm/selector` | psm | module-manifest | `module:psm` | ✅ canonical |  |
| `/research/:workspaceId` | — | unknown | — | ❓ unknown |  |
| `/research/:workspaceId/*` | — | unknown | — | ❓ unknown |  |
| `/resources` | — | unknown | — | ❓ unknown |  |
| `/run-console` | — | unknown | — | ❓ unknown |  |
| `/settings` | — | unknown | — | ❓ unknown |  |
| `/setup/ollama` | — | unknown | — | ❓ unknown |  |
| `/templates` | — | unknown | — | ❓ unknown |  |
| `/tools-management` | — | unknown | — | ❓ unknown |  |
| `/ui-showcase` | — | unknown | — | ❓ unknown |  |
| `/vectordb` | — | unknown | — | ❓ unknown |  |
| `/video-meeting` | — | app-compatibility-redirect | `/communication/video-meeting` | ↪️ compatibility-redirect | redirects to /communication/video-meeting |
| `/w/:workspaceId` | — | unknown | — | ❓ unknown |  |
| `/w/:workspaceId/*` | — | unknown | — | ❓ unknown |  |
| `/wcp/executions` | — | unknown | — | ❓ unknown |  |
| `/wcp/executions/:id` | — | unknown | — | ❓ unknown |  |
| `/wcp/workflows` | — | unknown | — | ❓ unknown |  |
| `/wcp/workflows/builder` | — | unknown | — | ❓ unknown |  |
| `/wiki` | — | unknown | — | ❓ unknown |  |
| `/wiki/:slug` | — | unknown | — | ❓ unknown |  |
| `/wiki/edit/:id` | — | unknown | — | ❓ unknown |  |
| `/work-console` | — | unknown | — | ❓ unknown |  |
| `/work-console/:id` | — | unknown | — | ❓ unknown |  |
| `/work-console/:id/:tab` | — | unknown | — | ❓ unknown |  |
| `/work-console/new` | — | unknown | — | ❓ unknown |  |
| `/ws/catalog` | platform-core | app-platform-core | `WSCatalogPage` | 🏛 platform-core |  |
| `/ws/control-panel` | platform-core | app-platform-core | `WSControlPanelPage` | 🏛 platform-core |  |
| `/ws/dashboard` | platform-core | app-platform-core | `WSDashboardPage` | 🏛 platform-core |  |
| `/ws/list` | platform-core | app-platform-core | `WSListPage` | 🏛 platform-core |  |
| `/ws/wizard/:id?` | platform-core | app-platform-core | `WSWizardPage` | 🏛 platform-core |  |

## Unknown routes

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


---

_This file is generated. Edits should be made to manifest sources or `App.tsx`, then the generator re-run._
