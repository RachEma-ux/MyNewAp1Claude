/**
 * Workspace Router — Canonical workspace API surface
 *
 * Provides endpoints for:
 *   - Workspace CRUD (draft creation, update, delete)
 *   - Lifecycle transitions (submit, review, approve, publish, activate, reject, archive)
 *   - Members (team) and crew (AI) management
 *   - Capabilities resolution
 *   - Module management
 *   - Activity log
 *   - Shell view resolution
 *   - WS Catalog (published workspace discovery)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../_core/trpc";
import * as db from "../db";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db/connection";
import {
  workspaces,
  workspaceMembers,
  workspaceCrew,
  workspaceActivityLog,
  type WorkspaceStatus,
  type WorkspacePurposeType,
  WORKSPACE_STATUSES,
  WORKSPACE_PURPOSE_TYPES,
} from "../../drizzle/schema";
import {
  transitionWorkspace,
  submitForReview,
  beginReview,
  approveWorkspace,
  publishWorkspace,
  activateWorkspace,
  rejectWorkspace,
  archiveWorkspace,
  softDeleteWorkspace,
  returnToDraft,
  listPublishedWorkspaces,
  listAllWorkspaces,
  getWorkspaceLifecycleInfo,
} from "./lifecycle-service";
import {
  requireReadableWorkspaceRoute,
  requireExecutableWorkspaceRoute,
  requireCapability,
  requireWorkspaceAccess,
} from "./workspace-guards";
import { resolveWorkspaceContext } from "./workspace-contract";
import { resolveWorkspaceCapabilities } from "./capability-resolver";
import { seedWorkspaceModules, logActivity, getWorkspaceModules } from "../modules/registry";
import { getWorkspaceShellView } from "./shell-view-resolver";

const workspaceStatusEnum = z.enum(WORKSPACE_STATUSES as unknown as [string, ...string[]]);
const purposeTypeEnum = z.enum(WORKSPACE_PURPOSE_TYPES as unknown as [string, ...string[]]);

export const workspaceRouter = router({
  // ============================================================================
  // Workspace CRUD
  // ============================================================================

  /** List workspaces accessible to the current user */
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.getUserWorkspaces(ctx.user.id);
  }),

  /** Create a new workspace as draft */
  createDraft: governedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        type: z.string().optional(),
        purposeType: purposeTypeEnum.optional(),
        purposeRef: z.string().optional(),
        embeddingModel: z.string().optional(),
        chunkingStrategy: z.enum(["semantic", "fixed", "recursive"]).optional(),
        chunkSize: z.number().optional(),
        chunkOverlap: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const PURPOSE_TYPE_MAP: Record<string, string> = {
        personal: "goal",
        project: "project",
        research: "mission",
        team: "team",
        enterprise: "strategy",
        sandbox: "other",
        generic: "other",
      };
      const workspaceType = input.type || "team";
      const workspace = await db.createWorkspace({
        name: input.name,
        description: input.description,
        type: workspaceType,
        ownerId: ctx.user.id,
        status: "draft",
        purposeType: input.purposeType || PURPOSE_TYPE_MAP[workspaceType] || "other",
        purposeRef: input.purposeRef,
        embeddingModel: input.embeddingModel,
        chunkingStrategy: input.chunkingStrategy,
        chunkSize: input.chunkSize,
        chunkOverlap: input.chunkOverlap,
        collectionName: `workspace_${Date.now()}`,
      });
      if (workspace && typeof workspace === "object" && "id" in workspace) {
        try {
          await seedWorkspaceModules((workspace as any).id, workspaceType);
        } catch (err) {
          console.warn(`[Workspace] Failed to seed modules: ${(err as Error).message}`);
        }
        await logActivity({
          workspaceId: (workspace as any).id,
          actorId: ctx.user.id,
          action: "workspace.create",
          metadata: { workspaceType },
        }).catch(() => {});
      }
      return workspace;
    }),

  /** Backward-compatible create alias — creates as draft */
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
      const PURPOSE_TYPE_MAP: Record<string, string> = {
        personal: "goal", project: "project", research: "mission",
        team: "team", enterprise: "strategy", sandbox: "other", generic: "other",
      };
      const workspace = await db.createWorkspace({
        name: input.name,
        description: input.description,
        type: workspaceType,
        ownerId: ctx.user.id,
        status: "draft",
        purposeType: PURPOSE_TYPE_MAP[workspaceType] || "other",
        embeddingModel: input.embeddingModel,
        chunkingStrategy: input.chunkingStrategy,
        chunkSize: input.chunkSize,
        chunkOverlap: input.chunkOverlap,
        collectionName: `workspace_${Date.now()}`,
      });
      if (workspace && typeof workspace === "object" && "id" in workspace) {
        try { await seedWorkspaceModules((workspace as any).id, workspaceType); } catch {}
        await logActivity({ workspaceId: (workspace as any).id, actorId: ctx.user.id, action: "workspace.create", metadata: { workspaceType } }).catch(() => {});
      }
      return workspace;
    }),

  /** Backward-compatible update alias */
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
      await requireWorkspaceAccess(ctx.user.id, input.id);
      const { id, ...updates } = input;
      await db.updateWorkspace(id, { ...updates, updatedAt: new Date() } as any);
      await logActivity({ workspaceId: id, actorId: ctx.user.id, action: "workspace.update", metadata: updates }).catch(() => {});
      return { success: true };
    }),

  /** Backward-compatible getActivity alias */
  getActivity: protectedProcedure
    .input(z.object({ workspaceId: z.number(), limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      await requireReadableWorkspaceRoute(ctx.user.id, input.workspaceId);
      const dbConn = getDb();
      if (!dbConn) return [];
      return dbConn
        .select()
        .from(workspaceActivityLog)
        .where(eq(workspaceActivityLog.workspaceId, input.workspaceId))
        .orderBy(desc(workspaceActivityLog.createdAt))
        .limit(input.limit);
    }),

  /** Backward-compatible getMembers alias */
  getMembers: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireReadableWorkspaceRoute(ctx.user.id, input.workspaceId);
      const { getWorkspaceMembers } = await import("../workspaces/permissions-service");
      return getWorkspaceMembers(input.workspaceId);
    }),

  /** Backward-compatible getModules alias */
  getModules: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireReadableWorkspaceRoute(ctx.user.id, input.workspaceId);
      return getWorkspaceModules(input.workspaceId);
    }),

  /** Get workspace by ID */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const { workspace } = await requireReadableWorkspaceRoute(ctx.user.id, input.id);
      return workspace;
    }),

  /** Update workspace draft/metadata */
  updateDraft: governedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        purposeType: purposeTypeEnum.optional(),
        purposeRef: z.string().optional(),
        type: z.string().optional(),
        embeddingModel: z.string().optional(),
        chunkingStrategy: z.enum(["semantic", "fixed", "recursive"]).optional(),
        chunkSize: z.number().optional(),
        chunkOverlap: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.id);
      const { id, ...updates } = input;
      await db.updateWorkspace(id, { ...updates, updatedAt: new Date() } as any);
      await logActivity({ workspaceId: id, actorId: ctx.user.id, action: "workspace.update", metadata: updates }).catch(() => {});
      return { success: true };
    }),

  /** Get workspace context (full resolved context for execution) */
  getContext: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const wsCtx = await resolveWorkspaceContext(ctx.user.id, input.id);
      if (!wsCtx) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return {
        workspaceId: wsCtx.workspaceId,
        workspaceName: wsCtx.workspaceName,
        status: wsCtx.status,
        purposeType: wsCtx.purposeType,
        userId: wsCtx.userId,
        role: wsCtx.role,
        effectiveCapabilities: [...wsCtx.effectiveCapabilities],
        enabledModules: wsCtx.enabledModules,
        workspaceType: wsCtx.workspaceType,
        routingProfile: wsCtx.routingProfile,
      };
    }),

  // ============================================================================
  // Lifecycle Transitions
  // ============================================================================

  /** Submit workspace for review (draft → ready_for_review) */
  submitForReview: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.id);
      return submitForReview(input.id, ctx.user.id);
    }),

  /** Begin review (ready_for_review → under_review) */
  review: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.id);
      return beginReview(input.id, ctx.user.id);
    }),

  /** Approve workspace (under_review → approved) */
  approve: governedProcedure
    .input(z.object({ id: z.number(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.id);
      return approveWorkspace(input.id, ctx.user.id, input.notes);
    }),

  /** Publish workspace (approved → published) — exposes to WS Catalog */
  publish: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.id);
      return publishWorkspace(input.id, ctx.user.id);
    }),

  /** Activate workspace (published → active) — makes fully executable */
  activate: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.id);
      return activateWorkspace(input.id, ctx.user.id);
    }),

  /** Reject workspace (under_review → rejected) */
  reject: governedProcedure
    .input(z.object({ id: z.number(), reason: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.id);
      return rejectWorkspace(input.id, ctx.user.id, input.reason);
    }),

  /** Archive workspace (active/approved/published → archived) */
  archive: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.id);
      return archiveWorkspace(input.id, ctx.user.id);
    }),

  /** Delete workspace (archived → deleted) */
  delete: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.id);
      return softDeleteWorkspace(input.id, ctx.user.id);
    }),

  /** Return to draft (rejected/archived → draft) */
  returnToDraft: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.id);
      return returnToDraft(input.id, ctx.user.id);
    }),

  /** Get lifecycle info for a workspace */
  getLifecycle: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireReadableWorkspaceRoute(ctx.user.id, input.id);
      return getWorkspaceLifecycleInfo(input.id);
    }),

  // ============================================================================
  // Members (Team — human participation)
  // ============================================================================

  members: router({
    list: protectedProcedure
      .input(z.object({ workspaceId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireReadableWorkspaceRoute(ctx.user.id, input.workspaceId);
        const { getWorkspaceMembers } = await import("../workspaces/permissions-service");
        return getWorkspaceMembers(input.workspaceId);
      }),

    add: governedProcedure
      .input(z.object({
        workspaceId: z.number(),
        userId: z.number(),
        role: z.enum(["editor", "viewer"]),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireCapability(ctx.user.id, input.workspaceId, "workspace.members.invite");
        const { addWorkspaceMember } = await import("../workspaces/permissions-service");
        await addWorkspaceMember(input.workspaceId, input.userId, input.role, ctx.user.id);
        await logActivity({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "workspace.member.add", metadata: { targetUserId: input.userId, role: input.role } }).catch(() => {});
        return { success: true };
      }),

    remove: governedProcedure
      .input(z.object({ workspaceId: z.number(), userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireCapability(ctx.user.id, input.workspaceId, "workspace.members.remove");
        const { removeWorkspaceMember } = await import("../workspaces/permissions-service");
        await removeWorkspaceMember(input.workspaceId, input.userId, ctx.user.id);
        await logActivity({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "workspace.member.remove", metadata: { targetUserId: input.userId } }).catch(() => {});
        return { success: true };
      }),

    updateRole: governedProcedure
      .input(z.object({
        workspaceId: z.number(),
        userId: z.number(),
        role: z.enum(["editor", "viewer"]),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireCapability(ctx.user.id, input.workspaceId, "workspace.members.editRole");
        const { updateMemberRole } = await import("../workspaces/permissions-service");
        await updateMemberRole(input.workspaceId, input.userId, input.role, ctx.user.id);
        return { success: true };
      }),
  }),

  // ============================================================================
  // Crew (AI participation)
  // ============================================================================

  crew: router({
    list: protectedProcedure
      .input(z.object({ workspaceId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireReadableWorkspaceRoute(ctx.user.id, input.workspaceId);
        const dbConn = getDb();
        if (!dbConn) return [];
        return dbConn
          .select()
          .from(workspaceCrew)
          .where(eq(workspaceCrew.workspaceId, input.workspaceId));
      }),

    add: governedProcedure
      .input(z.object({
        workspaceId: z.number(),
        agentId: z.number(),
        agentName: z.string(),
        role: z.string().optional(),
        capabilities: z.array(z.string()).optional(),
        constraints: z.record(z.unknown()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireCapability(ctx.user.id, input.workspaceId, "workspace.manage");
        const dbConn = getDb();
        if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const [crew] = await dbConn
          .insert(workspaceCrew)
          .values({
            workspaceId: input.workspaceId,
            agentId: input.agentId,
            agentName: input.agentName,
            role: input.role || "executor",
            capabilities: input.capabilities || [],
            constraints: input.constraints || {},
          })
          .returning();
        await logActivity({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "workspace.crew.add", metadata: { agentId: input.agentId, agentName: input.agentName } }).catch(() => {});
        return crew;
      }),

    remove: governedProcedure
      .input(z.object({ workspaceId: z.number(), crewId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireCapability(ctx.user.id, input.workspaceId, "workspace.manage");
        const dbConn = getDb();
        if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        await dbConn
          .delete(workspaceCrew)
          .where(and(eq(workspaceCrew.id, input.crewId), eq(workspaceCrew.workspaceId, input.workspaceId)));
        await logActivity({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "workspace.crew.remove", metadata: { crewId: input.crewId } }).catch(() => {});
        return { success: true };
      }),

    update: governedProcedure
      .input(z.object({
        workspaceId: z.number(),
        crewId: z.number(),
        role: z.string().optional(),
        capabilities: z.array(z.string()).optional(),
        constraints: z.record(z.unknown()).optional(),
        enabled: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireCapability(ctx.user.id, input.workspaceId, "workspace.manage");
        const dbConn = getDb();
        if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const { workspaceId, crewId, ...updates } = input;
        await dbConn
          .update(workspaceCrew)
          .set({ ...updates, updatedAt: new Date() })
          .where(and(eq(workspaceCrew.id, crewId), eq(workspaceCrew.workspaceId, workspaceId)));
        return { success: true };
      }),
  }),

  // ============================================================================
  // Capabilities
  // ============================================================================

  capabilities: router({
    resolve: protectedProcedure
      .input(z.object({ workspaceId: z.number() }))
      .query(async ({ ctx, input }) => {
        const caps = await resolveWorkspaceCapabilities(ctx.user.id, input.workspaceId);
        return [...caps];
      }),
  }),

  // ============================================================================
  // Modules
  // ============================================================================

  modules: router({
    list: protectedProcedure
      .input(z.object({ workspaceId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireReadableWorkspaceRoute(ctx.user.id, input.workspaceId);
        return getWorkspaceModules(input.workspaceId);
      }),
  }),

  // ============================================================================
  // Activity Log
  // ============================================================================

  activity: router({
    list: protectedProcedure
      .input(z.object({
        workspaceId: z.number(),
        limit: z.number().min(1).max(100).default(20),
      }))
      .query(async ({ ctx, input }) => {
        await requireReadableWorkspaceRoute(ctx.user.id, input.workspaceId);
        const dbConn = getDb();
        if (!dbConn) return [];
        return dbConn
          .select()
          .from(workspaceActivityLog)
          .where(eq(workspaceActivityLog.workspaceId, input.workspaceId))
          .orderBy(desc(workspaceActivityLog.createdAt))
          .limit(input.limit);
      }),
  }),

  // ============================================================================
  // Shell View
  // ============================================================================

  shell: router({
    view: protectedProcedure
      .input(z.object({ workspaceId: z.number() }))
      .query(async ({ ctx, input }) => {
        return getWorkspaceShellView(input.workspaceId, ctx.user.id);
      }),

    updateConfig: governedProcedure
      .input(z.object({
        workspaceId: z.number(),
        shellConfig: z.any(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireCapability(ctx.user.id, input.workspaceId, "workspace.settings");
        await db.updateWorkspace(input.workspaceId, {
          shellConfig: input.shellConfig,
          updatedAt: new Date(),
        } as any);
        await logActivity({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "workspace.shell.config.update" }).catch(() => {});
        return { success: true };
      }),
  }),

  // ============================================================================
  // Routing Profile
  // ============================================================================

  getRoutingProfile: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const { workspace } = await requireReadableWorkspaceRoute(ctx.user.id, input.id);
      return (workspace as Record<string, unknown>)?.routingProfile || {
        defaultRoute: "AUTO",
        dataSensitivity: "LOW",
        qualityTier: "BALANCED",
        fallback: { enabled: true, maxHops: 3 },
      };
    }),

  updateRoutingProfile: governedProcedure
    .input(
      z.object({
        id: z.number(),
        routingProfile: z.object({
          defaultRoute: z.enum(["AUTO", "LOCAL_ONLY", "CLOUD_ALLOWED"]),
          dataSensitivity: z.enum(["LOW", "MED", "HIGH"]),
          qualityTier: z.enum(["FAST", "BALANCED", "BEST"]),
          fallback: z.object({ enabled: z.boolean(), maxHops: z.number().min(0).max(10) }),
          pinnedProviderId: z.number().optional().nullable(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireExecutableWorkspaceRoute(ctx.user.id, input.id, "workspace.updateRoutingProfile");
      await requireCapability(ctx.user.id, input.id, "workspace.settings");
      await db.updateWorkspace(input.id, { routingProfile: input.routingProfile } as any);
      await logActivity({ workspaceId: input.id, actorId: ctx.user.id, action: "workspace.updateRoutingProfile" }).catch(() => {});
      return { success: true };
    }),
});

// ============================================================================
// WS Catalog Router — Published workspace discovery
// ============================================================================

export const wsCatalogRouter = router({
  /** List published workspaces for participant discovery */
  listPublished: protectedProcedure.query(async () => {
    return listPublishedWorkspaces();
  }),

  /** List all workspaces (management inventory — WS List) */
  listAll: protectedProcedure
    .input(z.object({
      status: workspaceStatusEnum.optional(),
      ownerId: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      return listAllWorkspaces(input as any);
    }),
});
