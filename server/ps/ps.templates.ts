/**
 * PS Module — Scope Template Mapping
 *
 * Maps recommended scope codes to operational PS system templates.
 * Templates define system type, lifecycle, governance profile,
 * and default demand (resource request) specifications.
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

export interface ScopeTemplate {
  systemType: string;
  lifecycleType: string | null;
  governanceProfile: string | null;
  demandSpecs: DemandRoleSpec[];
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
    demandSpecs: [
      { role: "Project Lead", capabilityTags: ["leadership", "coordination"], quantityMin: 1, quantityMax: 1, seniorityLevel: "senior" },
      { role: "Team Member", capabilityTags: ["execution", "delivery"], quantityMin: 2, quantityMax: 4, seniorityLevel: "mid" },
    ],
  };
}

function dbMappingToTemplate(mapping: PsScopeTemplateMapping): ScopeTemplate {
  const demandEntries = (mapping.demandTemplateJson || []) as DemandTemplateEntry[];
  return {
    systemType: mapping.systemType,
    lifecycleType: mapping.lifecycleType,
    governanceProfile: mapping.governanceProfile,
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
