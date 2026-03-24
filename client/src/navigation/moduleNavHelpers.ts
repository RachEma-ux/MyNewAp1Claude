/**
 * Module Navigation Helpers — Shared utilities for Carbon SideNav pattern
 *
 * Generic helper functions that operate on any ModuleNavConfig.
 * These are the proven patterns extracted from the HR reference implementation.
 *
 * All functions are pure — no side effects, no backend calls, no DOM access.
 *
 * Phase 10 deliverable — platform standardization.
 */

import type {
  ModuleNavConfig,
  ModuleNavItem,
  ModuleNavSection,
  ImplementationStatus,
  BackedBy,
  ScopeType,
  VisibilityMode,
} from "./moduleNavTypes";

import {
  SCOPE_TYPES,
  VISIBILITY_MODES,
  BACKED_BY_VALUES,
  IMPLEMENTATION_STATUSES,
  ACTION_PATTERN,
} from "./moduleNavTypes";

// ---------------------------------------------------------------------------
// Item Access
// ---------------------------------------------------------------------------

/** Flatten all nav items from all sections into a single list */
export function getAllItems(config: ModuleNavConfig): ModuleNavItem[] {
  return config.sections.flatMap((s) => s.items);
}

/** Filter items by implementation status */
export function filterByStatus(
  config: ModuleNavConfig,
  status: ImplementationStatus,
): ModuleNavItem[] {
  return getAllItems(config).filter((i) => i.implementationStatus === status);
}

/** Filter items by backedBy value */
export function filterByBackedBy(
  config: ModuleNavConfig,
  backed: BackedBy,
): ModuleNavItem[] {
  return getAllItems(config).filter((i) => i.backedBy === backed);
}

/** Find a section by its ID */
export function findSection(
  config: ModuleNavConfig,
  sectionId: string,
): ModuleNavSection | undefined {
  return config.sections.find((s) => s.id === sectionId);
}

/** Find an item by its target href */
export function findItemByHref(
  config: ModuleNavConfig,
  href: string,
): ModuleNavItem | undefined {
  return getAllItems(config).find((i) => i.href === href);
}

/** Get the section that contains a given item ID */
export function getSectionForItem(
  config: ModuleNavConfig,
  itemId: string,
): ModuleNavSection | undefined {
  return config.sections.find((s) => s.items.some((i) => i.id === itemId));
}

// ---------------------------------------------------------------------------
// Counting / Stats
// ---------------------------------------------------------------------------

/** Count items by implementation status */
export function countByStatus(
  config: ModuleNavConfig,
): Record<ImplementationStatus, number> {
  const items = getAllItems(config);
  return {
    live: items.filter((i) => i.implementationStatus === "live").length,
    placeholder: items.filter((i) => i.implementationStatus === "placeholder").length,
    planned: items.filter((i) => i.implementationStatus === "planned").length,
    "not-started": items.filter((i) => i.implementationStatus === "not-started").length,
  };
}

/** Count items by backedBy value */
export function countByBackedBy(
  config: ModuleNavConfig,
): Record<BackedBy, number> {
  const items = getAllItems(config);
  return {
    "existing-page": items.filter((i) => i.backedBy === "existing-page").length,
    "new-page": items.filter((i) => i.backedBy === "new-page").length,
    "tab-in-existing-page": items.filter((i) => i.backedBy === "tab-in-existing-page").length,
    "not-yet-implemented": items.filter((i) => i.backedBy === "not-yet-implemented").length,
  };
}

// ---------------------------------------------------------------------------
// Structural Validation
// ---------------------------------------------------------------------------

export interface NavValidationError {
  category: "missing-field" | "invalid-value" | "route-coherence" | "duplicate" | "governance-metadata";
  message: string;
  entityId: string;
  severity: "error" | "warning";
}

/**
 * Validate a module nav config for structural integrity.
 * Returns a list of validation errors/warnings.
 *
 * Checks:
 * - Required fields on sections and items
 * - Unique IDs
 * - Valid enum values
 * - Action string format
 * - Route coherence (live items must have routes)
 * - BackedBy/implementationStatus coherence
 */
export function validateModuleNavConfig(config: ModuleNavConfig): NavValidationError[] {
  const errors: NavValidationError[] = [];
  const sectionIds = new Set<string>();
  const itemIds = new Set<string>();

  for (const section of config.sections) {
    // Section uniqueness
    if (sectionIds.has(section.id)) {
      errors.push({ category: "duplicate", message: `Duplicate section ID: ${section.id}`, entityId: section.id, severity: "error" });
    }
    sectionIds.add(section.id);

    // Section required fields
    if (!section.id) errors.push({ category: "missing-field", message: "Section missing id", entityId: "(unknown)", severity: "error" });
    if (!section.label) errors.push({ category: "missing-field", message: `Section ${section.id} missing label`, entityId: section.id, severity: "error" });
    if (!section.requiredAction) errors.push({ category: "missing-field", message: `Section ${section.id} missing requiredAction`, entityId: section.id, severity: "error" });
    if (!section.visibilityMode) errors.push({ category: "missing-field", message: `Section ${section.id} missing visibilityMode`, entityId: section.id, severity: "error" });

    // Section enum validation
    if (section.requiredAction && !ACTION_PATTERN.test(section.requiredAction)) {
      errors.push({ category: "invalid-value", message: `Section ${section.id} requiredAction does not match action pattern`, entityId: section.id, severity: "warning" });
    }
    if (section.visibilityMode && !VISIBILITY_MODES.includes(section.visibilityMode)) {
      errors.push({ category: "invalid-value", message: `Section ${section.id} has invalid visibilityMode`, entityId: section.id, severity: "error" });
    }

    for (const item of section.items) {
      // Item uniqueness
      if (itemIds.has(item.id)) {
        errors.push({ category: "duplicate", message: `Duplicate item ID: ${item.id}`, entityId: item.id, severity: "error" });
      }
      itemIds.add(item.id);

      // Item required fields
      if (!item.id) errors.push({ category: "missing-field", message: "Item missing id", entityId: "(unknown)", severity: "error" });
      if (!item.label) errors.push({ category: "missing-field", message: `Item ${item.id} missing label`, entityId: item.id, severity: "error" });
      if (!item.href) errors.push({ category: "missing-field", message: `Item ${item.id} missing href`, entityId: item.id, severity: "error" });
      if (!item.requiredAction) errors.push({ category: "missing-field", message: `Item ${item.id} missing requiredAction`, entityId: item.id, severity: "error" });
      if (!item.scopeType) errors.push({ category: "governance-metadata", message: `Item ${item.id} missing scopeType`, entityId: item.id, severity: "error" });
      if (!item.visibilityMode) errors.push({ category: "governance-metadata", message: `Item ${item.id} missing visibilityMode`, entityId: item.id, severity: "error" });

      // Enum validation
      if (item.scopeType && !SCOPE_TYPES.includes(item.scopeType)) {
        errors.push({ category: "invalid-value", message: `Item ${item.id} has invalid scopeType`, entityId: item.id, severity: "error" });
      }
      if (item.visibilityMode && !VISIBILITY_MODES.includes(item.visibilityMode)) {
        errors.push({ category: "invalid-value", message: `Item ${item.id} has invalid visibilityMode`, entityId: item.id, severity: "error" });
      }
      if (item.backedBy && !BACKED_BY_VALUES.includes(item.backedBy)) {
        errors.push({ category: "invalid-value", message: `Item ${item.id} has invalid backedBy`, entityId: item.id, severity: "error" });
      }
      if (item.implementationStatus && !IMPLEMENTATION_STATUSES.includes(item.implementationStatus)) {
        errors.push({ category: "invalid-value", message: `Item ${item.id} has invalid implementationStatus`, entityId: item.id, severity: "error" });
      }

      // Action format
      if (item.requiredAction && !ACTION_PATTERN.test(item.requiredAction)) {
        errors.push({ category: "invalid-value", message: `Item ${item.id} requiredAction does not match action pattern`, entityId: item.id, severity: "warning" });
      }

      // Href prefix
      if (item.href && !item.href.startsWith(config.baseRoute + "/")) {
        errors.push({ category: "invalid-value", message: `Item ${item.id} href "${item.href}" does not start with ${config.baseRoute}/`, entityId: item.id, severity: "error" });
      }

      // Route coherence
      if (item.implementationStatus === "live" || item.implementationStatus === "placeholder") {
        const route = item.currentRoute ?? item.href;
        if (!route) {
          errors.push({ category: "route-coherence", message: `Live item ${item.id} has no resolvable route`, entityId: item.id, severity: "error" });
        }
      }

      // BackedBy/status coherence
      if (item.backedBy === "not-yet-implemented" && item.implementationStatus === "live") {
        errors.push({ category: "invalid-value", message: `Item ${item.id} is live but backedBy is "not-yet-implemented"`, entityId: item.id, severity: "error" });
      }

      // Masking coherence
      if (item.maskingRequired && !item.sensitiveAction) {
        errors.push({ category: "governance-metadata", message: `Item ${item.id} has maskingRequired but no sensitiveAction`, entityId: item.id, severity: "warning" });
      }
    }
  }

  return errors;
}
