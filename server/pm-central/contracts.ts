/**
 * PM Central — Contracts (DTO + Zod schemas exposed to other modules)
 *
 * Other modules use these to validate payloads they exchange with PM
 * Central via the Module Gateway, Handoff, or Event Bus. Pure
 * types/schemas — no runtime services.
 */

import { z } from "zod";

export const PmProjectStatusSchema = z.enum([
  "draft",
  "planned",
  "active",
  "blocked",
  "completed",
  "cancelled",
  "archived",
]);
export type PmProjectStatus = z.infer<typeof PmProjectStatusSchema>;

export const PmPrioritySchema = z.enum(["low", "normal", "high", "critical"]);
export type PmPriority = z.infer<typeof PmPrioritySchema>;

export const PmPlanStatusSchema = z.enum([
  "draft",
  "approved",
  "active",
  "superseded",
]);
export type PmPlanStatus = z.infer<typeof PmPlanStatusSchema>;

export const PmMilestoneStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "missed",
  "cancelled",
]);
export type PmMilestoneStatus = z.infer<typeof PmMilestoneStatusSchema>;

export const PmTaskStatusSchema = z.enum([
  "todo",
  "in_progress",
  "blocked",
  "review",
  "done",
  "cancelled",
]);
export type PmTaskStatus = z.infer<typeof PmTaskStatusSchema>;

export const PmRiskSeveritySchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);
export const PmRiskProbabilitySchema = z.enum(["low", "medium", "high"]);
export const PmRiskStatusSchema = z.enum([
  "open",
  "monitoring",
  "mitigated",
  "closed",
]);

export const PmIssueStatusSchema = z.enum([
  "open",
  "in_progress",
  "resolved",
  "closed",
]);

export const PmHandoffStatusSchema = z.enum([
  "received",
  "accepted",
  "rejected",
  "converted",
  "failed",
]);
export type PmHandoffStatus = z.infer<typeof PmHandoffStatusSchema>;

// ── Project inputs ─────────────────────────────────────────────────────────────

export const CreatePmProjectInputSchema = z.object({
  workspaceId: z.number().int().positive(),
  name: z.string().min(1).max(500),
  description: z.string().optional(),
  priority: PmPrioritySchema.optional(),
  ownerUserId: z.number().int().positive().optional(),
  sourceModule: z.string().max(50).optional(),
  sourceRefId: z.number().int().positive().optional(),
  sourceHandoffId: z.number().int().positive().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreatePmProjectInput = z.infer<typeof CreatePmProjectInputSchema>;

// ── Plan inputs ────────────────────────────────────────────────────────────────

export const CreatePmPlanInputSchema = z.object({
  pmProjectId: z.number().int().positive(),
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreatePmPlanInput = z.infer<typeof CreatePmPlanInputSchema>;

// ── Milestone inputs ───────────────────────────────────────────────────────────

export const CreatePmMilestoneInputSchema = z.object({
  pmProjectId: z.number().int().positive(),
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  dueDate: z.coerce.date().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});
export type CreatePmMilestoneInput = z.infer<
  typeof CreatePmMilestoneInputSchema
>;

// ── Task inputs ────────────────────────────────────────────────────────────────

export const CreatePmTaskInputSchema = z.object({
  pmProjectId: z.number().int().positive(),
  milestoneId: z.number().int().positive().optional(),
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  assigneeUserId: z.number().int().positive().optional(),
  priority: PmPrioritySchema.optional(),
  dueDate: z.coerce.date().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreatePmTaskInput = z.infer<typeof CreatePmTaskInputSchema>;

// ── Risk / Issue / Decision inputs ────────────────────────────────────────────

export const CreatePmRiskInputSchema = z.object({
  pmProjectId: z.number().int().positive(),
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  severity: PmRiskSeveritySchema.optional(),
  probability: PmRiskProbabilitySchema.optional(),
  mitigation: z.string().optional(),
});
export type CreatePmRiskInput = z.infer<typeof CreatePmRiskInputSchema>;

export const CreatePmIssueInputSchema = z.object({
  pmProjectId: z.number().int().positive(),
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  severity: PmRiskSeveritySchema.optional(),
  ownerUserId: z.number().int().positive().optional(),
});
export type CreatePmIssueInput = z.infer<typeof CreatePmIssueInputSchema>;

export const RecordPmDecisionInputSchema = z.object({
  pmProjectId: z.number().int().positive(),
  title: z.string().min(1).max(500),
  decision: z.string().min(1),
  rationale: z.string().optional(),
});
export type RecordPmDecisionInput = z.infer<typeof RecordPmDecisionInputSchema>;

// ── Handoff inputs (PS → PM) ──────────────────────────────────────────────────

export const ReceivePsHandoffInputSchema = z.object({
  workspaceId: z.number().int().positive(),
  sourceModule: z.literal("ps"),
  sourceProjectId: z.number().int().positive(),
  sourceIdeationId: z.number().int().positive().optional(),
  sourceWizardRunId: z.number().int().positive().optional(),
  name: z.string().min(1).max(500),
  scenario: z.string().optional(),
  classification: z.string().optional(),
  selectedScopeCode: z.string().optional(),
  selectedScopeLabel: z.string().optional(),
  confidence: z.union([z.string(), z.number()]).optional(),
  explainability: z.record(z.string(), z.unknown()).optional(),
  kpiTargets: z.array(z.unknown()).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  attachments: z.array(z.unknown()).optional(),
  handoffId: z.string().max(100).optional(),
});
export type ReceivePsHandoffInput = z.infer<typeof ReceivePsHandoffInputSchema>;

// ── Summary surface ───────────────────────────────────────────────────────────

export interface PmCentralSummary {
  totalProjects: number;
  activeProjects: number;
  blockedProjects: number;
  overdueMilestones: number;
  openRisks: number;
  openIssues: number;
  pendingHandoffs: number;
  dbConnected: boolean;
}
