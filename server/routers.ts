import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, governedProcedure, router } from "./_core/trpc";
import * as db from "./db";
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
import { seedWorkspaceModules, logActivity, getWorkspaceModules } from "./modules/registry";
import { isWorkspaceExecutable, isWorkspaceDeleted, isWorkspaceReadable } from "./workspace/workspace-lifecycle";
import { requireReadableWorkspaceRoute, requireExecutableWorkspaceRoute, requireCapability } from "./workspace/workspace-guards";
import type { WorkspaceStatus } from "../drizzle/tables/users";

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
  catalogManage: catalogManageRouter, // Catalog Management CRUD
  catalogRegistry: catalogRegistryRouter, // Catalog Registry (read-only consumption)
  catalogImport: catalogImportRouter, // Catalog Import & Discovery
  providerConnections: providerConnectionsRouter, // Provider PAT Authentication (Governed)
  discoveryOps: discoveryOpsRouter, // Discovery Ops: monitoring, promotion, audit
  governance: governanceRouter, // Governance Engine (CGT v2)
  hq: hqRouter, // Digital HQ aggregation
  modules: modulesRouter, // Platform Engines (PMT, Knowledge, Agents, Collaboration, Reporting)
  orchestrator: orchestratorRouter, // Multi-Operator Autonomous Runtime
  models: modelsRouter, // Model Registry (governed)
  bots: botsRouter, // Bot Domain (governed lifecycle)
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ============================================================================
  // Workspace Management
  // ============================================================================
  
  workspaces: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserWorkspaces(ctx.user.id);
    }),

    create: governedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          description: z.string().optional(),
          template: z.enum(["personal", "project", "research", "team", "enterprise", "sandbox"]).optional(),
          type: z.string().optional(),
          embeddingModel: z.string().optional(),
          chunkingStrategy: z.enum(["semantic", "fixed", "recursive"]).optional(),
          chunkSize: z.number().optional(),
          chunkOverlap: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const workspaceType = input.template || input.type || "team";
        const workspace = await db.createWorkspace({
          ...input,
          type: workspaceType,
          ownerId: ctx.user.id,
          collectionName: `workspace_${Date.now()}`,
        });
        // Seed module bindings based on workspace type
        if (workspace && typeof workspace === 'object' && 'id' in workspace) {
          try {
            await seedWorkspaceModules((workspace as any).id, workspaceType);
          } catch (err) {
            console.warn(`[Workspace] Failed to seed modules: ${(err as Error).message}`);
          }
          // WS-13: Activity traceability
          await logActivity({ workspaceId: (workspace as any).id, actorId: ctx.user.id, action: "workspace.create", metadata: { workspaceType } }).catch(() => {});
        }
        return workspace;
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        // WS-01/WS-04: Lifecycle guard — deleted workspaces are blocked
        const { workspace } = await requireReadableWorkspaceRoute(ctx.user.id, input.id);
        return workspace;
      }),

    update: governedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(255).optional(),
          description: z.string().optional(),
          embeddingModel: z.string().optional(),
          chunkingStrategy: z.enum(["semantic", "fixed", "recursive"]).optional(),
          chunkSize: z.number().optional(),
          chunkOverlap: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // WS-04/WS-06: Lifecycle guard — block mutations on non-executable workspaces
        await requireExecutableWorkspaceRoute(ctx.user.id, input.id, "workspace.update");
        // WS-10: Capability enforcement — require workspace.manage for updates
        await requireCapability(ctx.user.id, input.id, "workspace.manage");
        const { id, ...updates } = input;
        await db.updateWorkspace(id, { ...updates, updatedAt: new Date() });
        // WS-13: Activity traceability
        await logActivity({ workspaceId: id, actorId: ctx.user.id, action: "workspace.update", metadata: updates }).catch(() => {});
        return { success: true };
      }),

    // Get workspace routing profile
    getRoutingProfile: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        // WS-01/WS-04: Lifecycle guard — readable check (deleted blocked)
        const { workspace } = await requireReadableWorkspaceRoute(ctx.user.id, input.id);
        return (workspace as Record<string, unknown>)?.routingProfile || {
          defaultRoute: 'AUTO',
          dataSensitivity: 'LOW',
          qualityTier: 'BALANCED',
          fallback: { enabled: true, maxHops: 3 },
        };
      }),

    // Update workspace routing profile
    updateRoutingProfile: governedProcedure
      .input(
        z.object({
          id: z.number(),
          routingProfile: z.object({
            defaultRoute: z.enum(['AUTO', 'LOCAL_ONLY', 'CLOUD_ALLOWED']),
            dataSensitivity: z.enum(['LOW', 'MED', 'HIGH']),
            qualityTier: z.enum(['FAST', 'BALANCED', 'BEST']),
            fallback: z.object({
              enabled: z.boolean(),
              maxHops: z.number().min(0).max(10),
            }),
            pinnedProviderId: z.number().optional().nullable(),
          }),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // WS-04/WS-06: Lifecycle guard — block on non-executable
        await requireExecutableWorkspaceRoute(ctx.user.id, input.id, "workspace.updateRoutingProfile");
        // WS-10: Capability enforcement — require workspace.settings for routing config
        await requireCapability(ctx.user.id, input.id, "workspace.settings");
        await db.updateWorkspace(input.id, {
          routingProfile: input.routingProfile,
        } as Record<string, unknown>);
        // WS-13: Activity traceability
        await logActivity({ workspaceId: input.id, actorId: ctx.user.id, action: "workspace.updateRoutingProfile" }).catch(() => {});
        return { success: true };
      }),

    // WS-12: Get recent workspace activity log
    getActivity: protectedProcedure
      .input(z.object({ workspaceId: z.number(), limit: z.number().min(1).max(100).default(20) }))
      .query(async ({ ctx, input }) => {
        await requireReadableWorkspaceRoute(ctx.user.id, input.workspaceId);
        const { getDb } = await import("./db/connection");
        const dbConn = getDb();
        if (!dbConn) return [];
        try {
          const { workspaceActivityLog } = await import("../drizzle/schema");
          const { eq, desc } = await import("drizzle-orm");
          return await dbConn
            .select()
            .from(workspaceActivityLog)
            .where(eq(workspaceActivityLog.workspaceId, input.workspaceId))
            .orderBy(desc(workspaceActivityLog.createdAt))
            .limit(input.limit);
        } catch {
          return [];
        }
      }),

    // WS-09: Get workspace members
    getMembers: protectedProcedure
      .input(z.object({ workspaceId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireReadableWorkspaceRoute(ctx.user.id, input.workspaceId);
        const { getWorkspaceMembers } = await import("./workspaces/permissions-service");
        return getWorkspaceMembers(input.workspaceId);
      }),

    // WS-11: Get workspace module bindings
    getModules: protectedProcedure
      .input(z.object({ workspaceId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireReadableWorkspaceRoute(ctx.user.id, input.workspaceId);
        return getWorkspaceModules(input.workspaceId);
      }),

    delete: governedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const workspace = await db.getWorkspaceById(input.id);
        if (!workspace || workspace.ownerId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        // WS-10: Capability enforcement — require workspace.manage for deletion
        await requireCapability(ctx.user.id, input.id, "workspace.manage");
        // WS-04: Cannot delete an already-deleted workspace
        const wsStatus = ((workspace as any).status as WorkspaceStatus) || "active";
        if (isWorkspaceDeleted(wsStatus)) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Workspace is already deleted" });
        }
        // WS-13: Activity traceability — log before deletion
        await logActivity({ workspaceId: input.id, actorId: ctx.user.id, action: "workspace.delete" }).catch(() => {});
        await db.deleteWorkspace(input.id);
        return { success: true };
      }),
  }),

  // Document CRUD (extracted from inline to documents/documents-crud-router.ts)
  documents: documentsCrudRouter,

  // Note: conversations router is imported from ./routers/conversations.ts (line 35)
});

export type AppRouter = typeof appRouter;
