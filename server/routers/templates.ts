import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { workflowTemplates, workflows } from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const templatesRouter = router({
  // List all public templates
  list: publicProcedure
    .input(z.object({
      category: z.enum(["productivity", "data", "communication", "monitoring"]).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const conditions = [eq(workflowTemplates.isPublic, true)];
      
      if (input?.category) {
        conditions.push(eq(workflowTemplates.category, input.category));
      }
      
      const templates = await db
        .select()
        .from(workflowTemplates)
        .where(and(...conditions))
        .orderBy(desc(workflowTemplates.usageCount), desc(workflowTemplates.createdAt));
      
      return templates;
    }),

  // Get template by ID
  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const template = await db
        .select()
        .from(workflowTemplates)
        .where(eq(workflowTemplates.id, input.id))
        .limit(1);
      
      if (!template[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      }
      
      return template[0];
    }),

  // Create workflow from template
  useTemplate: protectedProcedure
    .input(z.object({
      templateId: z.number(),
      workflowName: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Get template
      const template = await db
        .select()
        .from(workflowTemplates)
        .where(eq(workflowTemplates.id, input.templateId))
        .limit(1);
      
      if (!template[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      }
      
      // Create workflow from template
      const workflowName = input.workflowName || `${template[0].name} (Copy)`;
      const workflowDef = template[0].workflowDefinition as any;
      
      const [newWorkflow] = await db.insert(workflows).values({
        name: workflowName,
        description: template[0].description || "",
        definition: workflowDef,
        userId: ctx.user.id,
        isActive: false,
      } as any);
      
      // Increment usage count
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db
        .update(workflowTemplates)
        .set({ usageCount: (template[0].usageCount || 0) + 1 })
        .where(eq(workflowTemplates.id, input.templateId));
      
      return { workflowId: newWorkflow.insertId, name: workflowName };
    }),

  // Create new template (admin only)
  create: protectedProcedure
    .input(z.object({
      name: z.string(),
      description: z.string().optional(),
      category: z.enum(["productivity", "data", "communication", "monitoring"]),
      workflowDefinition: z.any(),
      icon: z.string().optional(),
      tags: z.array(z.string()).optional(),
      isPublic: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [result] = await db.insert(workflowTemplates).values({
        ...input,
        createdBy: ctx.user.id,
      });
      
      return { id: result.insertId };
    }),

  // Update template
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      category: z.enum(["productivity", "data", "communication", "monitoring"]).optional(),
      workflowDefinition: z.any().optional(),
      icon: z.string().optional(),
      tags: z.array(z.string()).optional(),
      isPublic: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const { id, ...updates } = input;
      
      // Check ownership
      const template = await db
        .select()
        .from(workflowTemplates)
        .where(eq(workflowTemplates.id, id))
        .limit(1);
      
      if (!template[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      }
      
      if (template[0].createdBy !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to update this template" });
      }
      
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db
        .update(workflowTemplates)
        .set(updates)
        .where(eq(workflowTemplates.id, id));
      
      return { success: true };
    }),

  // Delete template
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Check ownership
      const template = await db
        .select()
        .from(workflowTemplates)
        .where(eq(workflowTemplates.id, input.id))
        .limit(1);
      
      if (!template[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      }
      
      if (template[0].createdBy !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to delete this template" });
      }
      
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db
        .delete(workflowTemplates)
        .where(eq(workflowTemplates.id, input.id));
      
      return { success: true };
    }),
});
