/** KGRA Agent — Contracts */
import { z } from "zod";

export const KgraRunRequestSchema = z.object({
  query: z.string().min(1),
  mode: z.string().optional(),
  workspaceId: z.number().int().positive().optional(),
});
export type KgraRunRequest = z.infer<typeof KgraRunRequestSchema>;

export const KgraRunResponseSchema = z.object({
  answer: z.string(),
  confidence: z.number().optional(),
  runId: z.string(),
});
export type KgraRunResponse = z.infer<typeof KgraRunResponseSchema>;
