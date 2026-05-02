# Route Ownership Map

Generated: 2026-05-02T10:56:03.543Z

Authoritative view of every URL the app exposes and which surface
owns it. Regenerate with `tsx scripts/generate-route-ownership-map.ts`.

## Summary

| Status | Count |
|---|---|
| ✅ canonical | 93 |
| ↪️ compatibility-redirect | 15 |
| 🚫 deprecated | 0 |
| 🏛 platform-core | 14 |
| ⚠️ orphan | 0 |
| ❓ unknown | 205 |
| **Total** | **327** |

## Per-RTLM

| RTLM | Migration | Declared paths | Manifest baseRoute |
|---|---|---|---|
| dataAnalysis | ⏳ pending | 12 | `—` |
| communication | ⏳ pending | 5 | `—` |
| pmCentral | ⏳ pending | 10 | `—` |
| codeStudio | ⏳ pending | 11 | `—` |
| ps | ⏳ pending | 8 | `—` |
| prm | ⏳ pending | 8 | `—` |
| psm | ⏳ pending | 10 | `—` |
| hr | ⏳ pending | 4 | `—` |
| organizationManagement | ⏳ pending | 2 | `—` |
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
| `/code-studio` | codeStudio | module-manifest | `CodeStudioShellPage` | ✅ canonical |  |
| `/code-studio/agents` | codeStudio | module-manifest | `CodeStudioShellPage` | ✅ canonical |  |
| `/code-studio/ai-catalog` | codeStudio | unknown | — | ❓ unknown |  |
| `/code-studio/approvals` | codeStudio | module-manifest | `CodeStudioShellPage` | ✅ canonical |  |
| `/code-studio/control-panel` | codeStudio | module-manifest | `CodeStudioShellPage` | ✅ canonical |  |
| `/code-studio/dashboard` | codeStudio | module-manifest | `CodeStudioShellPage` | ✅ canonical |  |
| `/code-studio/how-to` | codeStudio | unknown | — | ❓ unknown |  |
| `/code-studio/jobs` | codeStudio | module-manifest | `CodeStudioShellPage` | ✅ canonical |  |
| `/code-studio/jobs/:id` | codeStudio | module-manifest | `CodeStudioShellPage` | ✅ canonical |  |
| `/code-studio/opencode-settings` | codeStudio | unknown | — | ❓ unknown |  |
| `/code-studio/policies` | codeStudio | module-manifest | `CodeStudioShellPage` | ✅ canonical |  |
| `/code-studio/repos` | codeStudio | module-manifest | `CodeStudioShellPage` | ✅ canonical |  |
| `/code-studio/sessions` | codeStudio | module-manifest | `CodeStudioShellPage` | ✅ canonical |  |
| `/code-studio/templates` | codeStudio | module-manifest | `CodeStudioShellPage` | ✅ canonical |  |
| `/collaboration` | — | unknown | — | ❓ unknown |  |
| `/communication` | communication | module-manifest | `CommunicationDashboardPage` | ✅ canonical |  |
| `/communication/chat` | communication | module-manifest | `CommunicationChatPage` | ✅ canonical |  |
| `/communication/conversations` | communication | module-manifest | `CommunicationConversationsPage` | ✅ canonical |  |
| `/communication/notifications` | communication | app-compatibility-redirect | `/communication/chat` | ↪️ compatibility-redirect | redirects to /communication/chat |
| `/communication/video-meeting` | communication | module-manifest | `CommunicationVideoMeetingPage` | ✅ canonical |  |
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
| `/data-analysis` | — | app-compatibility-redirect | `/data-analysis/graphrag` | ↪️ compatibility-redirect | redirects to /data-analysis/graphrag |
| `/data-analysis/data-acquisition` | — | module-manifest | `module:?` | ✅ canonical |  |
| `/data-analysis/data-acquisition/canonical-records` | — | module-manifest | `module:?` | ✅ canonical |  |
| `/data-analysis/data-acquisition/classification` | — | module-manifest | `module:?` | ✅ canonical |  |
| `/data-analysis/data-acquisition/document-intelligence` | — | module-manifest | `module:?` | ✅ canonical |  |
| `/data-analysis/data-acquisition/items` | — | module-manifest | `module:?` | ✅ canonical |  |
| `/data-analysis/data-acquisition/outputs` | — | module-manifest | `module:?` | ✅ canonical |  |
| `/data-analysis/data-acquisition/processing` | — | module-manifest | `module:?` | ✅ canonical |  |
| `/data-analysis/data-acquisition/routing` | — | module-manifest | `module:?` | ✅ canonical |  |
| `/data-analysis/data-acquisition/runs` | — | module-manifest | `module:?` | ✅ canonical |  |
| `/data-analysis/data-acquisition/settings` | — | module-manifest | `module:?` | ✅ canonical |  |
| `/data-analysis/data-acquisition/sources` | — | module-manifest | `module:?` | ✅ canonical |  |
| `/data-analysis/data-warehouse` | — | app-compatibility-redirect | `/data-analysis/graphrag` | ↪️ compatibility-redirect | redirects to /data-analysis/graphrag |
| `/data-analysis/graphrag` | dataAnalysis | module-manifest | `GraphRAGPage` | ✅ canonical |  |
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
| `/hr` | hr | module-manifest | `HRHomePage` | ✅ canonical |  |
| `/hr/analytics` | hr | unknown | — | ❓ unknown |  |
| `/hr/analytics-reporting` | hr | unknown | — | ❓ unknown |  |
| `/hr/benefits` | hr | unknown | — | ❓ unknown |  |
| `/hr/certifications` | hr | unknown | — | ❓ unknown |  |
| `/hr/compensation` | hr | unknown | — | ❓ unknown |  |
| `/hr/compensation-benefits` | hr | unknown | — | ❓ unknown |  |
| `/hr/compliance` | hr | unknown | — | ❓ unknown |  |
| `/hr/compliance-mgmt` | hr | unknown | — | ❓ unknown |  |
| `/hr/compliance/risk-management` | hr | unknown | — | ❓ unknown |  |
| `/hr/directory` | hr | module-manifest | `HrDirectoryGated` | ✅ canonical |  |
| `/hr/employee-records` | hr | unknown | — | ❓ unknown |  |
| `/hr/employee-records/letters-certificates` | hr | unknown | — | ❓ unknown |  |
| `/hr/employee-records/work-permits` | hr | unknown | — | ❓ unknown |  |
| `/hr/employee-relations` | hr | unknown | — | ❓ unknown |  |
| `/hr/engagement` | hr | unknown | — | ❓ unknown |  |
| `/hr/goals` | hr | unknown | — | ❓ unknown |  |
| `/hr/grievances` | hr | unknown | — | ❓ unknown |  |
| `/hr/incidents` | hr | unknown | — | ❓ unknown |  |
| `/hr/learning-development` | hr | unknown | — | ❓ unknown |  |
| `/hr/leave` | hr | unknown | — | ❓ unknown |  |
| `/hr/lifecycle` | hr | unknown | — | ❓ unknown |  |
| `/hr/offboarding` | hr | unknown | — | ❓ unknown |  |
| `/hr/onboarding` | hr | unknown | — | ❓ unknown |  |
| `/hr/organization` | hr | module-manifest | `HrOrganizationGated` | ✅ canonical |  |
| `/hr/overtime` | hr | unknown | — | ❓ unknown |  |
| `/hr/performance-talent` | hr | unknown | — | ❓ unknown |  |
| `/hr/policies` | hr | unknown | — | ❓ unknown |  |
| `/hr/positions` | hr | unknown | — | ❓ unknown |  |
| `/hr/recruitment` | hr | unknown | — | ❓ unknown |  |
| `/hr/reports` | hr | module-manifest | `HrReportsGated` | ✅ canonical |  |
| `/hr/reviews` | hr | unknown | — | ❓ unknown |  |
| `/hr/role-definitions` | hr | unknown | — | ❓ unknown |  |
| `/hr/role-definitions/:id` | hr | unknown | — | ❓ unknown |  |
| `/hr/role-definitions/:id/compare` | hr | unknown | — | ❓ unknown |  |
| `/hr/role-definitions/:id/edit` | hr | unknown | — | ❓ unknown |  |
| `/hr/role-definitions/new` | hr | unknown | — | ❓ unknown |  |
| `/hr/role-definitions/review` | hr | unknown | — | ❓ unknown |  |
| `/hr/security-access` | hr | unknown | — | ❓ unknown |  |
| `/hr/security-access/access-controls` | hr | unknown | — | ❓ unknown |  |
| `/hr/security-access/audit-logs` | hr | unknown | — | ❓ unknown |  |
| `/hr/settings` | hr | unknown | — | ❓ unknown |  |
| `/hr/shifts` | hr | unknown | — | ❓ unknown |  |
| `/hr/skills` | hr | unknown | — | ❓ unknown |  |
| `/hr/staffing` | hr | unknown | — | ❓ unknown |  |
| `/hr/surveys` | hr | unknown | — | ❓ unknown |  |
| `/hr/talent` | hr | unknown | — | ❓ unknown |  |
| `/hr/talent-acquisition` | hr | unknown | — | ❓ unknown |  |
| `/hr/time-attendance` | hr | unknown | — | ❓ unknown |  |
| `/hr/timesheet` | hr | unknown | — | ❓ unknown |  |
| `/hr/training` | hr | unknown | — | ❓ unknown |  |
| `/hr/wellbeing-engagement` | hr | unknown | — | ❓ unknown |  |
| `/hr/workforce-planning` | hr | unknown | — | ❓ unknown |  |
| `/hr/workforce-planning/job-architecture` | hr | unknown | — | ❓ unknown |  |
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
| `/om` | organizationManagement | module-manifest | `OMTopLevelPage` | ✅ canonical |  |
| `/om/:item` | organizationManagement | module-manifest | `OMTopLevelPage` | ✅ canonical |  |
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
| `/pm-central/rtlm` | pmCentral | module-manifest | `PMCentralRtlmDashboardPage` | ✅ canonical |  |
| `/pm-central/rtlm/decisions` | pmCentral | module-manifest | `PMCentralRtlmDecisionsPage` | ✅ canonical |  |
| `/pm-central/rtlm/handoffs` | pmCentral | module-manifest | `PMCentralRtlmHandoffsPage` | ✅ canonical |  |
| `/pm-central/rtlm/issues` | pmCentral | module-manifest | `PMCentralRtlmIssuesPage` | ✅ canonical |  |
| `/pm-central/rtlm/milestones` | pmCentral | module-manifest | `PMCentralRtlmMilestonesPage` | ✅ canonical |  |
| `/pm-central/rtlm/projects` | pmCentral | module-manifest | `PMCentralRtlmProjectsPage` | ✅ canonical |  |
| `/pm-central/rtlm/projects/:id` | pmCentral | module-manifest | `PMCentralRtlmProjectDetailPage` | ✅ canonical |  |
| `/pm-central/rtlm/risks` | pmCentral | module-manifest | `PMCentralRtlmRisksPage` | ✅ canonical |  |
| `/pm-central/rtlm/settings` | pmCentral | module-manifest | `PMCentralRtlmSettingsPage` | ✅ canonical |  |
| `/pm-central/rtlm/tasks` | pmCentral | module-manifest | `PMCentralRtlmTasksPage` | ✅ canonical |  |
| `/pm-central/shell` | — | unknown | — | ❓ unknown |  |
| `/pm-central/shell/clone/:sourceId` | — | unknown | — | ❓ unknown |  |
| `/pm-central/shell/new` | — | unknown | — | ❓ unknown |  |
| `/pm-central/templates` | — | unknown | — | ❓ unknown |  |
| `/policies` | platform-core | app-platform-core | `PolicyManagement` | 🏛 platform-core |  |
| `/prm` | prm | module-manifest | `PRMShellPage` | ✅ canonical |  |
| `/prm/ai-catalog` | prm | unknown | — | ❓ unknown |  |
| `/prm/cases` | prm | module-manifest | `PRMShellPage` | ✅ canonical |  |
| `/prm/cases/:id` | prm | module-manifest | `PRMCaseWorkspacePage` | ✅ canonical |  |
| `/prm/catalog` | prm | module-manifest | `PRMShellPage` | ✅ canonical |  |
| `/prm/control-panel` | prm | module-manifest | `PRMShellPage` | ✅ canonical |  |
| `/prm/dashboard` | prm | module-manifest | `PRMShellPage` | ✅ canonical |  |
| `/prm/methods` | prm | module-manifest | `PRMShellPage` | ✅ canonical |  |
| `/prm/new` | prm | unknown | — | ❓ unknown |  |
| `/prm/playbooks` | prm | module-manifest | `PRMShellPage` | ✅ canonical |  |
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
| `/ps` | ps | module-manifest | `PSShellPage` | ✅ canonical |  |
| `/ps/ai-catalog` | ps | unknown | — | ❓ unknown |  |
| `/ps/catalog` | ps | module-manifest | `PSShellPage` | ✅ canonical |  |
| `/ps/control-panel` | ps | module-manifest | `PSShellPage` | ✅ canonical |  |
| `/ps/ideation` | ps | module-manifest | `PSShellPage` | ✅ canonical |  |
| `/ps/ideation/:id` | ps | module-manifest | `PSIdeationDetailPage` | ✅ canonical |  |
| `/ps/ideation/:id/convert` | ps | module-manifest | `PSIdeationConvertPage` | ✅ canonical |  |
| `/ps/list` | ps | module-manifest | `PSShellPage` | ✅ canonical |  |
| `/ps/wizard` | ps | module-manifest | `PSShellPage` | ✅ canonical |  |
| `/psm` | psm | module-manifest | `PSMShellPage` | ✅ canonical |  |
| `/psm/admin` | psm | module-manifest | `PSMShellPage` | ✅ canonical |  |
| `/psm/ai-catalog` | psm | unknown | — | ❓ unknown |  |
| `/psm/analytics` | psm | module-manifest | `PSMShellPage` | ✅ canonical |  |
| `/psm/cases` | psm | module-manifest | `PSMShellPage` | ✅ canonical |  |
| `/psm/cases/:id` | psm | module-manifest | `PSMCaseDetailPage` | ✅ canonical |  |
| `/psm/dashboard` | psm | module-manifest | `PSMShellPage` | ✅ canonical |  |
| `/psm/library` | psm | module-manifest | `PSMShellPage` | ✅ canonical |  |
| `/psm/methods/:id` | psm | module-manifest | `PSMMethodDetailPage` | ✅ canonical |  |
| `/psm/runs/:id` | psm | module-manifest | `PSMRunPage` | ✅ canonical |  |
| `/psm/selector` | psm | module-manifest | `PSMShellPage` | ✅ canonical |  |
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
| `/code-studio/ai-catalog` | unknown | codeStudio |  |
| `/code-studio/how-to` | unknown | codeStudio |  |
| `/code-studio/opencode-settings` | unknown | codeStudio |  |
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
| `/prm/ai-catalog` | unknown | prm |  |
| `/prm/new` | unknown | prm |  |
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
| `/ps/ai-catalog` | unknown | ps |  |
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


---

_This file is generated. Edits should be made to manifest sources or `App.tsx`, then the generator re-run._
