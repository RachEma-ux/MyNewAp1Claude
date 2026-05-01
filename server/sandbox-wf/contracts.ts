/**
 * Sandbox WF — Contracts
 */
import { z } from "zod";

export const WorkflowRunIdSchema = z.string().uuid();
export const WorkflowRunStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const WorkflowExecuteRequestSchema = z.object({
  workflowKey: z.string(),
  inputs: z.record(z.string(), z.any()).default({}),
  workspaceId: z.number().int().positive(),
  governanceReceiptId: z.string().optional(),
});
export type WorkflowExecuteRequest = z.infer<typeof WorkflowExecuteRequestSchema>;

export const WorkflowExecutionSummarySchema = z.object({
  runId: WorkflowRunIdSchema,
  workflowKey: z.string(),
  status: WorkflowRunStatusSchema,
  startedAt: z.string(),
  completedAt: z.string().optional(),
});
export type WorkflowExecutionSummary = z.infer<typeof WorkflowExecutionSummarySchema>;
