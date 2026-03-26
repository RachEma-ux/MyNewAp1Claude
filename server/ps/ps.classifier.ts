/**
 * PS Module — Deterministic Classifier
 *
 * Rule-based classification engine that maps scenario dimensions
 * to a PS system type. No ML, no YAML, no probabilistic logic.
 *
 * Each rule tests dimension values and votes for a system type
 * with an associated reasoning string. The type with the most
 * matching rules wins. Confidence scales with match consistency.
 */

import type {
  ClassificationDimensions,
  ClassificationInput,
  ClassificationResult,
  PsSystemType,
} from "./ps.types";

// ── Rule definition ───────────────────────────────────────────────────

interface ClassificationRule {
  /** Human-readable identifier */
  id: string;
  /** Dimension key(s) this rule tests */
  dimensionsTested: (keyof ClassificationDimensions)[];
  /** Returns the recommended type if the rule matches, or null */
  match(d: ClassificationDimensions): PsSystemType | null;
  /** Reasoning string when matched */
  reasoning(d: ClassificationDimensions): string;
}

// ── Rules ─────────────────────────────────────────────────────────────

const RULES: ClassificationRule[] = [
  // ── Software Delivery rules ─────────────────────────────────────────
  {
    id: "R01",
    dimensionsTested: ["domain", "lifecycleFocus"],
    match: (d) =>
      d.domain === "software" && d.lifecycleFocus === "product"
        ? "SOFTWARE_DELIVERY"
        : null,
    reasoning: () =>
      "Software domain with product lifecycle focus indicates a software delivery system",
  },
  {
    id: "R02",
    dimensionsTested: ["domain", "deliveryStyle"],
    match: (d) =>
      d.domain === "software" && (d.deliveryStyle === "continuous" || d.deliveryStyle === "agile")
        ? "SOFTWARE_DELIVERY"
        : null,
    reasoning: (d) =>
      `Software domain with ${d.deliveryStyle} delivery aligns with software delivery practices`,
  },
  {
    id: "R03",
    dimensionsTested: ["domain", "valueOrientation"],
    match: (d) =>
      d.domain === "software" && d.valueOrientation === "innovation"
        ? "SOFTWARE_DELIVERY"
        : null,
    reasoning: () =>
      "Software projects focused on innovation typically require a software delivery system",
  },

  // ── Program Management rules ────────────────────────────────────────
  {
    id: "R04",
    dimensionsTested: ["orgLevel"],
    match: (d) =>
      d.orgLevel === "program" ? "PROGRAM_MANAGEMENT" : null,
    reasoning: () =>
      "Program-level organizational scope requires program management coordination",
  },
  {
    id: "R05",
    dimensionsTested: ["orgLevel"],
    match: (d) =>
      d.orgLevel === "portfolio" || d.orgLevel === "enterprise"
        ? "PROGRAM_MANAGEMENT"
        : null,
    reasoning: (d) =>
      `${d.orgLevel}-level scope involves multi-project coordination typical of program management`,
  },
  {
    id: "R06",
    dimensionsTested: ["deliveryStyle", "orgLevel"],
    match: (d) =>
      d.deliveryStyle === "phased" && (d.orgLevel === "department" || d.orgLevel === "program")
        ? "PROGRAM_MANAGEMENT"
        : null,
    reasoning: () =>
      "Phased delivery across departments/programs indicates program management approach",
  },

  // ── Agile Product rules ─────────────────────────────────────────────
  {
    id: "R07",
    dimensionsTested: ["deliveryStyle"],
    match: (d) =>
      d.deliveryStyle === "agile" ? "AGILE_PRODUCT" : null,
    reasoning: () =>
      "Agile delivery style is core to an agile product system",
  },
  {
    id: "R08",
    dimensionsTested: ["lifecycleFocus", "deliveryStyle"],
    match: (d) =>
      d.lifecycleFocus === "product" && d.deliveryStyle !== "waterfall"
        ? "AGILE_PRODUCT"
        : null,
    reasoning: () =>
      "Product lifecycle focus with non-waterfall delivery points toward agile product management",
  },
  {
    id: "R09",
    dimensionsTested: ["valueOrientation", "deliveryStyle"],
    match: (d) =>
      d.valueOrientation === "customer_experience" && d.deliveryStyle === "agile"
        ? "AGILE_PRODUCT"
        : null,
    reasoning: () =>
      "Customer-experience orientation with agile delivery is a classic agile product pattern",
  },

  // ── Project Governance rules ────────────────────────────────────────
  {
    id: "R10",
    dimensionsTested: ["criticality"],
    match: (d) =>
      d.criticality === "critical" ? "PROJECT_GOVERNANCE" : null,
    reasoning: () =>
      "Critical-level criticality demands strong project governance controls",
  },
  {
    id: "R11",
    dimensionsTested: ["criticality", "valueOrientation"],
    match: (d) =>
      d.criticality === "high" && d.valueOrientation === "compliance"
        ? "PROJECT_GOVERNANCE"
        : null,
    reasoning: () =>
      "High criticality combined with compliance orientation requires project governance",
  },
  {
    id: "R12",
    dimensionsTested: ["deliveryStyle", "criticality"],
    match: (d) =>
      d.deliveryStyle === "waterfall" && (d.criticality === "high" || d.criticality === "critical")
        ? "PROJECT_GOVERNANCE"
        : null,
    reasoning: () =>
      "Waterfall delivery with high/critical criticality indicates governance-heavy project system",
  },
  {
    id: "R13",
    dimensionsTested: ["valueOrientation"],
    match: (d) =>
      d.valueOrientation === "compliance" ? "PROJECT_GOVERNANCE" : null,
    reasoning: () =>
      "Compliance-driven value orientation inherently requires project governance structures",
  },

  // ── Operations Improvement rules ────────────────────────────────────
  {
    id: "R14",
    dimensionsTested: ["lifecycleFocus"],
    match: (d) =>
      d.lifecycleFocus === "operations" ? "OPERATIONS_IMPROVEMENT" : null,
    reasoning: () =>
      "Operations lifecycle focus directly maps to operations improvement system",
  },
  {
    id: "R15",
    dimensionsTested: ["valueOrientation"],
    match: (d) =>
      d.valueOrientation === "efficiency" ? "OPERATIONS_IMPROVEMENT" : null,
    reasoning: () =>
      "Efficiency-oriented value focus aligns with operations improvement objectives",
  },
  {
    id: "R16",
    dimensionsTested: ["valueOrientation"],
    match: (d) =>
      d.valueOrientation === "cost_reduction" ? "OPERATIONS_IMPROVEMENT" : null,
    reasoning: () =>
      "Cost reduction focus is a primary driver of operations improvement initiatives",
  },
  {
    id: "R17",
    dimensionsTested: ["domain", "lifecycleFocus"],
    match: (d) =>
      d.domain === "business_process" && d.lifecycleFocus === "operations"
        ? "OPERATIONS_IMPROVEMENT"
        : null,
    reasoning: () =>
      "Business process domain in operations phase is a core operations improvement scenario",
  },
  {
    id: "R18",
    dimensionsTested: ["domain", "deliveryStyle"],
    match: (d) =>
      d.domain === "infrastructure" && d.deliveryStyle === "continuous"
        ? "OPERATIONS_IMPROVEMENT"
        : null,
    reasoning: () =>
      "Infrastructure with continuous delivery indicates operational improvement focus",
  },
];

// ── Classification Engine ─────────────────────────────────────────────

export function classifyScenario(input: ClassificationInput): ClassificationResult {
  const { dimensions } = input;

  // Tally votes per system type
  const votes: Record<PsSystemType, { count: number; reasons: string[]; dims: Set<string> }> = {
    PROJECT_GOVERNANCE: { count: 0, reasons: [], dims: new Set() },
    SOFTWARE_DELIVERY: { count: 0, reasons: [], dims: new Set() },
    PROGRAM_MANAGEMENT: { count: 0, reasons: [], dims: new Set() },
    AGILE_PRODUCT: { count: 0, reasons: [], dims: new Set() },
    OPERATIONS_IMPROVEMENT: { count: 0, reasons: [], dims: new Set() },
  };

  const totalRules = RULES.length;
  let matchedCount = 0;

  for (const rule of RULES) {
    const result = rule.match(dimensions);
    if (result) {
      votes[result].count++;
      votes[result].reasons.push(`[${rule.id}] ${rule.reasoning(dimensions)}`);
      for (const dim of rule.dimensionsTested) {
        votes[result].dims.add(dim);
      }
      matchedCount++;
    }
  }

  // Find winner — highest vote count
  let winner: PsSystemType = "PROJECT_GOVERNANCE"; // fallback
  let maxVotes = 0;
  for (const [type, data] of Object.entries(votes) as [PsSystemType, typeof votes[PsSystemType]][]) {
    if (data.count > maxVotes) {
      maxVotes = data.count;
      winner = type;
    }
  }

  // Compute confidence (0.5 – 0.9)
  // Based on: proportion of matched rules for winner, and total match consistency
  const winnerProportion = matchedCount > 0 ? maxVotes / matchedCount : 0;
  const coverage = matchedCount / totalRules;
  const rawConfidence = 0.5 + 0.4 * (winnerProportion * 0.7 + coverage * 0.3);
  const confidence = Math.min(0.9, Math.max(0.5, Math.round(rawConfidence * 100) / 100));

  return {
    systemType: winner,
    confidence,
    matchedDimensions: Array.from(votes[winner].dims),
    reasoning: votes[winner].reasons,
  };
}
