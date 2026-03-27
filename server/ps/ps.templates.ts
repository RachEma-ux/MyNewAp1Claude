/**
 * PS Module — Scope Template Mapping
 *
 * Maps recommended scope codes to operational template bundles.
 * A template bundle defines the full operational setup for a scope:
 *   - governance preset
 *   - methods
 *   - frameworks
 *   - workflow (phases + gates)
 *   - staffing template (demand specs)
 *
 * DB-first: looks up ps_scope_template_mappings first, then
 * falls back to built-in defaults for common scope families.
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../db/connection";
import {
  psScopeTemplateMappings,
  type PsScopeTemplateMapping,
  type InsertPsScopeTemplateMapping,
} from "../../drizzle/tables/ps";
import type { DemandRoleSpec } from "./ps.types";

// ── Types ──────────────────────────────────────────────────────────────

export interface WorkflowPhase {
  name: string;
  gateType?: string;
  deliverables?: string[];
}

export interface WorkflowTemplate {
  phases: WorkflowPhase[];
  reviewCadence?: string;
}

export interface ScopeTemplate {
  systemType: string;
  lifecycleType: string | null;
  governanceProfile: string | null;
  methods: string[];
  frameworks: string[];
  workflow: WorkflowTemplate;
  demandSpecs: DemandRoleSpec[];
}

/**
 * Resolved template bundle — the full operational context
 * used during PS → PM project creation.
 */
export interface TemplateBundle {
  scopeCode: string;
  governance: string | null;
  methods: string[];
  frameworks: string[];
  workflow: WorkflowTemplate;
  staffing: DemandRoleSpec[];
  systemType: string;
  lifecycleType: string | null;
  source: "db" | "builtin" | "fallback";
}

interface DemandTemplateEntry {
  role: string;
  capabilityTags: string[];
  quantity: number;
  seniorityLevel: string;
}

// ── Built-in Fallback Templates ────────────────────────────────────────

const DEFAULT_TEMPLATES: Record<string, ScopeTemplate> = {
  SOFTWARE_DELIVERY: {
    systemType: "SOFTWARE_DELIVERY",
    lifecycleType: "iterative",
    governanceProfile: "standard",
    methods: ["Scrum", "Kanban"],
    frameworks: ["SAFe", "Agile"],
    workflow: {
      phases: [
        { name: "Discovery", gateType: "review", deliverables: ["PRD", "Tech Design"] },
        { name: "Development", gateType: "demo", deliverables: ["Working Software", "Test Results"] },
        { name: "Release", gateType: "sign-off", deliverables: ["Release Notes", "Deployment Checklist"] },
      ],
      reviewCadence: "biweekly",
    },
    demandSpecs: [
      { role: "Tech Lead", capabilityTags: ["architecture", "leadership"], quantityMin: 1, quantityMax: 1, seniorityLevel: "senior" },
      { role: "Backend Engineer", capabilityTags: ["backend", "api"], quantityMin: 2, quantityMax: 4, seniorityLevel: "mid" },
      { role: "Frontend Engineer", capabilityTags: ["frontend", "ui"], quantityMin: 1, quantityMax: 2, seniorityLevel: "mid" },
      { role: "QA Engineer", capabilityTags: ["testing", "qa"], quantityMin: 1, quantityMax: 1, seniorityLevel: "mid" },
    ],
  },
  PROGRAM_MANAGEMENT: {
    systemType: "PROGRAM_MANAGEMENT",
    lifecycleType: "phased",
    governanceProfile: "governance_heavy",
    methods: ["PRINCE2", "MSP"],
    frameworks: ["PMI", "IPMA"],
    workflow: {
      phases: [
        { name: "Initiation", gateType: "stage-gate", deliverables: ["Business Case", "Program Charter"] },
        { name: "Planning", gateType: "stage-gate", deliverables: ["Master Schedule", "Resource Plan"] },
        { name: "Execution", gateType: "checkpoint", deliverables: ["Status Reports", "Risk Register"] },
        { name: "Closure", gateType: "sign-off", deliverables: ["Lessons Learned", "Benefits Realisation"] },
      ],
      reviewCadence: "monthly",
    },
    demandSpecs: [
      { role: "Program Manager", capabilityTags: ["program-management", "governance"], quantityMin: 1, quantityMax: 1, seniorityLevel: "senior" },
      { role: "Project Manager", capabilityTags: ["project-management", "planning"], quantityMin: 2, quantityMax: 3, seniorityLevel: "mid" },
      { role: "Business Analyst", capabilityTags: ["requirements", "analysis"], quantityMin: 1, quantityMax: 2, seniorityLevel: "mid" },
    ],
  },
  AGILE_PRODUCT: {
    systemType: "AGILE_PRODUCT",
    lifecycleType: "continuous",
    governanceProfile: "lightweight",
    methods: ["Scrum", "Lean Startup"],
    frameworks: ["Agile", "LeSS"],
    workflow: {
      phases: [
        { name: "Product Discovery", gateType: "review", deliverables: ["User Stories", "Prototype"] },
        { name: "Sprint Delivery", gateType: "demo", deliverables: ["Increment", "Sprint Review Notes"] },
        { name: "Continuous Improvement", gateType: "retrospective", deliverables: ["Action Items", "Metrics Dashboard"] },
      ],
      reviewCadence: "per-sprint",
    },
    demandSpecs: [
      { role: "Product Owner", capabilityTags: ["product-management", "backlog"], quantityMin: 1, quantityMax: 1, seniorityLevel: "senior" },
      { role: "Scrum Master", capabilityTags: ["scrum", "facilitation"], quantityMin: 1, quantityMax: 1, seniorityLevel: "mid" },
      { role: "Dev Team Member", capabilityTags: ["development", "cross-functional"], quantityMin: 3, quantityMax: 7, seniorityLevel: "mid" },
    ],
  },
  PROJECT_GOVERNANCE: {
    systemType: "PROJECT_GOVERNANCE",
    lifecycleType: "waterfall",
    governanceProfile: "compliance",
    methods: ["Waterfall", "V-Model"],
    frameworks: ["ISO 21500", "CMMI"],
    workflow: {
      phases: [
        { name: "Initiation", gateType: "stage-gate", deliverables: ["Project Charter", "Stakeholder Register"] },
        { name: "Planning", gateType: "stage-gate", deliverables: ["WBS", "Quality Plan", "Risk Plan"] },
        { name: "Execution", gateType: "audit", deliverables: ["Deliverables", "Change Requests"] },
        { name: "Monitoring & Control", gateType: "checkpoint", deliverables: ["Variance Reports", "Earned Value"] },
        { name: "Closure", gateType: "sign-off", deliverables: ["Final Report", "Compliance Certificate"] },
      ],
      reviewCadence: "weekly",
    },
    demandSpecs: [
      { role: "Project Manager", capabilityTags: ["project-management", "compliance"], quantityMin: 1, quantityMax: 1, seniorityLevel: "senior" },
      { role: "PMO Analyst", capabilityTags: ["pmo", "reporting"], quantityMin: 1, quantityMax: 1, seniorityLevel: "mid" },
      { role: "Risk/Compliance Officer", capabilityTags: ["risk-management", "audit"], quantityMin: 1, quantityMax: 1, seniorityLevel: "senior" },
    ],
  },
  OPERATIONS_IMPROVEMENT: {
    systemType: "OPERATIONS_IMPROVEMENT",
    lifecycleType: "continuous",
    governanceProfile: "standard",
    methods: ["Lean", "Six Sigma"],
    frameworks: ["ITIL", "COBIT"],
    workflow: {
      phases: [
        { name: "Assessment", gateType: "review", deliverables: ["Current State Map", "Gap Analysis"] },
        { name: "Design", gateType: "review", deliverables: ["Future State Map", "Implementation Plan"] },
        { name: "Implementation", gateType: "checkpoint", deliverables: ["Process Changes", "Training Materials"] },
        { name: "Sustain", gateType: "review", deliverables: ["KPI Dashboard", "Control Charts"] },
      ],
      reviewCadence: "monthly",
    },
    demandSpecs: [
      { role: "Operations Manager", capabilityTags: ["operations", "lean"], quantityMin: 1, quantityMax: 1, seniorityLevel: "senior" },
      { role: "Process Analyst", capabilityTags: ["process-mapping", "optimization"], quantityMin: 1, quantityMax: 2, seniorityLevel: "mid" },
      { role: "Change Manager", capabilityTags: ["change-management", "training"], quantityMin: 1, quantityMax: 1, seniorityLevel: "mid" },
    ],
  },
};

// ── Resolve Template ───────────────────────────────────────────────────

/**
 * Resolve a scope code to an operational template.
 * Priority: DB mapping → built-in defaults → generic fallback.
 */
export async function resolveTemplate(
  scopeCode: string,
): Promise<ScopeTemplate> {
  // 1. Try DB mapping first
  const dbMapping = await getTemplateByScopeCode(scopeCode);
  if (dbMapping) {
    return dbMappingToTemplate(dbMapping);
  }

  // 2. Try built-in defaults by system type key
  const upperCode = scopeCode.toUpperCase().replace(/-/g, "_");
  if (DEFAULT_TEMPLATES[upperCode]) {
    return DEFAULT_TEMPLATES[upperCode];
  }

  // 3. Generic fallback
  return {
    systemType: scopeCode,
    lifecycleType: "hybrid",
    governanceProfile: "standard",
    methods: ["Hybrid"],
    frameworks: [],
    workflow: {
      phases: [
        { name: "Initiation", gateType: "review", deliverables: ["Charter"] },
        { name: "Execution", gateType: "checkpoint", deliverables: ["Deliverables"] },
        { name: "Closure", gateType: "sign-off", deliverables: ["Final Report"] },
      ],
      reviewCadence: "biweekly",
    },
    demandSpecs: [
      { role: "Project Lead", capabilityTags: ["leadership", "coordination"], quantityMin: 1, quantityMax: 1, seniorityLevel: "senior" },
      { role: "Team Member", capabilityTags: ["execution", "delivery"], quantityMin: 2, quantityMax: 4, seniorityLevel: "mid" },
    ],
  };
}

/**
 * Resolve a scope code to a full template bundle.
 * Used during PS → PM project creation to populate templateBundleJson.
 */
export async function resolveTemplateBundle(
  scopeCode: string,
): Promise<TemplateBundle> {
  // 1. Try DB mapping first
  const dbMapping = await getTemplateByScopeCode(scopeCode);
  if (dbMapping) {
    const tpl = dbMappingToTemplate(dbMapping);
    return {
      scopeCode,
      governance: tpl.governanceProfile,
      methods: tpl.methods,
      frameworks: tpl.frameworks,
      workflow: tpl.workflow,
      staffing: tpl.demandSpecs,
      systemType: tpl.systemType,
      lifecycleType: tpl.lifecycleType,
      source: "db",
    };
  }

  // 2. Try built-in defaults
  const upperCode = scopeCode.toUpperCase().replace(/-/g, "_");
  if (DEFAULT_TEMPLATES[upperCode]) {
    const tpl = DEFAULT_TEMPLATES[upperCode];
    return {
      scopeCode,
      governance: tpl.governanceProfile,
      methods: tpl.methods,
      frameworks: tpl.frameworks,
      workflow: tpl.workflow,
      staffing: tpl.demandSpecs,
      systemType: tpl.systemType,
      lifecycleType: tpl.lifecycleType,
      source: "builtin",
    };
  }

  // 3. Generic fallback
  const fallback = await resolveTemplate(scopeCode);
  return {
    scopeCode,
    governance: fallback.governanceProfile,
    methods: fallback.methods,
    frameworks: fallback.frameworks,
    workflow: fallback.workflow,
    staffing: fallback.demandSpecs,
    systemType: fallback.systemType,
    lifecycleType: fallback.lifecycleType,
    source: "fallback",
  };
}

function dbMappingToTemplate(mapping: PsScopeTemplateMapping): ScopeTemplate {
  const demandEntries = (mapping.demandTemplateJson || []) as DemandTemplateEntry[];
  const workflowRaw = mapping.workflowJson as { phases: WorkflowPhase[]; reviewCadence?: string } | null;
  return {
    systemType: mapping.systemType,
    lifecycleType: mapping.lifecycleType,
    governanceProfile: mapping.governanceProfile,
    methods: (mapping.methodsJson as string[] | null) || [],
    frameworks: (mapping.frameworksJson as string[] | null) || [],
    workflow: workflowRaw || {
      phases: [
        { name: "Initiation", gateType: "review" },
        { name: "Execution", gateType: "checkpoint" },
        { name: "Closure", gateType: "sign-off" },
      ],
    },
    demandSpecs: demandEntries.map((d) => ({
      role: d.role,
      capabilityTags: d.capabilityTags || [],
      quantityMin: d.quantity,
      quantityMax: d.quantity,
      seniorityLevel: d.seniorityLevel || "mid",
    })),
  };
}

// ── Repository Functions ───────────────────────────────────────────────

export async function getTemplateByScopeCode(
  scopeCode: string,
): Promise<PsScopeTemplateMapping | null> {
  const db = getDb();
  if (!db) return null;
  const [mapping] = await db.select().from(psScopeTemplateMappings)
    .where(and(
      eq(psScopeTemplateMappings.scopeCode, scopeCode),
      eq(psScopeTemplateMappings.isActive, 1),
    ))
    .limit(1);
  return mapping ?? null;
}

export async function listTemplates(): Promise<PsScopeTemplateMapping[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(psScopeTemplateMappings)
    .where(eq(psScopeTemplateMappings.isActive, 1));
}

export async function createTemplate(
  data: InsertPsScopeTemplateMapping,
): Promise<PsScopeTemplateMapping> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  const [created] = await db.insert(psScopeTemplateMappings)
    .values({ ...data, createdAt: new Date(), updatedAt: new Date() })
    .returning();
  return created;
}

export async function updateTemplate(
  id: number,
  data: Partial<InsertPsScopeTemplateMapping>,
): Promise<PsScopeTemplateMapping | null> {
  const db = getDb();
  if (!db) return null;
  const [updated] = await db.update(psScopeTemplateMappings)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(psScopeTemplateMappings.id, id))
    .returning();
  return updated ?? null;
}
