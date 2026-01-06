import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  createSecret,
  getSecretById,
  listSecrets,
  updateSecret,
  deleteSecret,
} from "./secrets-service";

export const secretsRouter = router({
  /**
   * Create a new secret
   */
  create: protectedProcedure
    .input(
      z.object({
        key: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_-]+$/, "Key must contain only letters, numbers, underscores, and hyphens"),
        value: z.string().min(1),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await createSecret({
        userId: ctx.user.id,
        key: input.key,
        value: input.value,
        description: input.description,
      });
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
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        value: z.string().min(1).optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await updateSecret(input.id, ctx.user.id, {
        value: input.value,
        description: input.description,
      });
    }),

  /**
   * Delete a secret
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await deleteSecret(input.id, ctx.user.id);
      return { success: true };
    }),
});
