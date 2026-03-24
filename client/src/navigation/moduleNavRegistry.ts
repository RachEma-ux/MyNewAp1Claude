/**
 * Module Nav Adoption Registry — Platform-wide adoption status
 *
 * Phase 12 deliverable — provides a single source of truth for which modules
 * have adopted the shared module-nav standard, their current status, and
 * readiness for rollout.
 *
 * Phase 13 extension — adds compliance status, exception tracking, and
 * validation state to support enforceable compliance checks.
 *
 * This registry is code-facing and can be imported by validation, governance,
 * and admin tooling to determine the adoption state of each module.
 */

// ---------------------------------------------------------------------------
// Adoption Status Enum
// ---------------------------------------------------------------------------

export type NavAdoptionStatus =
  | "reference"     // The canonical reference implementation (HR)
  | "pilot"         // Phase 11 pilot module (PM Central)
  | "wave-1"        // Phase 12 Wave 1 adoption
  | "legacy"        // Uses hardcoded sidebar nav, not yet adopted
  | "deferred"      // Evaluated and intentionally deferred
  | "not-applicable"; // Module does not need section-based nav

// ---------------------------------------------------------------------------
// Phase 13 — Compliance & Exception Types
// ---------------------------------------------------------------------------

export type NavComplianceStatus =
  | "compliant"           // Meets all mandatory requirements
  | "partially-compliant" // Nav config exists but some gaps remain
  | "exempt"              // Not subject to compliance (legacy/deferred/n-a)
  | "non-compliant";      // Adopted but fails compliance checks

export type NavExceptionStatus =
  | "none"                // No exception needed
  | "active"              // Has active exception(s) in the exception registry
  | "not-required";       // Exempt modules — no exception tracking needed

// ---------------------------------------------------------------------------
// Registry Entry
// ---------------------------------------------------------------------------

export interface ModuleNavRegistryEntry {
  /** Module identifier */
  moduleId: string;
  /** Human-readable label */
  label: string;
  /** Base route prefix (e.g., "/hr", "/automation") */
  baseRoute: string;
  /** Current adoption status */
  adoptionStatus: NavAdoptionStatus;
  /** Whether a canonical nav config file exists */
  navConfigExists: boolean;
  /** Path to nav config file (if exists) */
  navConfigPath?: string;
  /** Whether a governance pack exists in Governance-Centrale */
  governancePackExists: boolean;
  /** Path to governance pack directory */
  governancePackPath?: string;
  /** Whether routes are normalized to the standard pattern */
  routeNormalizationStatus: "complete" | "partial" | "not-started";
  /** Whether visibility/permission alignment follows the standard */
  visibilityAlignmentStatus: "complete" | "partial" | "not-started";
  /** Overall rollout readiness */
  rolloutReadiness: "ready" | "in-progress" | "blocked" | "not-started";
  /** Next action for this module */
  nextAction: string;
  /** Phase that introduced this module's adoption */
  adoptionPhase?: number;

  // --- Phase 13: Compliance & Exception fields ---

  /** Current compliance status per MODULE_NAV_ENFORCEMENT_POLICY.md */
  complianceStatus: NavComplianceStatus;
  /** Whether this module has active exceptions in the exception registry */
  exceptionStatus: NavExceptionStatus;
  /** Exception IDs from MODULE_NAV_EXCEPTION_REGISTRY.md (if any) */
  exceptionIds?: string[];
  /** Last validation result — did structural validation pass? */
  validationPasses: boolean | null;
}

// ---------------------------------------------------------------------------
// Canonical Registry
// ---------------------------------------------------------------------------

export const MODULE_NAV_REGISTRY: ModuleNavRegistryEntry[] = [
  // -------------------------------------------------------------------------
  // Reference Implementation
  // -------------------------------------------------------------------------
  {
    moduleId: "human-resources",
    label: "Human Resources",
    baseRoute: "/hr",
    adoptionStatus: "reference",
    navConfigExists: true,
    navConfigPath: "client/src/config/hrNavConfig.ts",
    governancePackExists: true,
    governancePackPath: "Governance-Centrale/modules/human-resources/",
    routeNormalizationStatus: "complete",
    visibilityAlignmentStatus: "complete",
    rolloutReadiness: "ready",
    nextAction: "Maintain as reference. Monitor drift via baseline checks.",
    adoptionPhase: 1,
    complianceStatus: "compliant",
    exceptionStatus: "active",
    exceptionIds: ["EX-001"],
    validationPasses: true,
  },

  // -------------------------------------------------------------------------
  // Phase 11 Pilot
  // -------------------------------------------------------------------------
  {
    moduleId: "pm-central",
    label: "PM Central",
    baseRoute: "/pm-central",
    adoptionStatus: "pilot",
    navConfigExists: true,
    navConfigPath: "client/src/config/pmNavConfig.ts",
    governancePackExists: true,
    governancePackPath: "Governance-Centrale/modules/pm-central/",
    routeNormalizationStatus: "complete",
    visibilityAlignmentStatus: "complete",
    rolloutReadiness: "ready",
    nextAction: "Stable pilot. Promote to wave-1 or keep as pilot reference.",
    adoptionPhase: 11,
    complianceStatus: "compliant",
    exceptionStatus: "none",
    validationPasses: true,
  },

  // -------------------------------------------------------------------------
  // Wave 1 Adoption (Phase 12)
  // -------------------------------------------------------------------------
  {
    moduleId: "automation",
    label: "Automation",
    baseRoute: "/automation",
    adoptionStatus: "wave-1",
    navConfigExists: true,
    navConfigPath: "client/src/config/automationNavConfig.ts",
    governancePackExists: true,
    governancePackPath: "Governance-Centrale/modules/automation/",
    routeNormalizationStatus: "complete",
    visibilityAlignmentStatus: "partial",
    rolloutReadiness: "ready",
    nextAction: "Monitor adoption. Add permission gating when auth model matures.",
    adoptionPhase: 12,
    complianceStatus: "partially-compliant",
    exceptionStatus: "active",
    exceptionIds: ["EX-002"],
    validationPasses: true,
  },

  // -------------------------------------------------------------------------
  // Legacy Modules (not yet adopted)
  // -------------------------------------------------------------------------
  {
    moduleId: "ai-types",
    label: "AI Types",
    baseRoute: "/ai-types",
    adoptionStatus: "legacy",
    navConfigExists: false,
    governancePackExists: false,
    routeNormalizationStatus: "not-started",
    visibilityAlignmentStatus: "not-started",
    rolloutReadiness: "not-started",
    nextAction: "Complex multi-level nav (5 sub-entities). Good Wave 2 candidate but requires careful section design.",
    complianceStatus: "exempt",
    exceptionStatus: "active",
    exceptionIds: ["EX-003"],
    validationPasses: null,
  },
  {
    moduleId: "digital-hq",
    label: "Digital HQ",
    baseRoute: "/hq",
    adoptionStatus: "legacy",
    navConfigExists: false,
    governancePackExists: false,
    routeNormalizationStatus: "not-started",
    visibilityAlignmentStatus: "not-started",
    rolloutReadiness: "not-started",
    nextAction: "Good Wave 2 candidate. 8 items, clear structure, governance-aligned.",
    complianceStatus: "exempt",
    exceptionStatus: "active",
    exceptionIds: ["EX-004"],
    validationPasses: null,
  },
  {
    moduleId: "governance-center",
    label: "Governance Center",
    baseRoute: "/governance",
    adoptionStatus: "legacy",
    navConfigExists: false,
    governancePackExists: false,
    routeNormalizationStatus: "not-started",
    visibilityAlignmentStatus: "not-started",
    rolloutReadiness: "not-started",
    nextAction: "Good Wave 2 candidate. 8 items, natural governance alignment.",
    complianceStatus: "exempt",
    exceptionStatus: "active",
    exceptionIds: ["EX-005"],
    validationPasses: null,
  },
  {
    moduleId: "infrastructure",
    label: "Infrastructure",
    baseRoute: "/infrastructure",
    adoptionStatus: "deferred",
    navConfigExists: false,
    governancePackExists: false,
    routeNormalizationStatus: "not-started",
    visibilityAlignmentStatus: "not-started",
    rolloutReadiness: "not-started",
    nextAction: "Deferred — placeholder pages (item1-item7), no real domain logic yet.",
    complianceStatus: "exempt",
    exceptionStatus: "active",
    exceptionIds: ["EX-006"],
    validationPasses: null,
  },
  {
    moduleId: "workspaces",
    label: "Workspaces",
    baseRoute: "/ws",
    adoptionStatus: "deferred",
    navConfigExists: false,
    governancePackExists: false,
    routeNormalizationStatus: "not-started",
    visibilityAlignmentStatus: "not-started",
    rolloutReadiness: "not-started",
    nextAction: "Deferred — workspace management, small surface (5 items), lower priority.",
    complianceStatus: "exempt",
    exceptionStatus: "active",
    exceptionIds: ["EX-007"],
    validationPasses: null,
  },
  {
    moduleId: "communication",
    label: "Communication",
    baseRoute: "/chat",
    adoptionStatus: "deferred",
    navConfigExists: false,
    governancePackExists: false,
    routeNormalizationStatus: "not-started",
    visibilityAlignmentStatus: "not-started",
    rolloutReadiness: "not-started",
    nextAction: "Deferred — only 3 items, too small for section-based nav benefit.",
    complianceStatus: "exempt",
    exceptionStatus: "active",
    exceptionIds: ["EX-008"],
    validationPasses: null,
  },
  {
    moduleId: "wiki",
    label: "Wiki",
    baseRoute: "/wiki",
    adoptionStatus: "not-applicable",
    navConfigExists: false,
    governancePackExists: false,
    routeNormalizationStatus: "not-started",
    visibilityAlignmentStatus: "not-started",
    rolloutReadiness: "not-started",
    nextAction: "Single-page module with sub-routes. Not applicable for section nav.",
    complianceStatus: "exempt",
    exceptionStatus: "not-required",
    validationPasses: null,
  },
  {
    moduleId: "resources",
    label: "Resources",
    baseRoute: "/resources",
    adoptionStatus: "not-applicable",
    navConfigExists: false,
    governancePackExists: false,
    routeNormalizationStatus: "not-started",
    visibilityAlignmentStatus: "not-started",
    rolloutReadiness: "not-started",
    nextAction: "Single-page module. Not applicable for section nav.",
    complianceStatus: "exempt",
    exceptionStatus: "not-required",
    validationPasses: null,
  },
];

// ---------------------------------------------------------------------------
// Registry Helpers
// ---------------------------------------------------------------------------

/** Get all modules that have adopted the standard */
export function getAdoptedModules(): ModuleNavRegistryEntry[] {
  return MODULE_NAV_REGISTRY.filter(
    (m) => m.adoptionStatus === "reference" || m.adoptionStatus === "pilot" || m.adoptionStatus === "wave-1",
  );
}

/** Get all legacy modules not yet adopted */
export function getLegacyModules(): ModuleNavRegistryEntry[] {
  return MODULE_NAV_REGISTRY.filter((m) => m.adoptionStatus === "legacy");
}

/** Get a module by ID */
export function getModuleById(moduleId: string): ModuleNavRegistryEntry | undefined {
  return MODULE_NAV_REGISTRY.find((m) => m.moduleId === moduleId);
}

/** Count modules by adoption status */
export function countByAdoptionStatus(): Record<NavAdoptionStatus, number> {
  const counts: Record<NavAdoptionStatus, number> = {
    reference: 0,
    pilot: 0,
    "wave-1": 0,
    legacy: 0,
    deferred: 0,
    "not-applicable": 0,
  };
  for (const m of MODULE_NAV_REGISTRY) {
    counts[m.adoptionStatus]++;
  }
  return counts;
}

/** Count modules by compliance status (Phase 13) */
export function countByComplianceStatus(): Record<NavComplianceStatus, number> {
  const counts: Record<NavComplianceStatus, number> = {
    compliant: 0,
    "partially-compliant": 0,
    exempt: 0,
    "non-compliant": 0,
  };
  for (const m of MODULE_NAV_REGISTRY) {
    counts[m.complianceStatus]++;
  }
  return counts;
}

/** Get modules with active exceptions */
export function getModulesWithExceptions(): ModuleNavRegistryEntry[] {
  return MODULE_NAV_REGISTRY.filter((m) => m.exceptionStatus === "active");
}

/** Get the adoption summary for platform-level reporting */
export function getAdoptionSummary() {
  const adoptionCounts = countByAdoptionStatus();
  const complianceCounts = countByComplianceStatus();
  const adopted = adoptionCounts.reference + adoptionCounts.pilot + adoptionCounts["wave-1"];
  const total = MODULE_NAV_REGISTRY.length;
  return {
    totalModules: total,
    adoptedModules: adopted,
    adoptionRate: total > 0 ? Math.round((adopted / total) * 100) : 0,
    adoptionCounts,
    complianceCounts,
    modulesWithExceptions: getModulesWithExceptions().length,
  };
}
