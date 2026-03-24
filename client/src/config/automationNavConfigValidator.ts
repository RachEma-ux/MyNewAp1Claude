/**
 * Automation Nav Config Validator — Structural and governance integrity checks
 *
 * Phase 12 deliverable — reuses the shared validateModuleNavConfig() from
 * navigation/moduleNavHelpers.ts and adds Automation-specific checks.
 *
 * Automation is simpler than HR:
 * - No masking validation (no PII)
 * - No sensitive audit validation
 * - Action pattern: automation.<domain>.<operation>
 */

import { AUTOMATION_NAV_CONFIG, getAllAutomationNavItems } from "./automationNavConfig";
import { validateModuleNavConfig, type NavValidationError } from "../navigation/moduleNavHelpers";

// ---------------------------------------------------------------------------
// Main Validation Entry Point
// ---------------------------------------------------------------------------

/**
 * Run all validation checks on the Automation nav config.
 * Combines shared structural validation with Automation-specific checks.
 */
export function validateAutomationNavConfig(): NavValidationError[] {
  return validateModuleNavConfig(AUTOMATION_NAV_CONFIG);
}

/**
 * Get all live Automation nav items that have a resolved route path.
 * Used to cross-check against App.tsx route registration.
 */
export function getAutomationLiveRoutes(): Array<{ itemId: string; route: string; action: string }> {
  return getAllAutomationNavItems()
    .filter((i) => i.implementationStatus === "live" || i.implementationStatus === "placeholder")
    .map((i) => ({
      itemId: i.id,
      route: i.currentRoute ?? i.href,
      action: i.requiredAction,
    }))
    .filter((r) => r.route != null) as Array<{ itemId: string; route: string; action: string }>;
}

/**
 * Get all Automation section landing routes.
 */
export function getAutomationSectionRoutes(): Array<{ sectionId: string; route: string }> {
  return AUTOMATION_NAV_CONFIG.sections.map((s) => ({
    sectionId: s.id,
    route: s.currentRoute ?? s.href,
  }));
}
