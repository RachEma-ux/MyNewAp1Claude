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
});

export const getWizardRunSchema = z.object({
  workspaceId: z.number().int().positive(),
  id: z.number().int().positive(),
});

export const listWizardRunsSchema = z.object({
  workspaceId: z.number().int().positive(),
});

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
