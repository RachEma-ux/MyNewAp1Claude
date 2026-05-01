/**
 * Agent Studio — Contracts
 */
import { z } from "zod";

export const AgentStudioAgentIdSchema = z.number().int().positive();

export const AgentStudioRunStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const AgentStudioRunSummarySchema = z.object({
  runId: z.string(),
  agentId: AgentStudioAgentIdSchema,
  status: AgentStudioRunStatusSchema,
  startedAt: z.string(),
  completedAt: z.string().optional(),
});
export type AgentStudioRunSummary = z.infer<typeof AgentStudioRunSummarySchema>;

export const AgentStudioRunRequestSchema = z.object({
  agentId: AgentStudioAgentIdSchema,
  message: z.string().optional(),
  workspaceId: z.number().int().positive(),
  governanceReceiptId: z.string().optional(),
});
export type AgentStudioRunRequest = z.infer<typeof AgentStudioRunRequestSchema>;
