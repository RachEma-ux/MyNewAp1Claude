import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { protocols } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const protocolsRouter = router({
  // List all protocols in a workspace
  list: protectedProcedure
    .input(z.object({
      workspaceId: z.number().optional(),
      search: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const workspaceId = input.workspaceId || 1; // Default workspace

      let query = db
        .select()
        .from(protocols)
        .where(eq(protocols.workspaceId, workspaceId))
        .orderBy(desc(protocols.updatedAt));

      const results = await query;

      // Filter by search term if provided
      if (input.search) {
        const searchLower = input.search.toLowerCase();
        return results.filter(p => 
          p.name.toLowerCase().includes(searchLower) ||
          p.description?.toLowerCase().includes(searchLower) ||
          p.content.toLowerCase().includes(searchLower)
        );
      }

      return results;
    }),

  // Get single protocol
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [protocol] = await db
        .select()
        .from(protocols)
        .where(eq(protocols.id, input.id));

      if (!protocol) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Protocol not found" });
      }

      return protocol;
    }),

  // Create new protocol
  create: protectedProcedure
    .input(z.object({
      workspaceId: z.number().optional(),
      name: z.string().min(1),
      description: z.string().optional(),
      content: z.string().min(1),
      fileName: z.string().optional(),
      fileSize: z.number().optional(),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const workspaceId = input.workspaceId || 1;

      const [result] = await db.insert(protocols).values({
        workspaceId,
        name: input.name,
        description: input.description,
        content: input.content,
        fileName: input.fileName,
        fileSize: input.fileSize,
        tags: input.tags || [],
        createdBy: ctx.user.id,
      }).returning();

      return { id: result.id };
    }),

  // Update protocol
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      content: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { id, ...updates } = input;

      // Verify protocol exists
      const [existing] = await db
        .select()
        .from(protocols)
        .where(eq(protocols.id, id));

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Protocol not found" });
      }

      // Increment version on content update
      const updateData: any = { ...updates };
      if (input.content) {
        updateData.version = (existing.version || 1) + 1;
      }

      await db
        .update(protocols)
        .set(updateData)
        .where(eq(protocols.id, id));

      return { success: true };
    }),

  // Delete protocol
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Verify protocol exists
      const [existing] = await db
        .select()
        .from(protocols)
        .where(eq(protocols.id, input.id));

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Protocol not found" });
      }

      await db
        .delete(protocols)
        .where(eq(protocols.id, input.id));

      return { success: true };
    }),

  // Upload protocol from file
  uploadFromFile: protectedProcedure
    .input(z.object({
      workspaceId: z.number().optional(),
      name: z.string().min(1),
      description: z.string().optional(),
      content: z.string().min(1),
      fileName: z.string(),
      fileSize: z.number(),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const workspaceId = input.workspaceId || 1;

      // Validate file extension
      if (!input.fileName.endsWith('.md')) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only .md files are allowed" });
      }

      const [result] = await db.insert(protocols).values({
        workspaceId,
        name: input.name,
        description: input.description,
        content: input.content,
        fileName: input.fileName,
        fileSize: input.fileSize,
        tags: input.tags || [],
        createdBy: ctx.user.id,
      }).returning();

      return { id: result.id };
    }),
});
