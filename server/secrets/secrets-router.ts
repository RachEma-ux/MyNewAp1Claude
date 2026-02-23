import { z } from "zod";
import { router, protectedProcedure, governedProcedure } from "../_core/trpc";
import {
  createSecret,
  getSecretById,
  listSecrets,
  updateSecret,
  deleteSecret,
} from "./secrets-service";
import { getAuditLogger } from "../services/auditLogger";

export const secretsRouter = router({
  /**
   * Create a new secret
   */
  create: governedProcedure
    .input(
      z.object({
        key: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_-]+$/, "Key must contain only letters, numbers, underscores, and hyphens"),
        value: z.string().min(1),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const secret = await createSecret({
        userId: ctx.user.id,
        key: input.key,
        value: input.value,
        description: input.description,
      });
      getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "SECRET_CREATE",
        target_type: "secret",
        target_id: String(secret.id),
        decision_result: "success",
        metadata: { key: input.key },
      });
      return secret;
    }),

  /**
   * List all secrets for current user
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    return await listSecrets(ctx.user.id);
  }),

  /**
   * Get a specific secret by ID
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      return await getSecretById(input.id, ctx.user.id);
    }),

  /**
   * Update a secret
   */
  update: governedProcedure
    .input(
      z.object({
        id: z.number(),
        value: z.string().min(1).optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await updateSecret(input.id, ctx.user.id, {
        value: input.value,
        description: input.description,
      });
      getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "SECRET_UPDATE",
        target_type: "secret",
        target_id: String(input.id),
        decision_result: "success",
      });
      return result;
    }),

  /**
   * Delete a secret
   */
  delete: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await deleteSecret(input.id, ctx.user.id);
      getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "SECRET_DELETE",
        target_type: "secret",
        target_id: String(input.id),
        decision_result: "success",
      });
      return { success: true };
    }),
});
