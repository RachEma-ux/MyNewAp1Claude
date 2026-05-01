/**
 * Code Studio — Contracts
 */
import { z } from "zod";

export const CodeStudioRunIdSchema = z.string().uuid();
export const CodeStudioRunStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const CodeStudioRunSummarySchema = z.object({
  runId: CodeStudioRunIdSchema,
  status: CodeStudioRunStatusSchema,
  templateKey: z.string(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
});
export type CodeStudioRunSummary = z.infer<typeof CodeStudioRunSummarySchema>;

export const CodeStudioRunRequestSchema = z.object({
  templateKey: z.string(),
  inputs: z.record(z.string(), z.any()).default({}),
  workspaceId: z.number().int().positive(),
  governanceReceiptId: z.string().optional(),
});
export type CodeStudioRunRequest = z.infer<typeof CodeStudioRunRequestSchema>;
