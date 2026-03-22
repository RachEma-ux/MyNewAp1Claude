/**
 * Knowledge Engine — tRPC Router
 * Documents, versions, decisions, search
 * All mutations are governance-gated.
 */

import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { requireModule, logActivity } from "../registry";
import { requireWorkspaceAccess } from "../../workspace/workspace-guards";
import { knowledgeDocuments, documentVersions, decisions } from "./schema";

const documentsRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number(), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "knowledge");
      const db = getDb();
      if (!db) return [];
      const conditions = [eq(knowledgeDocuments.workspaceId, input.workspaceId)];
      if (input.status) conditions.push(eq(knowledgeDocuments.status, input.status));
      return db.select().from(knowledgeDocuments).where(and(...conditions)).orderBy(desc(knowledgeDocuments.updatedAt));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "knowledge");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(knowledgeDocuments)
        .where(and(eq(knowledgeDocuments.id, input.id), eq(knowledgeDocuments.workspaceId, input.workspaceId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
      return rows[0];
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      title: z.string().min(1).max(500),
      content: z.string().optional(),
      contentType: z.enum(["markdown", "text", "html"]).optional(),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "knowledge");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [doc] = await db.insert(knowledgeDocuments).values({
        workspaceId: input.workspaceId,
        title: input.title,
        content: input.content,
        contentType: input.contentType,
        authorId: ctx.user.id,
        tags: input.tags,
        version: 1,
      }).returning();
      // Insert version 1
      await db.insert(documentVersions).values({
        documentId: doc.id,
        version: 1,
        content: input.content,
        changeNote: "Initial version",
        authorId: ctx.user.id,
      });
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "knowledge", actorId: ctx.user.id, action: "doc.create", targetType: "document", targetId: doc.id });
      return doc;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      workspaceId: z.number(),
      title: z.string().optional(),
      content: z.string().optional(),
      status: z.string().optional(),
      tags: z.array(z.string()).optional(),
      changeNote: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "knowledge");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Get current version
      const [current] = await db.select().from(knowledgeDocuments)
        .where(and(eq(knowledgeDocuments.id, input.id), eq(knowledgeDocuments.workspaceId, input.workspaceId)))
        .limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
      const newVersion = current.version + 1;
      const { id, workspaceId, changeNote, ...updates } = input;
      await db.update(knowledgeDocuments).set({ ...updates, version: newVersion, updatedAt: new Date() })
        .where(eq(knowledgeDocuments.id, id));
      // Insert version record if content changed
      if (input.content !== undefined) {
        await db.insert(documentVersions).values({
          documentId: id,
          version: newVersion,
          content: input.content,
          changeNote: changeNote || `Version ${newVersion}`,
          authorId: ctx.user.id,
        });
      }
      await logActivity({ workspaceId, moduleKey: "knowledge", actorId: ctx.user.id, action: "doc.update", targetType: "document", targetId: id });
      return { success: true, version: newVersion };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "knowledge");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(documentVersions).where(eq(documentVersions.documentId, input.id));
      await db.delete(knowledgeDocuments)
        .where(and(eq(knowledgeDocuments.id, input.id), eq(knowledgeDocuments.workspaceId, input.workspaceId)));
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "knowledge", actorId: ctx.user.id, action: "doc.delete", targetType: "document", targetId: input.id });
      return { success: true };
    }),

  versions: protectedProcedure
    .input(z.object({ documentId: z.number(), workspaceId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "knowledge");
      const db = getDb();
      if (!db) return [];
      return db.select().from(documentVersions)
        .where(eq(documentVersions.documentId, input.documentId))
        .orderBy(desc(documentVersions.version));
    }),
});

const decisionsRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "knowledge");
      const db = getDb();
      if (!db) return [];
      return db.select().from(decisions)
        .where(eq(decisions.workspaceId, input.workspaceId))
        .orderBy(desc(decisions.createdAt));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "knowledge");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(decisions)
        .where(and(eq(decisions.id, input.id), eq(decisions.workspaceId, input.workspaceId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Decision not found" });
      return rows[0];
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      title: z.string().min(1).max(500),
      description: z.string().optional(),
      linkedDocumentId: z.number().optional(),
      evidenceRefs: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "knowledge");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(decisions).values({
        workspaceId: input.workspaceId,
        title: input.title,
        description: input.description,
        authorId: ctx.user.id,
        linkedDocumentId: input.linkedDocumentId,
        evidenceRefs: input.evidenceRefs,
      }).returning();
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "knowledge", actorId: ctx.user.id, action: "decision.create", targetType: "decision", targetId: created.id });
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      workspaceId: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.string().optional(),
      outcome: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "knowledge");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, workspaceId, ...updates } = input;
      const setValues: Record<string, unknown> = { ...updates, updatedAt: new Date() };
      if (input.status === "decided") setValues.decidedAt = new Date();
      await db.update(decisions).set(setValues)
        .where(and(eq(decisions.id, id), eq(decisions.workspaceId, workspaceId)));
      await logActivity({ workspaceId, moduleKey: "knowledge", actorId: ctx.user.id, action: "decision.update", targetType: "decision", targetId: id });
      return { success: true };
    }),
});

const searchRouter = router({
  query: protectedProcedure
    .input(z.object({ workspaceId: z.number(), q: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAccess(ctx.user.id, input.workspaceId);
      await requireModule(input.workspaceId, "knowledge");
      const db = getDb();
      if (!db) return [];
      const pattern = `%${input.q}%`;
      return db.select().from(knowledgeDocuments)
        .where(and(
          eq(knowledgeDocuments.workspaceId, input.workspaceId),
          sql`${knowledgeDocuments.title} ILIKE ${pattern}`
        ))
        .orderBy(desc(knowledgeDocuments.updatedAt))
        .limit(50);
    }),
});

export const knowledgeRouter = router({
  documents: documentsRouter,
  decisions: decisionsRouter,
  search: searchRouter,
});
