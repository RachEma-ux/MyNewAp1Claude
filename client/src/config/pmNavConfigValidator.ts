/**
 * PM Central Nav Config Validator — Structural and governance integrity checks
 *
 * Phase 11 deliverable — reuses the shared validateModuleNavConfig() from
 * moduleNavTypes.ts and adds PM Central-specific checks.
 *
 * PM Central is simpler than HR:
 * - No masking validation (no PII)
 * - No sensitive audit validation
 * - Action pattern: pm.<domain>.<operation>
 */

import { PM_NAV_CONFIG, getAllPmNavItems } from "./pmNavConfig";
import {
  validateModuleNavConfig,
  type ModuleNavValidationResult,
} from "./moduleNavTypes";

// ---------------------------------------------------------------------------
// PM Central Action Pattern
// ---------------------------------------------------------------------------

const PM_ACTION_PATTERN = /^pm\.[a-z]+\.[a-z]+$/;

// ---------------------------------------------------------------------------
// Main Validation Entry Point
// ---------------------------------------------------------------------------

/**
 * Run all validation checks on the PM Central nav config.
 * Combines shared structural validation with PM-specific checks.
 */
export function validatePmNavConfig(): ModuleNavValidationResult {
  return validateModuleNavConfig(PM_NAV_CONFIG, PM_ACTION_PATTERN);
}

/**
 * Get all live PM nav items that have a resolved route path.
 * Used to cross-check against App.tsx route registration.
 */
export function getPmLiveRoutes(): Array<{ itemId: string; route: string; action: string }> {
  return getAllPmNavItems()
    .filter((i) => i.implementationStatus === "live" || i.implementationStatus === "placeholder")
    .map((i) => ({
      itemId: i.id,
      route: i.currentRoute ?? i.href,
      action: i.requiredAction,
    }))
    .filter((r) => r.route != null) as Array<{ itemId: string; route: string; action: string }>;
}

/**
 * Get all PM section landing routes.
 */
export function getPmSectionRoutes(): Array<{ sectionId: string; route: string }> {
  return PM_NAV_CONFIG.sections.map((s) => ({
    sectionId: s.id,
    route: s.currentRoute ?? s.href,
  }));
}
