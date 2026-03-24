/**
 * HR Nav Config Validator — Structural and governance integrity checks
 *
 * Phase 6 deliverable — validates the canonical HR nav config for:
 * - Required fields on every item and section
 * - Route coherence (live items must have valid routes)
 * - Governance metadata completeness (scope, masking, audit)
 * - Section ID uniqueness
 * - Action string format consistency
 * - Route alias alignment
 *
 * Phase 9 additions:
 * - Config digest for drift detection (getNavConfigDigest)
 * - Drift comparison against known baseline (detectConfigDrift)
 * - Health summary for admin/settings consumption (getNavHealthSummary)
 * - Section-level completion stats (getSectionCompletionStats)
 * - Dead-end detection (getDeadEndItems)
 *
 * This is a pure validation layer — no side effects, no backend calls.
 * Used by automated tests and optionally at dev-time for config drift detection.
 */

import {
  HR_NAV_CONFIG,
  getAllHrNavItems,
  findUnknownBackendDomains,
  type HrNavItem,
  type HrNavSection,
} from "./hrNavConfig";
import { HR_ROUTE_ALIASES } from "./hrRouteAliases";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationError {
  /** Category of the validation failure */
  category:
    | "missing-field"
    | "invalid-value"
    | "route-coherence"
    | "duplicate"
    | "alias-mismatch"
    | "governance-metadata";
  /** Human-readable description */
  message: string;
  /** The item or section ID that failed */
  entityId: string;
  /** Severity: error = must fix, warning = should fix */
  severity: "error" | "warning";
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  stats: {
    totalSections: number;
    totalItems: number;
    liveItems: number;
    plannedItems: number;
    itemsWithMasking: number;
    itemsWithSensitiveAudit: number;
    itemsWithScopeActions: number;
    uniqueActions: number;
  };
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

const HR_ACTION_PATTERN = /^hr\.[a-z]+\.[a-z]+(\.[a-z]+)?$/;

function validateSections(sections: HrNavSection[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const seenIds = new Set<string>();

  for (const section of sections) {
    // Uniqueness
    if (seenIds.has(section.id)) {
      errors.push({
        category: "duplicate",
        message: `Duplicate section ID: ${section.id}`,
        entityId: section.id,
        severity: "error",
      });
    }
    seenIds.add(section.id);

    // Required fields
    if (!section.id) {
      errors.push({
        category: "missing-field",
        message: "Section missing id",
        entityId: "(unknown)",
        severity: "error",
      });
    }
    if (!section.label) {
      errors.push({
        category: "missing-field",
        message: `Section ${section.id} missing label`,
        entityId: section.id,
        severity: "error",
      });
    }
    if (!section.purpose) {
      errors.push({
        category: "missing-field",
        message: `Section ${section.id} missing purpose`,
        entityId: section.id,
        severity: "warning",
      });
    }
    if (!section.requiredAction) {
      errors.push({
        category: "missing-field",
        message: `Section ${section.id} missing requiredAction`,
        entityId: section.id,
        severity: "error",
      });
    }
    if (!section.visibilityMode) {
      errors.push({
        category: "missing-field",
        message: `Section ${section.id} missing visibilityMode`,
        entityId: section.id,
        severity: "error",
      });
    }

    // Action format
    if (section.requiredAction && !HR_ACTION_PATTERN.test(section.requiredAction)) {
      errors.push({
        category: "invalid-value",
        message: `Section ${section.id} requiredAction "${section.requiredAction}" does not match pattern hr.<domain>.<operation>`,
        entityId: section.id,
        severity: "warning",
      });
    }

    // Items array
    if (!section.items || section.items.length === 0) {
      errors.push({
        category: "missing-field",
        message: `Section ${section.id} has no items`,
        entityId: section.id,
        severity: "warning",
      });
    }
  }

  return errors;
}

function validateItems(items: HrNavItem[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const seenIds = new Set<string>();

  for (const item of items) {
    // Uniqueness
    if (seenIds.has(item.id)) {
      errors.push({
        category: "duplicate",
        message: `Duplicate item ID: ${item.id}`,
        entityId: item.id,
        severity: "error",
      });
    }
    seenIds.add(item.id);

    // Required fields
    if (!item.id) {
      errors.push({
        category: "missing-field",
        message: "Item missing id",
        entityId: "(unknown)",
        severity: "error",
      });
    }
    if (!item.label) {
      errors.push({
        category: "missing-field",
        message: `Item ${item.id} missing label`,
        entityId: item.id,
        severity: "error",
      });
    }
    if (!item.href) {
      errors.push({
        category: "missing-field",
        message: `Item ${item.id} missing href`,
        entityId: item.id,
        severity: "error",
      });
    }
    if (!item.requiredAction) {
      errors.push({
        category: "missing-field",
        message: `Item ${item.id} missing requiredAction`,
        entityId: item.id,
        severity: "error",
      });
    }

    // Action format
    if (item.requiredAction && !HR_ACTION_PATTERN.test(item.requiredAction)) {
      errors.push({
        category: "invalid-value",
        message: `Item ${item.id} requiredAction "${item.requiredAction}" does not match pattern`,
        entityId: item.id,
        severity: "warning",
      });
    }

    // Href format
    if (item.href && !item.href.startsWith("/hr/")) {
      errors.push({
        category: "invalid-value",
        message: `Item ${item.id} href "${item.href}" does not start with /hr/`,
        entityId: item.id,
        severity: "error",
      });
    }

    // Route coherence: live items must have a reachable route
    if (item.implementationStatus === "live" || item.implementationStatus === "placeholder") {
      const route = item.currentRoute ?? item.href;
      if (!route) {
        errors.push({
          category: "route-coherence",
          message: `Live item ${item.id} has no currentRoute or href`,
          entityId: item.id,
          severity: "error",
        });
      }
    }

    // BackedBy coherence
    if (item.backedBy === "not-yet-implemented" && item.implementationStatus === "live") {
      errors.push({
        category: "invalid-value",
        message: `Item ${item.id} is marked live but backedBy is "not-yet-implemented"`,
        entityId: item.id,
        severity: "error",
      });
    }

    // Governance metadata: scope type is required
    if (!item.scopeType) {
      errors.push({
        category: "governance-metadata",
        message: `Item ${item.id} missing scopeType`,
        entityId: item.id,
        severity: "error",
      });
    }

    // Governance metadata: visibility mode is required
    if (!item.visibilityMode) {
      errors.push({
        category: "governance-metadata",
        message: `Item ${item.id} missing visibilityMode`,
        entityId: item.id,
        severity: "error",
      });
    }

    // Masking coherence: if maskingRequired, maskingFieldSet should be set
    if (item.maskingRequired && !item.maskingFieldSet) {
      errors.push({
        category: "governance-metadata",
        message: `Item ${item.id} has maskingRequired but no maskingFieldSet`,
        entityId: item.id,
        severity: "error",
      });
    }

    // Masking coherence: if maskingRequired, sensitiveAction should be set
    if (item.maskingRequired && !item.sensitiveAction) {
      errors.push({
        category: "governance-metadata",
        message: `Item ${item.id} has maskingRequired but no sensitiveAction`,
        entityId: item.id,
        severity: "warning",
      });
    }

    // Scope actions coherence: if scopeType is "mixed", scopeActions should exist
    if (item.scopeType === "mixed" && !item.scopeActions) {
      errors.push({
        category: "governance-metadata",
        message: `Item ${item.id} has scopeType "mixed" but no scopeActions`,
        entityId: item.id,
        severity: "warning",
      });
    }
  }

  return errors;
}

function validateRouteAliases(items: HrNavItem[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const itemRoutes = new Set(items.map((i) => i.currentRoute ?? i.href).filter(Boolean));

  for (const alias of HR_ROUTE_ALIASES) {
    // Old route should exist as a currentRoute or href in the nav config
    if (!itemRoutes.has(alias.oldRoute)) {
      // Not necessarily an error — some aliases point to routes that exist in App.tsx
      // but aren't leaf nav items (like /hr/staffing)
    }

    // Target section should match a real section
    const sectionExists = HR_NAV_CONFIG.sections.some((s) => s.id === alias.targetSection);
    if (!sectionExists) {
      errors.push({
        category: "alias-mismatch",
        message: `Route alias for ${alias.oldRoute} targets non-existent section "${alias.targetSection}"`,
        entityId: alias.oldRoute,
        severity: "error",
      });
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Main Validation Entry Point
// ---------------------------------------------------------------------------

/**
 * Run all validation checks on the HR nav config.
 * Returns a structured result with errors, warnings, and stats.
 */
export function validateHrNavConfig(): ValidationResult {
  const allItems = getAllHrNavItems();
  const sections = HR_NAV_CONFIG.sections;

  const allErrors = [
    ...validateSections(sections),
    ...validateItems(allItems),
    ...validateRouteAliases(allItems),
  ];

  const errors = allErrors.filter((e) => e.severity === "error");
  const warnings = allErrors.filter((e) => e.severity === "warning");

  const liveItems = allItems.filter(
    (i) => i.implementationStatus === "live" || i.implementationStatus === "placeholder",
  );
  const plannedItems = allItems.filter(
    (i) => i.implementationStatus === "not-started" || i.implementationStatus === "planned",
  );
  const uniqueActions = new Set(allItems.map((i) => i.requiredAction));

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalSections: sections.length,
      totalItems: allItems.length,
      liveItems: liveItems.length,
      plannedItems: plannedItems.length,
      itemsWithMasking: allItems.filter((i) => i.maskingRequired).length,
      itemsWithSensitiveAudit: allItems.filter((i) => i.sensitiveReadAudit).length,
      itemsWithScopeActions: allItems.filter((i) => i.scopeActions != null).length,
      uniqueActions: uniqueActions.size,
    },
  };
}

/**
 * Get all live nav items that have a resolved route path.
 * Used to cross-check against App.tsx route registration.
 */
export function getLiveRoutes(): Array<{ itemId: string; route: string; action: string }> {
  return getAllHrNavItems()
    .filter((i) => i.implementationStatus === "live" || i.implementationStatus === "placeholder")
    .map((i) => ({
      itemId: i.id,
      route: i.currentRoute ?? i.href,
      action: i.requiredAction,
    }))
    .filter((r) => r.route != null) as Array<{ itemId: string; route: string; action: string }>;
}

/**
 * Get all section IDs that should have landing routes mounted.
 */
export function getSectionRoutes(): Array<{ sectionId: string; route: string }> {
  return HR_NAV_CONFIG.sections.map((s) => ({
    sectionId: s.id,
    route: s.id === "onboarding-offboarding" ? "/hr/lifecycle" : `/hr/${s.id}`,
  }));
}

// ---------------------------------------------------------------------------
// Phase 9 — Drift Detection
// ---------------------------------------------------------------------------

export interface NavConfigDigest {
  totalSections: number;
  totalItems: number;
  liveCount: number;
  placeholderCount: number;
  notStartedCount: number;
  sectionIds: string[];
  aliasCount: number;
  maskingCount: number;
  auditCount: number;
}

/**
 * Produce a deterministic digest of the nav config shape.
 * Used for drift detection — compare against a known baseline to catch
 * unintentional changes to section/item counts or structure.
 */
export function getNavConfigDigest(): NavConfigDigest {
  const allItems = getAllHrNavItems();
  return {
    totalSections: HR_NAV_CONFIG.sections.length,
    totalItems: allItems.length,
    liveCount: allItems.filter((i) => i.implementationStatus === "live").length,
    placeholderCount: allItems.filter((i) => i.implementationStatus === "placeholder").length,
    notStartedCount: allItems.filter((i) => i.implementationStatus === "not-started").length,
    sectionIds: HR_NAV_CONFIG.sections.map((s) => s.id),
    aliasCount: HR_ROUTE_ALIASES.length,
    maskingCount: allItems.filter((i) => i.maskingRequired).length,
    auditCount: allItems.filter((i) => i.sensitiveReadAudit).length,
  };
}

/**
 * Compare current nav config digest against a known baseline.
 * Returns a list of drift descriptions, or empty array if no drift.
 */
export function detectConfigDrift(baseline: NavConfigDigest): string[] {
  const current = getNavConfigDigest();
  const drifts: string[] = [];

  if (current.totalSections !== baseline.totalSections) {
    drifts.push(`Section count changed: ${baseline.totalSections} → ${current.totalSections}`);
  }
  if (current.totalItems !== baseline.totalItems) {
    drifts.push(`Item count changed: ${baseline.totalItems} → ${current.totalItems}`);
  }
  if (current.liveCount !== baseline.liveCount) {
    drifts.push(`Live item count changed: ${baseline.liveCount} → ${current.liveCount}`);
  }
  if (current.aliasCount !== baseline.aliasCount) {
    drifts.push(`Route alias count changed: ${baseline.aliasCount} → ${current.aliasCount}`);
  }
  if (current.maskingCount !== baseline.maskingCount) {
    drifts.push(`Masking item count changed: ${baseline.maskingCount} → ${current.maskingCount}`);
  }
  if (current.auditCount !== baseline.auditCount) {
    drifts.push(`Audit item count changed: ${baseline.auditCount} → ${current.auditCount}`);
  }

  // Check section IDs match
  const baselineSet = new Set(baseline.sectionIds);
  const currentSet = new Set(current.sectionIds);
  for (const id of current.sectionIds) {
    if (!baselineSet.has(id)) drifts.push(`New section added: ${id}`);
  }
  for (const id of baseline.sectionIds) {
    if (!currentSet.has(id)) drifts.push(`Section removed: ${id}`);
  }

  return drifts;
}

// ---------------------------------------------------------------------------
// Phase 9 — Health Summary
// ---------------------------------------------------------------------------

export interface SectionCompletionStat {
  sectionId: string;
  label: string;
  totalItems: number;
  liveItems: number;
  placeholderItems: number;
  notStartedItems: number;
  completionPct: number;
}

/**
 * Per-section completion stats for admin/developer visibility.
 */
export function getSectionCompletionStats(): SectionCompletionStat[] {
  return HR_NAV_CONFIG.sections.map((s) => {
    const live = s.items.filter((i) => i.implementationStatus === "live").length;
    const placeholder = s.items.filter((i) => i.implementationStatus === "placeholder").length;
    const notStarted = s.items.filter((i) => i.implementationStatus === "not-started").length;
    return {
      sectionId: s.id,
      label: s.label,
      totalItems: s.items.length,
      liveItems: live,
      placeholderItems: placeholder,
      notStartedItems: notStarted,
      completionPct: s.items.length > 0 ? Math.round(((live + placeholder) / s.items.length) * 100) : 0,
    };
  });
}

export interface NavHealthSummary {
  valid: boolean;
  errorCount: number;
  warningCount: number;
  overallCompletionPct: number;
  sectionsComplete: number;
  sectionsPartial: number;
  sectionsEmpty: number;
  deadEndCount: number;
  sections: SectionCompletionStat[];
}

/**
 * Aggregate health summary suitable for display on admin settings page.
 * Pure function — no side effects, no backend calls.
 */
export function getNavHealthSummary(): NavHealthSummary {
  const validation = validateHrNavConfig();
  const sectionStats = getSectionCompletionStats();
  const deadEnds = getDeadEndItems();

  const sectionsComplete = sectionStats.filter((s) => s.completionPct === 100).length;
  const sectionsEmpty = sectionStats.filter((s) => s.completionPct === 0).length;
  const sectionsPartial = sectionStats.length - sectionsComplete - sectionsEmpty;

  const totalItems = sectionStats.reduce((sum, s) => sum + s.totalItems, 0);
  const totalLive = sectionStats.reduce((sum, s) => sum + s.liveItems + s.placeholderItems, 0);

  return {
    valid: validation.valid,
    errorCount: validation.errors.length,
    warningCount: validation.warnings.length,
    overallCompletionPct: totalItems > 0 ? Math.round((totalLive / totalItems) * 100) : 0,
    sectionsComplete,
    sectionsPartial,
    sectionsEmpty,
    deadEndCount: deadEnds.length,
    sections: sectionStats,
  };
}

// ---------------------------------------------------------------------------
// Phase 9 — Dead-End Detection
// ---------------------------------------------------------------------------

/**
 * Items that are live but lead to dead ends (no currentRoute and href doesn't
 * match any known flat route pattern). These represent potential broken links.
 */
export function getDeadEndItems(): Array<{ itemId: string; href: string; reason: string }> {
  const allItems = getAllHrNavItems();
  const deadEnds: Array<{ itemId: string; href: string; reason: string }> = [];

  for (const item of allItems) {
    // Only check live/placeholder items — not-started items are expected to be dead ends
    if (item.implementationStatus !== "live" && item.implementationStatus !== "placeholder") {
      continue;
    }

    const route = item.currentRoute ?? item.href;
    if (!route) {
      deadEnds.push({ itemId: item.id, href: item.href, reason: "No resolvable route" });
      continue;
    }

    // Check for route that doesn't match expected patterns
    if (!route.startsWith("/hr/")) {
      deadEnds.push({ itemId: item.id, href: item.href, reason: `Route "${route}" outside /hr/ namespace` });
    }
  }

  return deadEnds;
}

// ---------------------------------------------------------------------------
// Phase 9 — Baseline Drift Check
// ---------------------------------------------------------------------------

/**
 * Run drift detection against a provided baseline and return a structured result.
 * Unlike detectConfigDrift (which returns string descriptions), this returns
 * a typed result suitable for programmatic checks.
 */
export interface DriftCheckResult {
  drifted: boolean;
  drifts: string[];
  current: NavConfigDigest;
  baseline: NavConfigDigest;
}

export function checkBaselineDrift(baseline: NavConfigDigest): DriftCheckResult {
  const current = getNavConfigDigest();
  const drifts = detectConfigDrift(baseline);
  return {
    drifted: drifts.length > 0,
    drifts,
    current,
    baseline,
  };
}

// ---------------------------------------------------------------------------
// Phase 9 — Backend Domain Validation
// ---------------------------------------------------------------------------

/**
 * Validate that all backendDomain values in the nav config match the
 * HR_BACKEND_DOMAINS constant set. Returns mismatches.
 */
export function validateBackendDomains(): ValidationError[] {
  const unknowns = findUnknownBackendDomains();
  return unknowns.map((u) => ({
    category: "invalid-value" as const,
    message: `Item ${u.itemId} references unknown backendDomain "${u.domain}"`,
    entityId: u.itemId,
    severity: "warning" as const,
  }));
}

// ---------------------------------------------------------------------------
// Phase 9 — Section-Level Deferred Analysis
// ---------------------------------------------------------------------------

export interface SectionDeferredAnalysis {
  sectionId: string;
  label: string;
  totalItems: number;
  deferredItems: number;
  liveItems: number;
  deferredRatio: number;
  /** true if >50% of items are deferred — section may feel thin */
  highDeferralRate: boolean;
  /** IDs of deferred items in this section */
  deferredItemIds: string[];
}

/**
 * Analyze deferred item distribution per section.
 * Identifies sections with high deferral rates that may need
 * priority implementation or better UX messaging.
 */
export function getSectionDeferredAnalysis(): SectionDeferredAnalysis[] {
  return HR_NAV_CONFIG.sections.map((s) => {
    const deferred = s.items.filter((i) => i.implementationStatus === "not-started");
    const live = s.items.filter(
      (i) => i.implementationStatus === "live" || i.implementationStatus === "placeholder",
    );
    const deferredRatio = s.items.length > 0 ? deferred.length / s.items.length : 0;
    return {
      sectionId: s.id,
      label: s.label,
      totalItems: s.items.length,
      deferredItems: deferred.length,
      liveItems: live.length,
      deferredRatio: Math.round(deferredRatio * 100) / 100,
      highDeferralRate: deferredRatio > 0.5,
      deferredItemIds: deferred.map((i) => i.id),
    };
  });
}
