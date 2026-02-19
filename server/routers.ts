import { z } from "zod";
// Note: Missing import for COOKIE_NAME - will be added by linter
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
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
import { documentsApiRouter } from "./documents/documents-api-router";
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
  documentsManagement: documentsApiRouter,
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

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          description: z.string().optional(),
          embeddingModel: z.string().optional(),
          chunkingStrategy: z.enum(["semantic", "fixed", "recursive"]).optional(),
          chunkSize: z.number().optional(),
          chunkOverlap: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return await db.createWorkspace({
          ...input,
          ownerId: ctx.user.id,
          collectionName: `workspace_${Date.now()}`,
        });
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const hasAccess = await db.hasWorkspaceAccess(ctx.user.id, input.id);
        if (!hasAccess) {
          throw new Error("Access denied");
        }
        return await db.getWorkspaceById(input.id);
      }),

    update: protectedProcedure
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
        const hasAccess = await db.hasWorkspaceAccess(ctx.user.id, input.id);
        if (!hasAccess) {
          throw new Error("Access denied");
        }
        const { id, ...updates } = input;
        await db.updateWorkspace(id, updates);
        return { success: true };
      }),

    // Get workspace routing profile
    getRoutingProfile: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const hasAccess = await db.hasWorkspaceAccess(ctx.user.id, input.id);
        if (!hasAccess) {
          throw new Error("Access denied");
        }
        const workspace = await db.getWorkspaceById(input.id);
        return (workspace as any)?.routingProfile || {
          defaultRoute: 'AUTO',
          dataSensitivity: 'LOW',
          qualityTier: 'BALANCED',
          fallback: { enabled: true, maxHops: 3 },
        };
      }),

    // Update workspace routing profile
    updateRoutingProfile: protectedProcedure
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
        const hasAccess = await db.hasWorkspaceAccess(ctx.user.id, input.id);
        if (!hasAccess) {
          throw new Error("Access denied");
        }
        await db.updateWorkspace(input.id, {
          routingProfile: input.routingProfile,
        } as any);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const workspace = await db.getWorkspaceById(input.id);
        if (!workspace || workspace.ownerId !== ctx.user.id) {
          throw new Error("Access denied");
        }
        await db.deleteWorkspace(input.id);
        return { success: true };
      }),
  }),

  // ============================================================================
  // Model Management
  // ============================================================================
  
  models: router({
    list: protectedProcedure
      .input(z.object({ type: z.enum(["llm", "embedding", "reranker"]).optional() }))
      .query(async ({ input }) => {
        if (input.type) {
          return await db.getModelsByType(input.type);
        }
        return await db.getAllModels();
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getModelById(input.id);
      }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string(),
          displayName: z.string(),
          modelType: z.enum(["llm", "embedding", "reranker"]),
          huggingFaceId: z.string().optional(),
          architecture: z.string().optional(),
          parameterCount: z.string().optional(),
          quantization: z.string().optional(),
          contextLength: z.number().optional(),
          fileSize: z.string().optional(),
          filePath: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return await db.createModel(input);
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["downloading", "converting", "ready", "error"]).optional(),
          downloadProgress: z.number().optional(),
          filePath: z.string().optional(),
          tokensPerSecond: z.number().optional(),
          memoryUsageMb: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...updates } = input;
        await db.updateModel(id, updates);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteModel(input.id);
        return { success: true };
      }),

    // Start model download
    startDownload: protectedProcedure
      .input(
        z.object({
          huggingFaceId: z.string(),
          displayName: z.string(),
          modelType: z.enum(["llm", "embedding", "reranker"]),
          quantization: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        // Create model record with downloading status
        const model = await db.createModel({
          name: input.huggingFaceId,
          displayName: input.displayName,
          modelType: input.modelType,
          huggingFaceId: input.huggingFaceId,
          quantization: input.quantization,
          status: "downloading",
          downloadProgress: 0,
        });

        // TODO: Implement actual download logic with background job
        // For now, simulate progress updates
        setTimeout(async () => {
          await db.updateModel(model.id, { downloadProgress: 50 });
        }, 2000);

        setTimeout(async () => {
          await db.updateModel(model.id, { 
            downloadProgress: 100,
            status: "ready",
            filePath: `/models/${input.huggingFaceId}`,
          });
        }, 5000);

        return model;
      }),
  }),

  // ============================================================================
  // Document Management
  // ============================================================================
  
  documents: router({
    list: protectedProcedure
      .input(z.object({ workspaceId: z.number() }))
      .query(async ({ ctx, input }) => {
        const hasAccess = await db.hasWorkspaceAccess(ctx.user.id, input.workspaceId);
        if (!hasAccess) {
          throw new Error("Access denied");
        }
        return await db.getWorkspaceDocuments(input.workspaceId);
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const document = await db.getDocumentById(input.id);
        if (!document) {
          throw new Error("Document not found");
        }
        const hasAccess = await db.hasWorkspaceAccess(ctx.user.id, document.workspaceId);
        if (!hasAccess) {
          throw new Error("Access denied");
        }
        return document;
      }),

    create: protectedProcedure
      .input(
        z.object({
          workspaceId: z.number(),
          filename: z.string(),
          fileType: z.string(),
          fileSize: z.number(),
          fileUrl: z.string(),
          fileKey: z.string(),
          title: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const hasAccess = await db.hasWorkspaceAccess(ctx.user.id, input.workspaceId);
        if (!hasAccess) {
          throw new Error("Access denied");
        }
        return await db.createDocument({
          ...input,
          uploadedBy: ctx.user.id,
        });
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["pending", "processing", "completed", "error"]).optional(),
          errorMessage: z.string().optional(),
          chunkCount: z.number().optional(),
          embeddingModel: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const document = await db.getDocumentById(input.id);
        if (!document) {
          throw new Error("Document not found");
        }
        const hasAccess = await db.hasWorkspaceAccess(ctx.user.id, document.workspaceId);
        if (!hasAccess) {
          throw new Error("Access denied");
        }
        const { id, ...updates } = input;
        await db.updateDocument(id, updates);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const document = await db.getDocumentById(input.id);
        if (!document) {
          throw new Error("Document not found");
        }
        const hasAccess = await db.hasWorkspaceAccess(ctx.user.id, document.workspaceId);
        if (!hasAccess) {
          throw new Error("Access denied");
        }
        await db.deleteDocument(input.id);
        return { success: true };
      }),

    // Upload and process document
    upload: protectedProcedure
      .input(
        z.object({
          workspaceId: z.number(),
          filename: z.string(),
          fileType: z.string(),
          fileSize: z.number(),
          fileContent: z.string(), // Base64 encoded
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { processDocumentUpload } = await import("./documents/processor");
        const hasAccess = await db.hasWorkspaceAccess(ctx.user.id, input.workspaceId);
        if (!hasAccess) {
          throw new Error("Access denied");
        }
        return await processDocumentUpload(input, ctx.user.id);
      }),

    // Get document chunks
    getChunks: protectedProcedure
      .input(z.object({ documentId: z.number() }))
      .query(async ({ ctx, input }) => {
        const { getDocumentChunks } = await import("./documents/db");
        const document = await db.getDocumentById(input.documentId);
        if (!document) {
          throw new Error("Document not found");
        }
        const hasAccess = await db.hasWorkspaceAccess(ctx.user.id, document.workspaceId);
        if (!hasAccess) {
          throw new Error("Access denied");
        }
        return await getDocumentChunks(input.documentId);
      }),
  }),

  // Agent management is now handled by agentsRouter
  // See server/agents/router.ts
  
  // ============================================================================
  // Legacy Agent Management (to be removed)
  // ============================================================================
  
  agentsLegacy: router({
    list: protectedProcedure
      .input(z.object({ workspaceId: z.number() }))
      .query(async ({ ctx, input }) => {
        const hasAccess = await db.hasWorkspaceAccess(ctx.user.id, input.workspaceId);
        if (!hasAccess) {
          throw new Error("Access denied");
        }
        return await db.getWorkspaceAgents(input.workspaceId);
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const agent = await db.getAgentById(input.id);
        if (!agent) {
          throw new Error("Agent not found");
        }
        const hasAccess = await db.hasWorkspaceAccess(ctx.user.id, agent.workspaceId);
        if (!hasAccess) {
          throw new Error("Access denied");
        }
        return agent;
      }),

    create: protectedProcedure
      .input(
        z.object({
          workspaceId: z.number(),
          name: z.string(),
          description: z.string().optional(),
          systemPrompt: z.string(),
          modelId: z.string().optional(),
          roleClass: z.string().optional(),
          temperature: z.string().optional(),
          hasDocumentAccess: z.boolean().optional(),
          hasToolAccess: z.boolean().optional(),
          allowedTools: z.array(z.string()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const hasAccess = await db.hasWorkspaceAccess(ctx.user.id, input.workspaceId);
        if (!hasAccess) {
          throw new Error("Access denied");
        }
        return await db.createAgent({
          ...input,
          modelId: input.modelId || "default",
          roleClass: input.roleClass || "general",
          createdBy: ctx.user.id,
        });
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().optional(),
          systemPrompt: z.string().optional(),
          modelId: z.string().optional(),
          temperature: z.string().optional(),
          hasDocumentAccess: z.boolean().optional(),
          hasToolAccess: z.boolean().optional(),
          allowedTools: z.array(z.string()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const agent = await db.getAgentById(input.id);
        if (!agent) {
          throw new Error("Agent not found");
        }
        const hasAccess = await db.hasWorkspaceAccess(ctx.user.id, agent.workspaceId);
        if (!hasAccess) {
          throw new Error("Access denied");
        }
        const { id, ...updates } = input;
        await db.updateAgent(id, updates);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const agent = await db.getAgentById(input.id);
        if (!agent) {
          throw new Error("Agent not found");
        }
        const hasAccess = await db.hasWorkspaceAccess(ctx.user.id, agent.workspaceId);
        if (!hasAccess) {
          throw new Error("Access denied");
        }
        await db.deleteAgent(input.id);
        return { success: true };
      }),
  }),

  // Note: conversations router is imported from ./routers/conversations.ts (line 35)
});

export type AppRouter = typeof appRouter;
