/**
 * PRM Validation — Zod schemas for all procedure inputs
 */

import { z } from "zod";
import {
  PRM_CASE_STATUSES,
  PRM_SEVERITIES,
  PRM_PRIORITIES,
  PRM_SOURCE_TYPES,
  PRM_METHOD_TYPES,
  PRM_ACTION_TYPES,
  PRM_ACTION_STATUSES,
  PRM_EVIDENCE_TYPES,
  PRM_PLAYBOOK_DOMAINS,
} from "./prm.types";

// ── Cases ───────────────────────────────────────────────────────────────────

export const createCaseSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  severity: z.enum(PRM_SEVERITIES).optional(),
  priority: z.enum(PRM_PRIORITIES).optional(),
  sourceType: z.enum(PRM_SOURCE_TYPES).optional(),
  ownerUserId: z.number().int().positive().optional(),
  reporterUserId: z.number().int().positive().optional(),
  impactStatement: z.string().optional(),
  scope: z.string().optional(),
  extProjectId: z.number().int().positive().optional(),
  extPmWorkId: z.number().int().positive().optional(),
  extWorkspaceId: z.number().int().positive().optional(),
});

export const updateCaseSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  severity: z.enum(PRM_SEVERITIES).optional(),
  priority: z.enum(PRM_PRIORITIES).optional(),
  sourceType: z.enum(PRM_SOURCE_TYPES).optional(),
  ownerUserId: z.number().int().positive().nullable().optional(),
  impactStatement: z.string().optional(),
  scope: z.string().optional(),
  confidence: z.number().min(0).max(100).optional(),
});

export const setStatusSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(PRM_CASE_STATUSES),
  reason: z.string().optional(),
});

export const reopenCaseSchema = z.object({
  id: z.number().int().positive(),
  reason: z.string().min(1),
});

export const closeCaseSchema = z.object({
  id: z.number().int().positive(),
  closureReason: z.string().min(1),
});

export const listCasesSchema = z.object({
  status: z.enum(PRM_CASE_STATUSES).optional(),
  severity: z.enum(PRM_SEVERITIES).optional(),
  ownerUserId: z.number().int().positive().optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

// ── Events ──────────────────────────────────────────────────────────────────

export const listEventsSchema = z.object({
  caseId: z.number().int().positive(),
  limit: z.number().int().min(1).max(200).default(50),
});

// ── Methods ─────────────────────────────────────────────────────────────────

export const createMethodRunSchema = z.object({
  caseId: z.number().int().positive(),
  methodType: z.enum(PRM_METHOD_TYPES),
  templateId: z.number().int().positive().optional(),
});

export const updateMethodRunSchema = z.object({
  id: z.number().int().positive(),
  workspaceData: z.record(z.any()),
  narrativeSummary: z.string().optional(),
});

export const completeMethodRunSchema = z.object({
  id: z.number().int().positive(),
  narrativeSummary: z.string().optional(),
});

// ── Decisions ───────────────────────────────────────────────────────────────

export const addDecisionSchema = z.object({
  caseId: z.number().int().positive(),
  title: z.string().min(1).max(255),
  chosenPath: z.string().optional(),
  rationale: z.string().min(1),
  alternatives: z.array(z.any()).optional(),
  constraints: z.array(z.any()).optional(),
});

export const approveDecisionSchema = z.object({
  id: z.number().int().positive(),
});

// ── Actions ─────────────────────────────────────────────────────────────────

export const addActionSchema = z.object({
  caseId: z.number().int().positive(),
  actionType: z.enum(PRM_ACTION_TYPES),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  ownerUserId: z.number().int().positive().optional(),
  dueDate: z.string().datetime().optional(),
  dependencyNote: z.string().optional(),
});

export const updateActionSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: z.enum(PRM_ACTION_STATUSES).optional(),
  effectivenessResult: z.string().optional(),
});

export const completeActionSchema = z.object({
  id: z.number().int().positive(),
  effectivenessResult: z.string().optional(),
});

// ── Evidence ────────────────────────────────────────────────────────────────

export const addEvidenceSchema = z.object({
  caseId: z.number().int().positive(),
  evidenceType: z.enum(PRM_EVIDENCE_TYPES),
  title: z.string().max(255).optional(),
  fileUrl: z.string().optional(),
  externalUrl: z.string().url().optional(),
  notes: z.string().optional(),
});

export const validateEvidenceSchema = z.object({
  id: z.number().int().positive(),
});

// ── Verifications ───────────────────────────────────────────────────────────

export const addVerificationSchema = z.object({
  caseId: z.number().int().positive(),
  testCondition: z.string().min(1),
  expectedResult: z.string().min(1),
});

export const signOffVerificationSchema = z.object({
  id: z.number().int().positive(),
  actualResult: z.string().min(1),
  passed: z.boolean(),
});

// ── Prevention ──────────────────────────────────────────────────────────────

export const addPreventionSchema = z.object({
  caseId: z.number().int().positive(),
  controlChange: z.string().optional(),
  sopUpdate: z.string().optional(),
  trainingNeed: z.string().optional(),
  monitoringRule: z.string().optional(),
});

export const updatePreventionSchema = z.object({
  id: z.number().int().positive(),
  controlChange: z.string().optional(),
  sopUpdate: z.string().optional(),
  trainingNeed: z.string().optional(),
  monitoringRule: z.string().optional(),
  status: z.enum(["draft", "active", "completed"] as const).optional(),
});

// ── Lessons ─────────────────────────────────────────────────────────────────

export const addLessonSchema = z.object({
  caseId: z.number().int().positive().optional(),
  title: z.string().min(1).max(255),
  whatHappened: z.string().optional(),
  whyItMattered: z.string().optional(),
  whatChanged: z.string().optional(),
  reuseNotes: z.string().optional(),
});

export const updateLessonSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(255).optional(),
  whatHappened: z.string().optional(),
  whyItMattered: z.string().optional(),
  whatChanged: z.string().optional(),
  reuseNotes: z.string().optional(),
});

// ── Playbooks ───────────────────────────────────────────────────────────────

export const createPlaybookSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  domain: z.enum(PRM_PLAYBOOK_DOMAINS).optional(),
  methodType: z.enum(PRM_METHOD_TYPES).optional(),
  templateData: z.record(z.any()).optional(),
  sourceLessonId: z.number().int().positive().optional(),
});

export const updatePlaybookSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  domain: z.enum(PRM_PLAYBOOK_DOMAINS).optional(),
  templateData: z.record(z.any()).optional(),
});

// ── External Refs ───────────────────────────────────────────────────────────

export const addExternalRefSchema = z.object({
  caseId: z.number().int().positive(),
  targetModule: z.string().min(1).max(30),
  targetId: z.number().int().positive(),
  refType: z.string().max(30).optional(),
  label: z.string().max(255).optional(),
  notes: z.string().optional(),
});

// ── Maturity ────────────────────────────────────────────────────────────────

export const runMaturitySchema = z.object({
  dimensionScores: z.record(z.number().min(1).max(5)),
  gapNotes: z.string().optional(),
  nextActions: z.string().optional(),
});

// ── Common ──────────────────────────────────────────────────────────────────

export const byIdSchema = z.object({
  id: z.number().int().positive(),
});

export const byCaseIdSchema = z.object({
  caseId: z.number().int().positive(),
});
