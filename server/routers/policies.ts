import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { policies, policyTemplates } from "../../drizzle/schema";
import { eq, and, ne } from "drizzle-orm";
import { extractPolicyRules } from "../services/policyEvaluation";
import crypto from "crypto";

export const policiesRouter = router({
  // List all policies for current workspace
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const workspaceId = ctx.user.id;

    const policyList = await db
      .select()
      .from(policies)
      .where(
        and(
          eq(policies.workspaceId, workspaceId),
          eq(policies.isTemplate, false)
        )
      );

    return policyList;
  }),

  // Get single policy by ID
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const workspaceId = ctx.user.id;

      const policy = await db
        .select()
        .from(policies)
        .where(
          and(
            eq(policies.id, input.id),
            eq(policies.workspaceId, workspaceId)
          )
        )
        .limit(1);

      if (!policy[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Policy not found",
        });
      }

      return policy[0];
    }),

  // Create new policy
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        content: z.record(z.any()),
        isTemplate: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const workspaceId = ctx.user.id;

      // Calculate hash of content
      const hash = crypto
        .createHash("sha256")
        .update(JSON.stringify(input.content))
        .digest("hex");

      // Extract rules from content
      const rules = extractPolicyRules(input.content);

      // Deactivate other policies if this is being set as active
      if (input.isTemplate === false) {
        await db
          .update(policies)
          .set({ isActive: false })
          .where(
            and(
              eq(policies.workspaceId, workspaceId),
              eq(policies.isTemplate, false)
            )
          );
      }

      await db.insert(policies).values({
        workspaceId,
        createdBy: ctx.user.id,
        name: input.name,
        description: input.description,
        content: input.content as any,
        hash,
        rules: rules as any,
        isActive: true,
        isTemplate: input.isTemplate,
      } as any);

      return { success: true };
    }),

  // Update policy
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        content: z.record(z.any()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const workspaceId = ctx.user.id;

      // Verify ownership
      const policy = await db
        .select()
        .from(policies)
        .where(
          and(
            eq(policies.id, input.id),
            eq(policies.workspaceId, workspaceId)
          )
        )
        .limit(1);

      if (!policy[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Policy not found",
        });
      }

      const updateData: any = {
        updatedAt: new Date(),
      };

      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.content !== undefined) {
        updateData.content = input.content;
        updateData.hash = crypto
          .createHash("sha256")
          .update(JSON.stringify(input.content))
          .digest("hex");
        updateData.rules = extractPolicyRules(input.content);
      }

      await db
        .update(policies)
        .set(updateData)
        .where(eq(policies.id, input.id));

      return { success: true };
    }),

  // Delete policy
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const workspaceId = ctx.user.id;

      // Verify ownership
      const policy = await db
        .select()
        .from(policies)
        .where(
          and(
            eq(policies.id, input.id),
            eq(policies.workspaceId, workspaceId)
          )
        )
        .limit(1);

      if (!policy[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Policy not found",
        });
      }

      if (policy[0].isActive) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete the active policy",
        });
      }

      await db.delete(policies).where(eq(policies.id, input.id));

      return { success: true };
    }),

  // Activate policy
  activate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const workspaceId = ctx.user.id;

      // Verify ownership
      const policy = await db
        .select()
        .from(policies)
        .where(
          and(
            eq(policies.id, input.id),
            eq(policies.workspaceId, workspaceId)
          )
        )
        .limit(1);

      if (!policy[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Policy not found",
        });
      }

      // Deactivate all other policies
      await db
        .update(policies)
        .set({ isActive: false })
        .where(
          and(
            eq(policies.workspaceId, workspaceId),
            ne(policies.id, input.id)
          )
        );

      // Activate this policy
      await db
        .update(policies)
        .set({ isActive: true })
        .where(eq(policies.id, input.id));

      return { success: true };
    }),

  // Get active policy
  getActive: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const workspaceId = ctx.user.id;

    const activePolicy = await db
      .select()
      .from(policies)
      .where(
        and(
          eq(policies.workspaceId, workspaceId),
          eq(policies.isActive, true),
          eq(policies.isTemplate, false)
        )
      )
      .limit(1);

    return activePolicy[0] || null;
  }),

  // List policy templates
  listTemplates: protectedProcedure.query(async () => {
    const db = getDb();

    const templates = await db.select().from(policyTemplates);

    return templates;
  }),

  // Get policy template
  getTemplate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();

      const template = await db
        .select()
        .from(policyTemplates)
        .where(eq(policyTemplates.id, input.id))
        .limit(1);

      if (!template[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }

      return template[0];
    }),

  // Create policy from template
  createFromTemplate: protectedProcedure
    .input(
      z.object({
        templateId: z.number(),
        name: z.string().min(1).max(255),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const workspaceId = ctx.user.id;

      // Get template
      const template = await db
        .select()
        .from(policyTemplates)
        .where(eq(policyTemplates.id, input.templateId))
        .limit(1);

      if (!template[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }

      // Create policy from template
      const hash = crypto
        .createHash("sha256")
        .update(JSON.stringify(template[0].content))
        .digest("hex");

      await db.insert(policies).values({
        workspaceId,
        createdBy: ctx.user.id,
        name: input.name,
        description: input.description,
        content: template[0].content as any,
        hash,
        rules: template[0].rules as any,
        isActive: true,
        isTemplate: false,
      } as any);

      // Increment template usage count
      await db
        .update(policyTemplates)
        .set({ usageCount: (template[0].usageCount || 0) + 1 })
        .where(eq(policyTemplates.id, input.templateId));

      return { success: true };
    }),
});
