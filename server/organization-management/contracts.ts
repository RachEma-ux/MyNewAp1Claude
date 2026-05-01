/** Organization Management — Contracts */
import { z } from "zod";

export const OmEntitySummarySchema = z.object({
  id: z.number().int().positive(),
  key: z.string(),
  name: z.string(),
  kind: z.string(),
});
export type OmEntitySummary = z.infer<typeof OmEntitySummarySchema>;
