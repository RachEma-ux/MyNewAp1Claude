/**
 * Code Studio — Zod Validation Schemas
 */

import { z } from "zod";

export const byIdSchema = z.object({ id: z.number().int().positive() });

// ── Job Schemas ──────────────────────────────────────────────────────────────

export const createJobSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  objective: z.string().optional(),
  constraints: z.record(z.any()).optional(),
  priority: z.enum(["low", "normal", "high", "critical"]).optional(),
  repoId: z.number().int().positive().optional(),
  model: z.string().max(200).optional(), // e.g. "openai/gpt-5.3-chat-latest" or "ollama/phi3:latest"
});

export const updateJobSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  objective: z.string().optional(),
  status: z.string().optional(),
  constraints: z.record(z.any()).optional(),
  priority: z.enum(["low", "normal", "high", "critical"]).optional(),
});

export const listJobsSchema = z.object({
  status: z.string().optional(),
  repoId: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

// ── Repository Schemas ───────────────────────────────────────────────────────

export const createRepoSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().min(1),
  defaultBranch: z.string().optional(),
  cloneMethod: z.enum(["https", "ssh"]).optional(),
});

export const listReposSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
});

// ── Session Schemas ──────────────────────────────────────────────────────────

export const listSessionsSchema = z.object({
  jobId: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

// ── Approval Schemas ─────────────────────────────────────────────────────────

export const listPendingApprovalsSchema = z.object({
  jobId: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const resolveApprovalSchema = z.object({
  permissionRequestId: z.number().int().positive(),
  decision: z.enum(["approved", "denied"]),
  scope: z.enum(["once", "session", "job", "repo_policy"]).optional(),
  rationale: z.string().optional(),
});

// ── Handoff Schemas ──────────────────────────────────────────────────────────

export const inboundHandoffSchema = z.object({
  sourceModule: z.string().min(1),
  sourceWorkflowId: z.string().optional(),
  repository: z.string().optional(),
  repoId: z.number().int().positive().optional(),
  baseBranchOrSha: z.string().optional(),
  objective: z.string().min(1),
  constraints: z.record(z.any()).optional(),
  priority: z.enum(["low", "normal", "high", "critical"]).optional(),
  actor: z.string().optional(),
  requestedArtifacts: z.array(z.string()).optional(),
  callbackUrl: z.string().optional(),
});

// ── Audit Schemas ────────────────────────────────────────────────────────────

export const listAuditSchema = z.object({
  eventType: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
});

// ── Policy Schemas ───────────────────────────────────────────────────────────

export const createPolicySchema = z.object({
  name: z.string().min(1).max(200),
  repoId: z.number().int().positive().optional(),
  rules: z.record(z.any()),
  isDefault: z.boolean().optional(),
});

// ── Diff Schemas ─────────────────────────────────────────────────────────────

export const listDiffsSchema = z.object({
  jobId: z.number().int().positive(),
});

// ── Session Message Schemas ─────────────────────────────────────────────────

export const listSessionMessagesSchema = z.object({
  sessionId: z.number().int().positive(),
  limit: z.number().int().min(1).max(500).optional(),
});

// ── Template Schemas ────────────────────────────────────────────────────────

const variableDefSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "long_text"]),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  helpText: z.string().optional(),
});

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.string().max(50).optional(),
  templateType: z.string().max(50).optional(),
  titleTemplate: z.string().optional(),
  objectiveTemplate: z.string().optional(),
  defaultPriority: z.enum(["low", "normal", "high", "critical"]).optional(),
  defaultConstraints: z.record(z.any()).optional(),
  variableSchema: z.array(variableDefSchema).optional(),
});

export const updateTemplateSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  category: z.string().max(50).optional(),
  templateType: z.string().max(50).optional(),
  isActive: z.boolean().optional(),
  titleTemplate: z.string().optional(),
  objectiveTemplate: z.string().optional(),
  defaultPriority: z.enum(["low", "normal", "high", "critical"]).optional(),
  defaultConstraints: z.record(z.any()).optional(),
  variableSchema: z.array(variableDefSchema).optional(),
});

export const listTemplatesSchema = z.object({
  category: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const importTemplatesSchema = z.object({
  templates: z.array(z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    category: z.string().optional(),
    templateType: z.string().optional(),
    titleTemplate: z.string().optional(),
    objectiveTemplate: z.string().optional(),
    defaultPriority: z.enum(["low", "normal", "high", "critical"]).optional(),
    defaultConstraints: z.record(z.any()).optional(),
    variableSchema: z.array(variableDefSchema).optional(),
  })).min(1),
});

export const generateJobDraftSchema = z.object({
  templateId: z.number().int().positive(),
  variables: z.record(z.string()),
});

// ── IDE Instances ─────────────────────────────────────────────────────────

export const openIdeForJobSchema = z.object({
  jobId: z.number().int().positive(),
});

export const openIdeForSessionSchema = z.object({
  sessionId: z.number().int().positive(),
});

export const ideInstanceStatusSchema = z.object({
  instanceId: z.number().int().positive(),
});

export const closeIdeInstanceSchema = z.object({
  instanceId: z.number().int().positive(),
});
