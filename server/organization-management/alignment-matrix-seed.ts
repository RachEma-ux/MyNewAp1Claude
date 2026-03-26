/**
 * Alignment Matrix Seed — Canonical v1 matrix from the source document.
 *
 * Seeds 5 structure types × 10 attributes × 50 cells.
 * Idempotent: skips if an active version already exists for the workspace.
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../db/connection";
import {
  omAlignmentMatrixVersions,
  omAlignmentTypes,
  omAlignmentAttributes,
  omAlignmentCells,
} from "../../drizzle/tables/organization-management";

const SEED_TYPES = [
  { code: "functional", label: "Functional (Expertise)", sortOrder: 1 },
  { code: "divisional", label: "Divisional (Product/Region)", sortOrder: 2 },
  { code: "matrix", label: "Matrix (The Hybrid)", sortOrder: 3 },
  { code: "flat", label: "Flat (The Startup)", sortOrder: 4 },
  { code: "network", label: "Network (The Hub)", sortOrder: 5 },
];

const SEED_ATTRIBUTES = [
  { code: "operational_category", label: "Operational Category", sortOrder: 1 },
  { code: "common_legal_structure", label: "Common Legal Structure", sortOrder: 2 },
  { code: "growth_intent", label: "Growth Intent", sortOrder: 3 },
  { code: "key_focus", label: "Key Focus", sortOrder: 4 },
  { code: "reporting_line", label: "Reporting Line", sortOrder: 5 },
  { code: "pros", label: "Pros (Advantages)", sortOrder: 6 },
  { code: "cons", label: "Cons (Disadvantages)", sortOrder: 7 },
  { code: "best_for", label: "Best For", sortOrder: 8 },
  { code: "vibe", label: 'The "Vibe"', sortOrder: 9 },
  { code: "biggest_risk", label: "Biggest Risk", sortOrder: 10 },
];

const SEED_CELLS: Record<string, Record<string, string>> = {
  functional: {
    operational_category: "Small Business (Stable)",
    common_legal_structure: "LLC or S-Corp",
    growth_intent: "Steady, incremental growth; focuses on mastery.",
    key_focus: "Deep technical expertise and skill mastery.",
    reporting_line: "One boss (e.g., VP of Engineering).",
    pros: "Clear career paths; high efficiency.",
    cons: "Poor communication between silos.",
    best_for: "Efficiency in a single niche.",
    vibe: '"I am a specialist."',
    biggest_risk: "Isolation from broader goals.",
  },
  divisional: {
    operational_category: "Mid-Sized Business",
    common_legal_structure: "C-Corp or S-Corp",
    growth_intent: "Market expansion through diverse offerings.",
    key_focus: "Market agility and specific product success.",
    reporting_line: 'One boss (e.g., Head of "Mobile App").',
    pros: "Fast market response; clear accountability.",
    cons: "Duplication of resources (e.g., 2 HR depts).",
    best_for: "Companies with diverse product lines.",
    vibe: '"Small businesses within a big one."',
    biggest_risk: "High costs due to redundant roles.",
  },
  matrix: {
    operational_category: "Mid-Sized / Scalable Startup",
    common_legal_structure: "C-Corp",
    growth_intent: "Rapid optimization and resource scaling.",
    key_focus: "Resource optimization across multiple projects.",
    reporting_line: "Dual reporting (Functional + Project).",
    pros: "Flexible use of talent; breaks down silos.",
    cons: "High complexity; potential power struggles.",
    best_for: "Complex projects; cross-team input.",
    vibe: "Dynamic but can be stressful.",
    biggest_risk: "Conflicting priorities from two bosses.",
  },
  flat: {
    operational_category: "Scalable & Buyable Startup",
    common_legal_structure: "C-Corp (Delaware)",
    growth_intent: "High-speed search for a repeatable model.",
    key_focus: "High speed, transparency, and autonomy.",
    reporting_line: "Direct to CEO or peer accountability.",
    pros: "Low overhead; fast decision-making.",
    cons: "Hard to maintain as head count grows.",
    best_for: "Small teams and creative ventures.",
    vibe: '"We all do everything."',
    biggest_risk: "Burnout; lack of oversight.",
  },
  network: {
    operational_category: "Offshoot / Lean Startup",
    common_legal_structure: "LLC or Partnership",
    growth_intent: "Lean innovation with low fixed overhead.",
    key_focus: "Core brand innovation and lean operations.",
    reporting_line: "Core team manages external partners.",
    pros: "Scale quickly without high fixed costs.",
    cons: "High dependency on third parties.",
    best_for: "Brands focusing on R&D/Innovation.",
    vibe: '"The orchestrator"; lean and agile.',
    biggest_risk: "Failure if a key partner fails.",
  },
};

/**
 * Seed the canonical alignment matrix v1 for a workspace.
 * If workspaceId is 0 or not provided, seeds a "global" default matrix.
 */
export async function seedAlignmentMatrix(workspaceId: number = 0): Promise<{ created: boolean; skipped: boolean }> {
  const db = getDb();
  if (!db) return { created: false, skipped: true };

  // Check if active version exists for this workspace
  const existing = await db.select({ id: omAlignmentMatrixVersions.id })
    .from(omAlignmentMatrixVersions)
    .where(and(
      eq(omAlignmentMatrixVersions.workspaceId, workspaceId),
      eq(omAlignmentMatrixVersions.status, "active"),
    ))
    .limit(1);

  if (existing.length > 0) {
    return { created: false, skipped: true };
  }

  // Create matrix version
  const [version] = await db.insert(omAlignmentMatrixVersions).values({
    workspaceId,
    name: "Operational, Structural, and Legal Alignment v1",
    description: "Initial governed alignment matrix seeded from enterprise management source",
    status: "active",
    publishedAt: new Date(),
  }).returning();

  // Create types
  const typeIdMap: Record<string, number> = {};
  for (const t of SEED_TYPES) {
    const [created] = await db.insert(omAlignmentTypes).values({
      workspaceId,
      matrixVersionId: version.id,
      code: t.code,
      label: t.label,
      sortOrder: t.sortOrder,
      isActive: true,
    }).returning();
    typeIdMap[t.code] = created.id;
  }

  // Create attributes
  const attrIdMap: Record<string, number> = {};
  for (const a of SEED_ATTRIBUTES) {
    const [created] = await db.insert(omAlignmentAttributes).values({
      workspaceId,
      matrixVersionId: version.id,
      code: a.code,
      label: a.label,
      sortOrder: a.sortOrder,
      isActive: true,
    }).returning();
    attrIdMap[a.code] = created.id;
  }

  // Create cells
  let cellCount = 0;
  for (const [typeCode, cells] of Object.entries(SEED_CELLS)) {
    const typeId = typeIdMap[typeCode];
    for (const [attrCode, valueText] of Object.entries(cells)) {
      const attributeId = attrIdMap[attrCode];
      await db.insert(omAlignmentCells).values({
        workspaceId,
        matrixVersionId: version.id,
        typeId,
        attributeId,
        valueText,
      });
      cellCount++;
    }
  }

  console.log(`[AlignmentMatrixSeed] Seeded v1: ${SEED_TYPES.length} types, ${SEED_ATTRIBUTES.length} attributes, ${cellCount} cells`);
  return { created: true, skipped: false };
}
