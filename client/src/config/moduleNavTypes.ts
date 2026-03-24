/**
 * Module Nav Standard — Shared Types & Contract
 *
 * Phase 11 deliverable — extracts the generalizable parts of the HR Carbon
 * SideNav pattern into a shared contract that any module can adopt.
 *
 * Modules adopting this standard create their own canonical nav config
 * using these shared types. Module-specific extensions (e.g., HR's masking
 * metadata) remain in the module's own config — this contract covers only
 * the universally applicable fields.
 *
 * Proven across: HR (Phase 1–10), PM Central (Phase 11 pilot)
 */

// ---------------------------------------------------------------------------
// Core Enums / Literals
// ---------------------------------------------------------------------------

export type ScopeType = "self" | "team" | "all" | "sensitive" | "mixed";

export type VisibilityMode =
  | "show"
  | "hide-if-no-access"
  | "show-disabled"
  | "redirect-to-parent";

export type BackedBy =
  | "existing-page"
  | "new-page"
  | "tab-in-existing-page"
  | "not-yet-implemented";

export type ImplementationStatus =
  | "live"
  | "placeholder"
  | "planned"
  | "not-started";

// ---------------------------------------------------------------------------
// Nav Item — leaf-level navigation entry
// ---------------------------------------------------------------------------

export interface ModuleNavItem {
  /** Unique item ID within the module */
  id: string;
  /** Display label */
  label: string;
  /** Target route path */
  href: string;
  /** Parent section ID */
  section: string;
  /** Lucide/Carbon icon hint */
  iconHint?: string;
  /** Human-readable purpose/description */
  purpose?: string;
  /** Permission action string required to access this item */
  requiredAction: string;
  /** Data scope classification */
  scopeType: ScopeType;
  /** How to handle visibility when user lacks permission */
  visibilityMode: VisibilityMode;
  /** Implementation backing strategy */
  backedBy: BackedBy;
  /** Backend domain this item reads from */
  backendDomain: string;
  /** Current implementation status */
  implementationStatus: ImplementationStatus;
  /** Current flat route that already serves this capability (if different from href) */
  currentRoute?: string;
  /** Current React component filename backing this item */
  currentComponent?: string;
}

// ---------------------------------------------------------------------------
// Nav Section — grouping of related nav items
// ---------------------------------------------------------------------------

export interface ModuleNavSection {
  /** Unique section ID within the module */
  id: string;
  /** Display label */
  label: string;
  /** Icon hint */
  iconHint: string;
  /** Human-readable purpose */
  purpose: string;
  /** Section landing page route */
  href: string;
  /** Permission action for section-level access */
  requiredAction: string;
  /** Data scope classification */
  scopeType: ScopeType;
  /** Visibility mode */
  visibilityMode: VisibilityMode;
  /** Implementation backing */
  backedBy: BackedBy;
  /** Backend domain */
  backendDomain: string;
  /** Implementation status */
  implementationStatus: ImplementationStatus;
  /** Current route if different from href */
  currentRoute?: string;
  /** Current component */
  currentComponent?: string;
  /** Child nav items */
  items: ModuleNavItem[];
}

// ---------------------------------------------------------------------------
// Nav Module — top-level module config
// ---------------------------------------------------------------------------

export interface ModuleNavConfig {
  /** Module identifier (e.g., "human-resources", "pm-central") */
  id: string;
  /** Display label */
  label: string;
  /** Base route prefix (e.g., "/hr", "/pm-central") */
  baseRoute: string;
  /** Ordered sections */
  sections: ModuleNavSection[];
}

// ---------------------------------------------------------------------------
// Validation Types (shared across all modules)
// ---------------------------------------------------------------------------

export interface ModuleNavValidationError {
  category:
    | "missing-field"
    | "invalid-value"
    | "route-coherence"
    | "duplicate"
    | "governance-metadata";
  message: string;
  entityId: string;
  severity: "error" | "warning";
}

export interface ModuleNavValidationResult {
  valid: boolean;
  errors: ModuleNavValidationError[];
  warnings: ModuleNavValidationError[];
  stats: {
    totalSections: number;
    totalItems: number;
    liveItems: number;
    plannedItems: number;
    uniqueActions: number;
  };
}

// ---------------------------------------------------------------------------
// Shared Helpers
// ---------------------------------------------------------------------------

/** Flatten all nav items from a module config */
export function getAllModuleNavItems(config: ModuleNavConfig): ModuleNavItem[] {
  return config.sections.flatMap((s) => s.items);
}

/** Get items by implementation status */
export function getModuleItemsByStatus(
  config: ModuleNavConfig,
  status: ImplementationStatus,
): ModuleNavItem[] {
  return getAllModuleNavItems(config).filter((i) => i.implementationStatus === status);
}

/** Get items by backedBy classification */
export function getModuleItemsByBackedBy(
  config: ModuleNavConfig,
  backedBy: BackedBy,
): ModuleNavItem[] {
  return getAllModuleNavItems(config).filter((i) => i.backedBy === backedBy);
}

/** Find a section by ID */
export function findModuleSectionById(
  config: ModuleNavConfig,
  sectionId: string,
): ModuleNavSection | undefined {
  return config.sections.find((s) => s.id === sectionId);
}

/** Find an item by href */
export function findModuleItemByHref(
  config: ModuleNavConfig,
  href: string,
): ModuleNavItem | undefined {
  return getAllModuleNavItems(config).find((i) => i.href === href);
}

// ---------------------------------------------------------------------------
// Shared Validation
// ---------------------------------------------------------------------------

/**
 * Generic module nav config validator.
 * Checks structural integrity, field completeness, and governance metadata.
 * Module-specific checks (e.g., HR's masking validation) remain in module code.
 */
export function validateModuleNavConfig(
  config: ModuleNavConfig,
  actionPattern?: RegExp,
): ModuleNavValidationResult {
  const allItems = getAllModuleNavItems(config);
  const allErrors: ModuleNavValidationError[] = [];

  // --- Section validation ---
  const seenSectionIds = new Set<string>();
  for (const section of config.sections) {
    if (seenSectionIds.has(section.id)) {
      allErrors.push({
        category: "duplicate",
        message: `Duplicate section ID: ${section.id}`,
        entityId: section.id,
        severity: "error",
      });
    }
    seenSectionIds.add(section.id);

    if (!section.id) allErrors.push({ category: "missing-field", message: "Section missing id", entityId: "(unknown)", severity: "error" });
    if (!section.label) allErrors.push({ category: "missing-field", message: `Section ${section.id} missing label`, entityId: section.id, severity: "error" });
    if (!section.requiredAction) allErrors.push({ category: "missing-field", message: `Section ${section.id} missing requiredAction`, entityId: section.id, severity: "error" });
    if (!section.visibilityMode) allErrors.push({ category: "missing-field", message: `Section ${section.id} missing visibilityMode`, entityId: section.id, severity: "error" });

    if (actionPattern && section.requiredAction && !actionPattern.test(section.requiredAction)) {
      allErrors.push({ category: "invalid-value", message: `Section ${section.id} requiredAction "${section.requiredAction}" does not match expected pattern`, entityId: section.id, severity: "warning" });
    }

    if (!section.items || section.items.length === 0) {
      allErrors.push({ category: "missing-field", message: `Section ${section.id} has no items`, entityId: section.id, severity: "warning" });
    }
  }

  // --- Item validation ---
  const seenItemIds = new Set<string>();
  for (const item of allItems) {
    if (seenItemIds.has(item.id)) {
      allErrors.push({ category: "duplicate", message: `Duplicate item ID: ${item.id}`, entityId: item.id, severity: "error" });
    }
    seenItemIds.add(item.id);

    if (!item.id) allErrors.push({ category: "missing-field", message: "Item missing id", entityId: "(unknown)", severity: "error" });
    if (!item.label) allErrors.push({ category: "missing-field", message: `Item ${item.id} missing label`, entityId: item.id, severity: "error" });
    if (!item.href) allErrors.push({ category: "missing-field", message: `Item ${item.id} missing href`, entityId: item.id, severity: "error" });
    if (!item.requiredAction) allErrors.push({ category: "missing-field", message: `Item ${item.id} missing requiredAction`, entityId: item.id, severity: "error" });

    if (item.href && !item.href.startsWith(config.baseRoute + "/")) {
      allErrors.push({ category: "invalid-value", message: `Item ${item.id} href "${item.href}" does not start with ${config.baseRoute}/`, entityId: item.id, severity: "error" });
    }

    if ((item.implementationStatus === "live" || item.implementationStatus === "placeholder") && !item.currentRoute && !item.href) {
      allErrors.push({ category: "route-coherence", message: `Live item ${item.id} has no resolvable route`, entityId: item.id, severity: "error" });
    }

    if (item.backedBy === "not-yet-implemented" && item.implementationStatus === "live") {
      allErrors.push({ category: "invalid-value", message: `Item ${item.id} is marked live but backedBy is "not-yet-implemented"`, entityId: item.id, severity: "error" });
    }

    if (!item.scopeType) allErrors.push({ category: "governance-metadata", message: `Item ${item.id} missing scopeType`, entityId: item.id, severity: "error" });
    if (!item.visibilityMode) allErrors.push({ category: "governance-metadata", message: `Item ${item.id} missing visibilityMode`, entityId: item.id, severity: "error" });
  }

  const errors = allErrors.filter((e) => e.severity === "error");
  const warnings = allErrors.filter((e) => e.severity === "warning");

  const liveItems = allItems.filter((i) => i.implementationStatus === "live" || i.implementationStatus === "placeholder");
  const plannedItems = allItems.filter((i) => i.implementationStatus === "not-started" || i.implementationStatus === "planned");
  const uniqueActions = new Set(allItems.map((i) => i.requiredAction));

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalSections: config.sections.length,
      totalItems: allItems.length,
      liveItems: liveItems.length,
      plannedItems: plannedItems.length,
      uniqueActions: uniqueActions.size,
    },
  };
}
