/**
 * appRouter — root tRPC router
 *
 * Composition rule (post modular refactor):
 *   - Platform core routers are explicit (auth, system, workspaces,
 *     governance, modules registry, coordinator/orchestrator, hq, etc).
 *   - Module routers come from the manifest barrel
 *     (`server/platform/modules/module-routers.ts`). Adding a module is
 *     one entry there, not here.
 *
 * The manifest barrel is type-preserving so the client's per-module
 * tRPC inference (e.g. `trpc.prm.<...>.useQuery`) keeps working.
 */

import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

// ---------------------------------------------------------------------------
// Platform core routers (explicit)
// ---------------------------------------------------------------------------
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
import { workforceAssignmentRouter } from "./workforce-assignment/router";
// Data Analysis is now sourced from MODULE_ROUTERS (manifest-driven).

// ---------------------------------------------------------------------------
// Module routers — manifest-driven
// ---------------------------------------------------------------------------
// Type-only / value import of MODULE_ROUTERS only. Manifest registration
// is owned exclusively by server/_core/index.ts startup; importing this
// file (e.g. for AppRouter type extraction or codegen) must NOT trigger
// registry side effects. (A5)
import { MODULE_ROUTERS } from "./platform/modules/module-routers";

// ---------------------------------------------------------------------------
// appRouter — root composition
// ---------------------------------------------------------------------------

export const appRouter = router({
  // Platform core
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
  catalogManage: catalogManageRouter, // [DEPRECATED alias] → use aiTypes.catalog
  catalogRegistry: catalogRegistryRouter, // [DEPRECATED alias] → use aiTypes.registry
  catalogImport: catalogImportRouter, // [DEPRECATED alias] → use aiTypes.import
  providerConnections: providerConnectionsRouter, // Provider PAT Authentication (Governed)
  discoveryOps: discoveryOpsRouter, // Discovery Ops: monitoring, promotion, audit
  governance: governanceRouter, // Governance Engine (CGT v2)
  hq: hqRouter, // Digital HQ aggregation
  workforceAssignment: workforceAssignmentRouter, // OM↔HR↔PS governed staffing bridge
  modules: modulesRouter, // Workspace Engines registry (PMT, Knowledge, …)
  orchestrator: orchestratorRouter, // Multi-Operator Autonomous Runtime
  models: modelsRouter, // Model Registry (governed)
  bots: botsRouter, // Bot Domain (governed lifecycle)
  // dataAnalysis is mounted via MODULE_ROUTERS (manifest-driven).

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  workspaces: workspaceRouter,
  wsCatalog: wsCatalogRouter,
  documents: documentsCrudRouter,

  // Module routers — sourced from manifests (one entry per module in
  // server/platform/modules/module-routers.ts).
  ...MODULE_ROUTERS,
});

export type AppRouter = typeof appRouter;

/**
 * Convenience helper for tests and integration callers that want to
 * invoke the root router without having to spell out
 * `appRouter.createCaller(ctx)`. Accepts a partial context — callers
 * are expected to supply the fields each procedure actually reads.
 */
export function createCaller(ctx: Partial<import("./_core/context").TrpcContext> = {}) {
  return appRouter.createCaller(ctx as import("./_core/context").TrpcContext);
}
