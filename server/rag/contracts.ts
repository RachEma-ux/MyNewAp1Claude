/**
 * RAG — Contracts
 */
import { z } from "zod";

export const RagSearchRequestSchema = z.object({
  query: z.string().min(1),
  workspaceId: z.number().int().positive(),
  topK: z.number().int().min(1).max(100).default(10),
});
export type RagSearchRequest = z.infer<typeof RagSearchRequestSchema>;

export const RagSearchResultSchema = z.object({
  documentId: z.union([z.string(), z.number()]),
  score: z.number(),
  snippet: z.string(),
});
export type RagSearchResult = z.infer<typeof RagSearchResultSchema>;

export const RagStatsSchema = z.object({
  entityCount: z.number(),
  relationshipCount: z.number(),
  builtAt: z.string().optional(),
});
export type RagStats = z.infer<typeof RagStatsSchema>;
