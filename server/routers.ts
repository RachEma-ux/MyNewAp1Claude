import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { providerRouter } from "./providers/router";
import { providerAnalyticsRouter } from "./providers/analytics-router";
import { chatRouter } from "./chat/router";
import { modelDownloadRouter } from "./models/download-router";
import { modelBenchmarkRouter } from "./models/benchmark-router";
import { modelVersionRouter } from "./models/version-router";
import { downloadAnalyticsRouter } from "./models/analytics-router";
import { hardwareRouter } from "./hardware/hardware-router";
import { inferenceRouter } from "./inference/inference-router";
import { embeddingsRouter } from "./embeddings/embeddings-router";
import { vectordbRouter } from "./vectordb/vectordb-router";
import { documentsRouter } from "./documents/documents-router";
import { documentsCrudRouter } from "./documents/documents-crud-router";
import { automationRouter } from "./automation/automation-router";
import { secretsRouter } from "./secrets/secrets-router";
import { triggersRouter } from "./routers/triggers";
import { actionsRouter } from "./routers/actions";
import { templatesRouter } from "./routers/templates";
import { agentsRouter } from "./routers/agents";
import { agentsPromotionsRouter } from "./routers/agents-promotions";
import { protocolsRouter } from "./routers/protocols";
import { conversationsRouter } from "./routers/conversations";
import { wcpWorkflowsRouter } from "./routers/wcpWorkflows";
import { policiesRouter } from "./routers/policies";
import { keyRotationRouter } from "./routers/keyRotation";
import { wikiRouter } from "./routers/wiki";
import { llmRouter } from "./routers/llm";
import { diagnosticRouter } from "./routers/diagnostic";
import { deployRouter } from "./routers/deploy";
import { catalogManageRouter } from "./routers/catalog-manage";
import { catalogRegistryRouter } from "./routers/catalog-registry";
import { catalogImportRouter } from "./catalog-import/router";
import { providerConnectionsRouter } from "./provider-connections/router";
import { discoveryOpsRouter } from "./routers/discovery-ops";
import { modelsRouter } from "./routers/models";
import { governanceRouter } from "./governance/router";
import { hqRouter } from "./hq/router";
import { modulesRouter } from "./modules/router";
import { orchestratorRouter } from "./orchestrator/router";
import { botsRouter } from "./routers/bots";
import { workspaceRouter, wsCatalogRouter } from "./workspace/workspace-router";
import { hrRouter } from "./hr/router";
import { workforceAssignmentRouter } from "./workforce-assignment/router";
import { organizationManagementRouter } from "./organization-management/router";
import { cultureValuesRouter } from "./culture-values/router";
import { psRouter } from "./ps/ps.router";
import { dataAnalysisRouter } from "./data-analysis/router";
import { sandboxWfRouter } from "./sandbox-wf/router";
import { aiTypesRouter } from "./ai-types/router";
import { prmRouter } from "./prm/prm.router";
import { psmRouter } from "./psm/psm.router";
import { codeStudioRouter } from "./code-studio/api/router";
import { agentStudioRouter } from "./agent-studio/api/router";
import { openRouterRouter } from "./openrouter/router";

export const appRouter = router({
  system: systemRouter,
  diagnostic: diagnosticRouter, // Diagnostic endpoints for debugging
  providers: providerRouter,
  providerAnalytics: providerAnalyticsRouter,
  chat: chatRouter,
  agents: agentsRouter,
  agentPromotions: agentsPromotionsRouter,
  conversations: conversationsRouter,
  modelDownloads: modelDownloadRouter,
  modelBenchmarks: modelBenchmarkRouter,
  modelVersions: modelVersionRouter,
  downloadAnalytics: downloadAnalyticsRouter,
  hardware: hardwareRouter,
  inference: inferenceRouter,
  embeddings: embeddingsRouter,
  vectordb: vectordbRouter,
  documentsApi: documentsRouter,
  automation: automationRouter,
  secrets: secretsRouter,
  triggers: triggersRouter,
  actions: actionsRouter,
  templates: templatesRouter,
  protocols: protocolsRouter,
  wcpWorkflows: wcpWorkflowsRouter,
  policies: policiesRouter,
  keyRotation: keyRotationRouter,
  wiki: wikiRouter,
  llm: llmRouter, // LLM Control Plane
  deploy: deployRouter, // Deployment management
  aiTypes: aiTypesRouter, // AI Types Module (catalog, registry, import, taxonomy, relationships)
  catalogManage: catalogManageRouter, // [DEPRECATED alias] → use aiTypes.catalog
  catalogRegistry: catalogRegistryRouter, // [DEPRECATED alias] → use aiTypes.registry
  catalogImport: catalogImportRouter, // [DEPRECATED alias] → use aiTypes.import
  providerConnections: providerConnectionsRouter, // Provider PAT Authentication (Governed)
  discoveryOps: discoveryOpsRouter, // Discovery Ops: monitoring, promotion, audit
  governance: governanceRouter, // Governance Engine (CGT v2)
  hq: hqRouter, // Digital HQ aggregation
  hr: hrRouter, // Human Resources — global workforce backbone
  workforceAssignment: workforceAssignmentRouter, // Workforce Assignment Bridge — OM↔HR↔PS governed staffing
  organizationManagement: organizationManagementRouter, // Organization Management — structural backbone (entities, org units, jobs, positions, authority)
  cultureValues: cultureValuesRouter, // Culture Values — enterprise values, behaviors, translations, operationalization
  ps: psRouter, // Projects System — project system definitions, wizard runs, catalog
  modules: modulesRouter, // Platform Engines (PMT, Knowledge, Agents, Collaboration, Reporting, HR)
  orchestrator: orchestratorRouter, // Multi-Operator Autonomous Runtime
  models: modelsRouter, // Model Registry (governed)
  bots: botsRouter, // Bot Domain (governed lifecycle)
  dataAnalysis: dataAnalysisRouter, // Data Analysis — GraphRAG engine + future analytical tools
  prm: prmRouter, // PRM — Problem Resolution Methods (dedicated prmdb)
  psm: psmRouter, // PSM — Problem Solving Methods (dedicated psmdb)
  sandboxWf: sandboxWfRouter, // Sandbox WF — dedicated wfdb workflows, steps, executions, triggers
  codeStudio: codeStudioRouter, // Code Studio — standalone coding module (dedicated codedb, OpenCode runtime)
  agentStudio: agentStudioRouter, // AI Agent Studio — standalone agent lifecycle module (ags_* tables)
  openRouter: openRouterRouter, // OpenRouter — unified model gateway (control plane + runtime)
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ============================================================================
  // Workspace Management — Canonical workspace system v2
  // ============================================================================
  workspaces: workspaceRouter,

  // WS Catalog — Published workspace discovery for participants
  wsCatalog: wsCatalogRouter,

  // Document CRUD (extracted from inline to documents/documents-crud-router.ts)
  documents: documentsCrudRouter,

  // Note: conversations router is imported from ./routers/conversations.ts (line 35)
});

export type AppRouter = typeof appRouter;
