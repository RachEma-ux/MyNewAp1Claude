/**
 * OpenRouter — Contracts
 */
import { z } from "zod";

export const OpenRouterRouteRequestSchema = z.object({
  model: z.string(),
  messages: z.array(
    z.object({ role: z.string(), content: z.string() }),
  ),
  workspaceId: z.number().int().positive().optional(),
  governanceReceiptId: z.string().optional(),
});
export type OpenRouterRouteRequest = z.infer<typeof OpenRouterRouteRequestSchema>;
