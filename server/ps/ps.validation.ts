/**
 * PS Module — Validation Schemas (Zod)
 */

import { z } from "zod";

export const createSystemSchema = z.object({
  workspaceId: z.number().int().positive(),
  name: z.string().min(1, "System name is required").max(255),
  description: z.string().max(2000).optional(),
  systemType: z.string().min(1, "System type is required").max(100),
  lifecycleType: z.string().max(100).optional(),
  governanceProfile: z.string().max(100).optional(),
});

export const getSystemSchema = z.object({
  workspaceId: z.number().int().positive(),
  id: z.number().int().positive(),
});

export const listSystemsSchema = z.object({
  workspaceId: z.number().int().positive(),
  status: z.enum(["draft", "active", "archived"]).optional(),
});

export const createWizardRunSchema = z.object({
  workspaceId: z.number().int().positive(),
  scenarioText: z.string().min(1, "Scenario text is required").max(5000),
  inputPayload: z.record(z.unknown()).optional(),
  resultPayload: z.record(z.unknown()).optional(),
  confidence: z.number().min(0).max(100).optional(),
  selectedSystemType: z.string().max(100).optional(),
  matrixVersion: z.string().max(50).optional(),
});

export const getWizardRunSchema = z.object({
  workspaceId: z.number().int().positive(),
  id: z.number().int().positive(),
});

export const listWizardRunsSchema = z.object({
  workspaceId: z.number().int().positive(),
});

// ── Resource Requests (Demand) ──────────────────────────────────────

export const createResourceRequestSchema = z.object({
  workspaceId: z.number().int().positive(),
  psSystemId: z.number().int().positive(),
  role: z.string().min(1, "Role is required").max(200),
  capabilityTags: z.array(z.string().max(100)).max(20).optional(),
  quantity: z.number().int().min(1).max(100).optional(),
  seniorityLevel: z.string().max(50).optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  allocationPercentage: z.number().int().min(1).max(100).optional(),
});

export const listResourceRequestsSchema = z.object({
  workspaceId: z.number().int().positive(),
  status: z.enum(["draft", "open", "partially_filled", "filled", "closed"]).optional(),
});

export const listResourceRequestsBySystemSchema = z.object({
  workspaceId: z.number().int().positive(),
  psSystemId: z.number().int().positive(),
});

export const updateResourceRequestStatusSchema = z.object({
  workspaceId: z.number().int().positive(),
  id: z.number().int().positive(),
  status: z.enum(["draft", "open", "partially_filled", "filled", "closed"]),
});

export const getDemandSummarySchema = z.object({
  workspaceId: z.number().int().positive(),
  psSystemId: z.number().int().positive(),
});

// ── Resource Assignments ──────────────────────────────────────────

const assignmentStatusEnum = z.enum([
  "proposed", "requested", "confirmed", "active", "rejected", "cancelled", "completed",
]);

const assigneeRefTypeEnum = z.enum([
  "person", "team", "org_unit", "external", "placeholder",
]);

const assignmentSourceEnum = z.enum([
  "wizard", "manual", "import", "future_hr_sync",
]);

export const createResourceAssignmentSchema = z.object({
  workspaceId: z.number().int().positive(),
  resourceRequestId: z.number().int().positive(),
  psSystemId: z.number().int().positive(),
  assignmentRole: z.string().min(1, "Assignment role is required").max(200),
  assigneeRefType: assigneeRefTypeEnum,
  assigneeRefId: z.string().max(200).optional(),
  assigneeDisplayName: z.string().max(300).optional(),
  allocationPercentage: z.number().int().min(1).max(100).optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  status: assignmentStatusEnum.optional(),
  source: assignmentSourceEnum.optional(),
  notes: z.string().max(2000).optional(),
});

export const updateResourceAssignmentSchema = z.object({
  workspaceId: z.number().int().positive(),
  id: z.number().int().positive(),
  assignmentRole: z.string().min(1).max(200).optional(),
  assigneeRefType: assigneeRefTypeEnum.optional(),
  assigneeRefId: z.string().max(200).optional(),
  assigneeDisplayName: z.string().max(300).optional(),
  allocationPercentage: z.number().int().min(1).max(100).optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  notes: z.string().max(2000).optional(),
});

export const updateResourceAssignmentStatusSchema = z.object({
  workspaceId: z.number().int().positive(),
  id: z.number().int().positive(),
  status: assignmentStatusEnum,
});

export const listResourceAssignmentsSchema = z.object({
  workspaceId: z.number().int().positive(),
  status: assignmentStatusEnum.optional(),
});

export const listResourceAssignmentsByRequestSchema = z.object({
  workspaceId: z.number().int().positive(),
  resourceRequestId: z.number().int().positive(),
});

export const listResourceAssignmentsBySystemSchema = z.object({
  workspaceId: z.number().int().positive(),
  psSystemId: z.number().int().positive(),
});

export const deleteResourceAssignmentSchema = z.object({
  workspaceId: z.number().int().positive(),
  id: z.number().int().positive(),
});

export const getAssignmentSummarySchema = z.object({
  workspaceId: z.number().int().positive(),
  psSystemId: z.number().int().positive(),
});

// ── Monitoring ──────────────────────────────────────────────────────

export const getMonitoringSummarySchema = z.object({
  workspaceId: z.number().int().positive(),
});

// ── Matrix Engine ──────────────────────────────────────────────────

export const matrixVersionIdSchema = z.object({
  workspaceId: z.number().int().positive(),
  versionId: z.number().int().positive(),
});

export const createMatrixVersionSchema = z.object({
  workspaceId: z.number().int().positive(),
  version: z.string().min(1).max(50),
  label: z.string().min(1).max(255),
});

export const activateMatrixVersionSchema = z.object({
  workspaceId: z.number().int().positive(),
  id: z.number().int().positive(),
});

export const createMatrixScopeSchema = z.object({
  workspaceId: z.number().int().positive(),
  versionId: z.number().int().positive(),
  code: z.string().min(1).max(100),
  label: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  family: z.string().max(100).optional(),
});

export const createMatrixScopesBatchSchema = z.object({
  workspaceId: z.number().int().positive(),
  versionId: z.number().int().positive(),
  items: z.array(z.object({
    code: z.string().min(1).max(100),
    label: z.string().min(1).max(255),
    description: z.string().max(2000).optional(),
    family: z.string().max(100).optional(),
  })).min(1).max(100),
});

export const createMatrixQuestionSchema = z.object({
  workspaceId: z.number().int().positive(),
  versionId: z.number().int().positive(),
  code: z.string().min(1).max(100),
  label: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const createMatrixQuestionsBatchSchema = z.object({
  workspaceId: z.number().int().positive(),
  versionId: z.number().int().positive(),
  items: z.array(z.object({
    code: z.string().min(1).max(100),
    label: z.string().min(1).max(500),
    description: z.string().max(2000).optional(),
    sortOrder: z.number().int().min(0).optional(),
  })).min(1).max(200),
});

export const createMatrixCellsBatchSchema = z.object({
  workspaceId: z.number().int().positive(),
  versionId: z.number().int().positive(),
  items: z.array(z.object({
    questionId: z.number().int().positive(),
    scopeId: z.number().int().positive(),
    weight: z.number().int(),
  })).min(1).max(5000),
});

export const evaluateMatrixSchema = z.object({
  workspaceId: z.number().int().positive(),
  answers: z.record(z.union([z.boolean(), z.string(), z.number()])),
});

export const hasActiveMatrixSchema = z.object({
  workspaceId: z.number().int().positive(),
});

export const getActiveMatrixQuestionsSchema = z.object({
  workspaceId: z.number().int().positive(),
});

// ── Classification ──────────────────────────────────────────────────

export const classifyScenarioSchema = z.object({
  workspaceId: z.number().int().positive(),
  scenarioText: z.string().min(1, "Scenario text is required").max(5000),
  dimensions: z.object({
    domain: z.enum(["software", "infrastructure", "business_process", "organizational_change", "construction", "research"]),
    orgLevel: z.enum(["team", "department", "program", "portfolio", "enterprise"]),
    criticality: z.enum(["low", "medium", "high", "critical"]),
    deliveryStyle: z.enum(["waterfall", "agile", "hybrid", "continuous", "phased"]),
    valueOrientation: z.enum(["cost_reduction", "revenue_growth", "compliance", "innovation", "efficiency", "customer_experience"]),
    lifecycleFocus: z.enum(["initiation", "planning", "execution", "monitoring", "closure", "product", "operations"]),
  }),
});
