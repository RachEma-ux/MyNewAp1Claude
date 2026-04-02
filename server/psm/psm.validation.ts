/**
 * PSM Validation — Zod schemas for all tRPC inputs
 */

import { z } from "zod";

// ── Common ──────────────────────────────────────────────────────────────────
export const byIdSchema = z.object({ id: z.number().int().positive() });
export const byCaseIdSchema = z.object({ caseId: z.number().int().positive() });
export const byRunIdSchema = z.object({ runId: z.number().int().positive() });

// ── Catalog ─────────────────────────────────────────────────────────────────
export const listMethodsSchema = z.object({
  categoryId: z.number().int().positive().optional(),
  status: z.string().optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
}).optional();

export const searchMethodsSchema = z.object({
  query: z.string().min(1),
  categoryId: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

// ── Selector ────────────────────────────────────────────────────────────────
export const recommendSchema = z.object({
  caseId: z.number().int().positive().optional(),
  problemDescription: z.string().optional(),
  dimensions: z.array(z.object({
    dimension: z.string(),
    score: z.number().min(1).max(5),
  })),
  limit: z.number().int().min(1).max(20).optional(),
});

export const compareMethodsSchema = z.object({
  methodIds: z.array(z.number().int().positive()).min(2).max(5),
});

// ── Cases ───────────────────────────────────────────────────────────────────
export const createCaseSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  problemTypeId: z.number().int().positive().optional(),
});

export const updateCaseSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  problemTypeId: z.number().int().positive().optional(),
});

export const listCasesSchema = z.object({
  status: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
}).optional();

export const attachMethodSchema = z.object({
  caseId: z.number().int().positive(),
  methodId: z.number().int().positive(),
  reason: z.string().optional(),
});

export const saveCaseInputsSchema = z.object({
  caseId: z.number().int().positive(),
  inputs: z.array(z.object({
    dimension: z.string(),
    score: z.number().min(1).max(5),
    notes: z.string().optional(),
  })),
});

// ── Workflow ─────────────────────────────────────────────────────────────────
export const startRunSchema = z.object({
  caseId: z.number().int().positive(),
  methodId: z.number().int().positive(),
});

export const saveStepSchema = z.object({
  runId: z.number().int().positive(),
  stepNumber: z.number().int().positive(),
  notes: z.string().optional(),
  output: z.any().optional(),
  status: z.enum(["in_progress", "completed", "skipped"]).optional(),
});

export const completeRunSchema = z.object({
  runId: z.number().int().positive(),
  summary: z.string().optional(),
});

// ── Notes ───────────────────────────────────────────────────────────────────
export const addNoteSchema = z.object({
  caseId: z.number().int().positive(),
  runId: z.number().int().positive().optional(),
  content: z.string().min(1),
});

// ── Decision Log ────────────────────────────────────────────────────────────
export const addDecisionSchema = z.object({
  caseId: z.number().int().positive(),
  title: z.string().min(1).max(255),
  decision: z.string().optional(),
  rationale: z.string().optional(),
  alternatives: z.any().optional(),
});

// ── Admin ───────────────────────────────────────────────────────────────────
export const createContentPackSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
});

export const publishPackSchema = z.object({
  packId: z.number().int().positive(),
  reason: z.string().optional(),
});

export const rollbackPackSchema = z.object({
  packId: z.number().int().positive(),
  reason: z.string().optional(),
});

// ── Analytics ───────────────────────────────────────────────────────────────
export const analyticsRangeSchema = z.object({
  days: z.number().int().min(1).max(365).optional(),
}).optional();

// ── Audit ───────────────────────────────────────────────────────────────────
export const listAuditSchema = z.object({
  eventType: z.string().optional(),
  entityType: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
}).optional();
