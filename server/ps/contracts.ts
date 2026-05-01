/**
 * PS — Contracts
 */
import { z } from "zod";

export const PsProjectIdSchema = z.number().int().positive();

export const PsHandoffPayloadSchema = z.object({
  projectId: PsProjectIdSchema,
  ideationRunId: z.string(),
  workspaceId: z.number().int().positive(),
  governanceReceiptId: z.string(),
});
export type PsHandoffPayload = z.infer<typeof PsHandoffPayloadSchema>;

export const PsProjectSummarySchema = z.object({
  id: PsProjectIdSchema,
  key: z.string(),
  name: z.string(),
  status: z.string(),
});
export type PsProjectSummary = z.infer<typeof PsProjectSummarySchema>;
