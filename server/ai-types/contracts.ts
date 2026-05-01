/**
 * AI Types — Contracts
 */
import { z } from "zod";

export const CatalogEntrySummarySchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  entryType: z.string(),
  status: z.string(),
});
export type CatalogEntrySummary = z.infer<typeof CatalogEntrySummarySchema>;
