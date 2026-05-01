/** Culture Values — Contracts */
import { z } from "zod";

export const CvValueSummarySchema = z.object({
  id: z.number().int().positive(),
  key: z.string(),
  name: z.string(),
});
export type CvValueSummary = z.infer<typeof CvValueSummarySchema>;
