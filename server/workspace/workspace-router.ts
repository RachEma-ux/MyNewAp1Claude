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
import { eq, and, desc, inArray } from "drizzle-orm";
import { getDb } from "../db/connection";
import {
  users,
  workspaces,
  workspaceMembers,
  workspaceCrew,
  workspaceActivityLog,
  type WorkspaceStatus,
  type WorkspacePurposeType,
  type WizardMeta,
  WORKSPACE_STATUSES,
  WORKSPACE_PURPOSE_TYPES,
  WORKSPACE_ANCHOR_TYPES,
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
  validateDraftCompleteness,
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
        crew: z.array(z.object({
          participantType: z.enum(["agent", "bot"]).default("agent"),
          participantId: z.number(),
          participantName: z.string(),
          role: z.string().default("executor"),
          note: z.string().optional(),
        })).optional(),
        wizardMeta: z.record(z.unknown()).optional(),
        submitForReview: z.boolean().optional(),
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
        purposeStatement: (input.wizardMeta as any)?.purposeStatement || null,
        purposeRef: input.purposeRef,
        embeddingModel: input.embeddingModel,
        chunkingStrategy: input.chunkingStrategy,
        chunkSize: input.chunkSize,
        chunkOverlap: input.chunkOverlap,
        collectionName: `workspace_${Date.now()}`,
        wizardMeta: input.wizardMeta as WizardMeta | undefined,
      } as any);
      if (workspace && typeof workspace === "object" && "id" in workspace) {
        const wsId = (workspace as any).id;
        try {
          await seedWorkspaceModules(wsId, workspaceType);
        } catch (err) {
          console.warn(`[Workspace] Failed to seed modules: ${(err as Error).message}`);
        }
        // Sync wizardMeta.configuration to real workspace columns
        if (input.wizardMeta && (input.wizardMeta as any).configuration) {
          const cfg = (input.wizardMeta as any).configuration;
          const configUpdates: Record<string, unknown> = {};
          if (cfg.routingProfile) {
            configUpdates.routingProfile = {
              defaultRoute: cfg.routingProfile,
              dataSensitivity: "LOW",
              qualityTier: "BALANCED",
              fallback: { enabled: true, maxHops: 3 },
            };
          }
          if (cfg.resourceProfile) {
            const RESOURCE_PRESETS: Record<string, any> = {
              minimal: { computeQuota: 100, storageQuota: 1024, apiCallQuota: 1000 },
              standard: { computeQuota: 500, storageQuota: 5120, apiCallQuota: 5000 },
              elevated: { computeQuota: 2000, storageQuota: 20480, apiCallQuota: 20000 },
              unrestricted: { computeQuota: 0, storageQuota: 0, apiCallQuota: 0 },
            };
            configUpdates.resourceProfile = RESOURCE_PRESETS[cfg.resourceProfile] || {};
          }
          // Sync shellConfig from shellVisibility
          if (cfg.shellVisibility) {
            const isRestricted = cfg.shellVisibility === "restricted" || cfg.shellVisibility === "private";
            configUpdates.shellConfig = {
              sidebar: {
                showIdentity: true, showPurpose: true, showMission: true,
                showCurrentWork: true, showActivityLog: true, showAlerts: !isRestricted,
                showQuickActions: true, showGuide: true, showHealth: true,
              },
              toolbar: { visibleItems: [], priorityItems: [] },
              quickActions: [],
              alertsEnabled: !isRestricted,
              missionEmphasis: null,
              participantVisibility: {},
            };
          }
          if (Object.keys(configUpdates).length > 0) {
            try {
              await db.updateWorkspace(wsId, configUpdates as any);
            } catch (err) {
              console.warn(`[Workspace] Failed to sync config columns: ${(err as Error).message}`);
            }
          }
        }
        // Persist crew entries if provided
        if (input.crew && input.crew.length > 0) {
          const dbConn = getDb();
          if (dbConn) {
            try {
              await dbConn.insert(workspaceCrew).values(
                input.crew.map((c) => ({
                  workspaceId: wsId,
                  agentId: c.participantId,
                  agentName: c.participantName,
                  participantType: c.participantType || "agent",
                  role: c.role || "executor",
                  note: c.note || null,
                  capabilities: [],
                  constraints: {},
                }))
              );
            } catch (err) {
              console.warn(`[Workspace] Failed to persist crew: ${(err as Error).message}`);
            }
          }
        }
        // Persist team members from wizardMeta to workspace_members table
        if (input.wizardMeta && (input.wizardMeta as any).team) {
          const dbConn = getDb();
          if (dbConn) {
            try {
              const teamData = (input.wizardMeta as any).team;
              const ROLE_MAP: Record<string, string> = { owner: "owner", manager: "editor", member: "editor", viewer: "viewer" };
              const teamRows: Array<{ workerId: number; displayName: string; role: string }> = [];
              if (teamData.owner) teamRows.push({ ...teamData.owner, role: "owner" });
              for (const m of teamData.managers || []) teamRows.push({ ...m, role: "manager" });
              for (const m of teamData.members || []) teamRows.push({ ...m, role: "member" });
              for (const m of teamData.viewers || []) teamRows.push({ ...m, role: "viewer" });
              // Insert non-owner team members (owner already inserted by createWorkspace)
              const nonOwner = teamRows.filter((t) => t.role !== "owner");
              if (nonOwner.length > 0) {
                // Validate workerIds exist as user IDs before inserting
                const workerIds = nonOwner.map((t) => t.workerId);
                const validUsers = await dbConn.select({ id: users.id }).from(users)
                  .where(inArray(users.id, workerIds));
                const validIds = new Set(validUsers.map((u) => u.id));
                const validMembers = nonOwner.filter((t) => validIds.has(t.workerId));
                const skipped = nonOwner.filter((t) => !validIds.has(t.workerId));
                if (skipped.length > 0) {
                  console.warn(`[Workspace] Skipped ${skipped.length} team member(s) with invalid user IDs: ${skipped.map((t) => t.workerId).join(", ")}`);
                }
                if (validMembers.length > 0) {
                  await dbConn.insert(workspaceMembers).values(
                    validMembers.map((t) => ({
                      workspaceId: wsId,
                      userId: t.workerId,
                      role: ROLE_MAP[t.role] || "viewer",
                    }))
                  );
                }
              }
            } catch (err) {
              console.warn(`[Workspace] Failed to persist team members: ${(err as Error).message}`);
            }
          }
        }
        await logActivity({
          workspaceId: wsId,
          actorId: ctx.user.id,
          action: "workspace.create",
          metadata: { workspaceType, crewCount: input.crew?.length ?? 0, teamCount: ((input.wizardMeta as any)?.team ? Object.values((input.wizardMeta as any).team).flat().length : 0) },
        }).catch(() => {});
        // Admin shortcut: create draft + submit for review in one action
        if (input.submitForReview) {
          try {
            await submitForReview(wsId, ctx.user.id);
          } catch (err) {
            console.warn(`[Workspace] Auto-submit for review failed: ${(err as Error).message}`);
          }
        }
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
        crew: z.array(z.object({
          participantType: z.enum(["agent", "bot"]).default("agent"),
          participantId: z.number(),
          participantName: z.string(),
          role: z.string().default("executor"),
          note: z.string().optional(),
        })).optional(),
        wizardMeta: z.record(z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.id);
      const { id, crew, wizardMeta, ...updates } = input;
      const dbUpdates: Record<string, unknown> = { ...updates, updatedAt: new Date() };
      if (wizardMeta !== undefined) {
        dbUpdates.wizardMeta = wizardMeta;
        // Sync purposeStatement to dedicated column
        if ((wizardMeta as any).purposeStatement !== undefined) {
          dbUpdates.purposeStatement = (wizardMeta as any).purposeStatement || null;
        }
        // Sync wizardMeta.configuration to real workspace columns
        const cfg = (wizardMeta as any).configuration;
        if (cfg) {
          if (cfg.routingProfile) {
            dbUpdates.routingProfile = {
              defaultRoute: cfg.routingProfile,
              dataSensitivity: "LOW",
              qualityTier: "BALANCED",
              fallback: { enabled: true, maxHops: 3 },
            };
          }
          if (cfg.resourceProfile) {
            const RESOURCE_PRESETS: Record<string, any> = {
              minimal: { computeQuota: 100, storageQuota: 1024, apiCallQuota: 1000 },
              standard: { computeQuota: 500, storageQuota: 5120, apiCallQuota: 5000 },
              elevated: { computeQuota: 2000, storageQuota: 20480, apiCallQuota: 20000 },
              unrestricted: { computeQuota: 0, storageQuota: 0, apiCallQuota: 0 },
            };
            dbUpdates.resourceProfile = RESOURCE_PRESETS[cfg.resourceProfile] || {};
          }
          // Sync shellConfig from shellVisibility
          if (cfg.shellVisibility) {
            const isRestricted = cfg.shellVisibility === "restricted" || cfg.shellVisibility === "private";
            dbUpdates.shellConfig = {
              sidebar: {
                showIdentity: true, showPurpose: true, showMission: true,
                showCurrentWork: true, showActivityLog: true, showAlerts: !isRestricted,
                showQuickActions: true, showGuide: true, showHealth: true,
              },
              toolbar: { visibleItems: [], priorityItems: [] },
              quickActions: [],
              alertsEnabled: !isRestricted,
              missionEmphasis: null,
              participantVisibility: {},
            };
          }
        }
      }
      await db.updateWorkspace(id, dbUpdates as any);
      // Sync crew if provided: delete existing, re-insert
      if (crew !== undefined) {
        const dbConn = getDb();
        if (dbConn) {
          await dbConn.delete(workspaceCrew).where(eq(workspaceCrew.workspaceId, id));
          if (crew.length > 0) {
            await dbConn.insert(workspaceCrew).values(
              crew.map((c) => ({
                workspaceId: id,
                agentId: c.participantId,
                agentName: c.participantName,
                participantType: c.participantType || "agent",
                role: c.role || "executor",
                note: c.note || null,
                capabilities: [] as string[],
                constraints: {} as Record<string, unknown>,
              }))
            );
          }
        }
      }
      // Sync team members from wizardMeta to workspace_members table
      if (wizardMeta && (wizardMeta as any).team) {
        const dbConn = getDb();
        if (dbConn) {
          try {
            const teamData = (wizardMeta as any).team;
            const ROLE_MAP: Record<string, string> = { owner: "owner", manager: "editor", member: "editor", viewer: "viewer" };
            const teamRows: Array<{ workerId: number; role: string }> = [];
            if (teamData.owner) teamRows.push({ workerId: teamData.owner.workerId, role: "owner" });
            for (const m of teamData.managers || []) teamRows.push({ workerId: m.workerId, role: "manager" });
            for (const m of teamData.members || []) teamRows.push({ workerId: m.workerId, role: "member" });
            for (const m of teamData.viewers || []) teamRows.push({ workerId: m.workerId, role: "viewer" });
            // Delete non-owner members, then re-insert (preserve original owner row)
            const currentMembers = await dbConn.select().from(workspaceMembers)
              .where(eq(workspaceMembers.workspaceId, id));
            const ownerRow = currentMembers.find((m) => m.role === "owner");
            // Remove all non-owner members
            for (const m of currentMembers.filter((m) => m.role !== "owner")) {
              await dbConn.delete(workspaceMembers)
                .where(and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.id, m.id)));
            }
            // Re-insert non-owner team members (validate workerIds exist as user IDs)
            const nonOwner = teamRows.filter((t) => t.role !== "owner");
            if (nonOwner.length > 0) {
              const workerIds = nonOwner.map((t) => t.workerId);
              const validUsers = await dbConn.select({ id: users.id }).from(users)
                .where(inArray(users.id, workerIds));
              const validIds = new Set(validUsers.map((u) => u.id));
              const validMembers = nonOwner.filter((t) => validIds.has(t.workerId));
              const skipped = nonOwner.filter((t) => !validIds.has(t.workerId));
              if (skipped.length > 0) {
                console.warn(`[Workspace] Skipped ${skipped.length} team member(s) with invalid user IDs: ${skipped.map((t) => t.workerId).join(", ")}`);
              }
              if (validMembers.length > 0) {
                await dbConn.insert(workspaceMembers).values(
                  validMembers.map((t) => ({
                    workspaceId: id,
                    userId: t.workerId,
                    role: ROLE_MAP[t.role] || "viewer",
                  }))
                );
              }
            }
          } catch (err) {
            console.warn(`[Workspace] Failed to sync team members: ${(err as Error).message}`);
          }
        }
      }
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

  /** Begin review (ready_for_review → under_review) — admin/governance only */
  review: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Begin Review requires admin role" });
      await requireWorkspaceAccess(ctx.user.id, input.id);
      return beginReview(input.id, ctx.user.id);
    }),

  /** Approve workspace (under_review → approved) — admin/governance only */
  approve: governedProcedure
    .input(z.object({ id: z.number(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Approve requires admin role" });
      await requireWorkspaceAccess(ctx.user.id, input.id);
      return approveWorkspace(input.id, ctx.user.id, input.notes);
    }),

  /** Publish workspace (approved → published) — admin/governance only */
  publish: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Publish requires admin role" });
      await requireWorkspaceAccess(ctx.user.id, input.id);
      return publishWorkspace(input.id, ctx.user.id);
    }),

  /** Activate workspace (published → active) — admin/governance only */
  activate: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Activate requires admin role" });
      await requireWorkspaceAccess(ctx.user.id, input.id);
      return activateWorkspace(input.id, ctx.user.id);
    }),

  /** Reject workspace (under_review → rejected) — admin/governance only */
  reject: governedProcedure
    .input(z.object({ id: z.number(), reason: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Reject requires admin role" });
      await requireWorkspaceAccess(ctx.user.id, input.id);
      return rejectWorkspace(input.id, ctx.user.id, input.reason);
    }),

  /** Archive workspace — admin/governance only */
  archive: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Archive requires admin role" });
      await requireWorkspaceAccess(ctx.user.id, input.id);
      return archiveWorkspace(input.id, ctx.user.id);
    }),

  /** Delete workspace (archived → deleted) — admin/governance only */
  delete: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Delete requires admin role" });
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

  /** Get governance-readable review packet for a workspace */
  getReviewPacket: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireReadableWorkspaceRoute(ctx.user.id, input.id);
      const dbConn = getDb();
      if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Load workspace
      const [ws] = await dbConn.select().from(workspaces)
        .where(eq(workspaces.id, input.id)).limit(1);
      if (!ws) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });

      const meta = ((ws as any).wizardMeta || {}) as Record<string, any>;

      // Load team members
      const members = await dbConn.select().from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, input.id));

      // Load crew
      const crew = await dbConn.select().from(workspaceCrew)
        .where(eq(workspaceCrew.workspaceId, input.id));

      // Compute readiness
      const completeness = await validateDraftCompleteness(input.id);
      const lifecycle = await getWorkspaceLifecycleInfo(input.id);

      return {
        identity: {
          name: ws.name,
          description: ws.description,
          type: ws.type,
          ownerId: ws.ownerId,
          status: ws.status,
        },
        purpose: {
          purposeType: ws.purposeType,
          purposeStatement: meta.purposeStatement || null,
          purposeRef: ws.purposeRef,
        },
        anchor: {
          anchorType: meta.anchorType || null,
          anchorRef: meta.anchorRef || null,
          anchorLabel: meta.anchorLabel || null,
          anchorMeta: meta.anchorMeta || null,
        },
        team: members.map((m) => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
        })),
        crew: crew.map((c) => ({
          id: c.id,
          agentId: c.agentId,
          agentName: c.agentName,
          participantType: c.participantType,
          role: c.role,
          note: c.note,
          enabled: c.enabled,
        })),
        activities: meta.activities || null,
        needs: meta.needs || null,
        configuration: {
          wizardConfig: meta.configuration || null,
          embeddingModel: ws.embeddingModel,
          chunkingStrategy: ws.chunkingStrategy,
          routingProfile: (ws as any).routingProfile || null,
          resourceProfile: (ws as any).resourceProfile || null,
          shellConfig: (ws as any).shellConfig || null,
        },
        readiness: {
          complete: completeness.complete,
          missingFields: completeness.missingFields,
        },
        lifecycle: lifecycle,
      };
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
        participantType: z.enum(["agent", "bot"]).default("agent"),
        role: z.string().optional(),
        note: z.string().optional(),
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
            participantType: input.participantType || "agent",
            role: input.role || "executor",
            note: input.note || null,
            capabilities: input.capabilities || [],
            constraints: input.constraints || {},
          })
          .returning();
        await logActivity({ workspaceId: input.workspaceId, actorId: ctx.user.id, action: "workspace.crew.add", metadata: { agentId: input.agentId, agentName: input.agentName, participantType: input.participantType } }).catch(() => {});
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

    /** Log wizard step completion for audit trail */
    logWizardStep: protectedProcedure
      .input(z.object({
        workspaceId: z.number(),
        stepNumber: z.number().min(1).max(10),
        stepId: z.string(),
        phase: z.enum(["manager", "admin", "governance"]),
      }))
      .mutation(async ({ ctx, input }) => {
        await logActivity({
          workspaceId: input.workspaceId,
          actorId: ctx.user.id,
          action: "workspace.wizard.step.complete",
          metadata: {
            stepNumber: input.stepNumber,
            stepId: input.stepId,
            phase: input.phase,
          },
        }).catch(() => {});
        return { success: true };
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
