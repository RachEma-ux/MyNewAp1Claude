/**
 * HR — Contracts
 */
import { z } from "zod";

export const HrEmployeeSummarySchema = z.object({
  id: z.number().int().positive(),
  employeeId: z.string(),
  displayName: z.string(),
  status: z.string(),
});
export type HrEmployeeSummary = z.infer<typeof HrEmployeeSummarySchema>;
