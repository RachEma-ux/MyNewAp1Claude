import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, governedProcedure, router } from "../_core/trpc";
import * as db from "../db";

/**
 * Documents CRUD Router
 * Handles basic document CRUD operations with workspace access checks.
 * Formerly inline in server/routers.ts.
 */
export const documentsCrudRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ ctx, input }) => {
      const hasAccess = await db.hasWorkspaceAccess(ctx.user.id, input.workspaceId);
      if (!hasAccess) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return await db.getWorkspaceDocuments(input.workspaceId);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const document = await db.getDocumentById(input.id);
      if (!document) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
      }
      const hasAccess = await db.hasWorkspaceAccess(ctx.user.id, document.workspaceId);
      if (!hasAccess) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return document;
    }),

  create: governedProcedure
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
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return await db.createDocument({
        ...input,
        uploadedBy: ctx.user.id,
      });
    }),

  update: governedProcedure
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
        throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
      }
      const hasAccess = await db.hasWorkspaceAccess(ctx.user.id, document.workspaceId);
      if (!hasAccess) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      const { id, ...updates } = input;
      await db.updateDocument(id, updates);
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const document = await db.getDocumentById(input.id);
      if (!document) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
      }
      const hasAccess = await db.hasWorkspaceAccess(ctx.user.id, document.workspaceId);
      if (!hasAccess) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      await db.deleteDocument(input.id);
      return { success: true };
    }),

  upload: governedProcedure
    .input(
      z.object({
        workspaceId: z.number(),
        filename: z.string(),
        fileType: z.string(),
        fileSize: z.number(),
        fileContent: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { processDocumentUpload } = await import("./processor");
      const hasAccess = await db.hasWorkspaceAccess(ctx.user.id, input.workspaceId);
      if (!hasAccess) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return await processDocumentUpload(input, ctx.user.id);
    }),

  bulkDelete: governedProcedure
    .input(z.object({ documentIds: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      const { bulkDeleteDocuments } = await import("../db");
      await bulkDeleteDocuments(input.documentIds);
      return { success: true };
    }),

  getChunks: protectedProcedure
    .input(z.object({ documentId: z.number() }))
    .query(async ({ ctx, input }) => {
      const { getDocumentChunks } = await import("./db");
      const document = await db.getDocumentById(input.documentId);
      if (!document) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
      }
      const hasAccess = await db.hasWorkspaceAccess(ctx.user.id, document.workspaceId);
      if (!hasAccess) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return await getDocumentChunks(input.documentId);
    }),
});
