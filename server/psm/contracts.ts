/**
 * PSM — Contracts
 */
import { z } from "zod";

export const PsmMethodIdSchema = z.number().int().positive();
export const PsmMethodSummarySchema = z.object({
  id: PsmMethodIdSchema,
  key: z.string(),
  name: z.string(),
  status: z.string(),
  complexity: z.enum(["low", "medium", "high"]).optional(),
});
export type PsmMethodSummary = z.infer<typeof PsmMethodSummarySchema>;
