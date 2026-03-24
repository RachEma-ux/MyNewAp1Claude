/**
 * [MODULE_NAME] Carbon SideNav — Canonical Navigation Configuration
 *
 * TEMPLATE — Copy this file and replace placeholders.
 *
 * This file is the SINGLE SOURCE OF TRUTH for the [MODULE_NAME] module
 * navigation model. All sidebar rendering, route resolution, permission
 * gating, and governance documentation should derive from this configuration.
 *
 * Reference: HR implementation at client/src/config/hrNavConfig.ts
 * Standard: Governance-Centrale/global/MODULE_NAV_STANDARD.md
 */

import type {
  ScopeType,
  VisibilityMode,
  BackedBy,
  ImplementationStatus,
  ModuleNavItem,
  ModuleNavSection,
  ModuleNavConfig,
  ScopeActions,
} from "../navigation/moduleNavTypes";

// ---------------------------------------------------------------------------
// Module-Specific Type Extensions (if needed)
// ---------------------------------------------------------------------------

// Example: module-specific masking field sets
// export type MyModuleMaskingFieldSet = "financial" | "personal" | "legal";

// Example: extended nav item with module-specific fields
// export interface MyModuleNavItem extends ModuleNavItem {
//   maskingFieldSet?: MyModuleMaskingFieldSet;
// }

// ---------------------------------------------------------------------------
// Module-Specific Section and Module Interfaces
// ---------------------------------------------------------------------------

// If your module has no extensions beyond the base contract, you can use
// ModuleNavItem, ModuleNavSection, and ModuleNavConfig directly.
// Otherwise, define module-specific interfaces here.

// ---------------------------------------------------------------------------
// Canonical Navigation Model
// ---------------------------------------------------------------------------

export const MODULE_NAV_CONFIG: ModuleNavConfig = {
  id: "module-id",           // e.g., "finance", "procurement"
  label: "Module Label",     // e.g., "Finance", "Procurement"
  baseRoute: "/module",      // e.g., "/finance", "/procurement"

  sections: [
    // -------------------------------------------------------------------
    // 1. [Section Name]
    // -------------------------------------------------------------------
    {
      id: "section-id",
      label: "Section Label",
      iconHint: "icon-name",
      purpose: "Describe the purpose of this section.",
      href: "/module/section-id",
      requiredAction: "module.domain.read",
      scopeType: "all",
      visibilityMode: "hide-if-no-access",
      backedBy: "not-yet-implemented",
      backendDomain: "domain-name",
      implementationStatus: "planned",
      items: [
        {
          id: "item-id",
          label: "Item Label",
          href: "/module/section-id/item",
          section: "section-id",
          iconHint: "icon-name",
          purpose: "Describe what this item does.",
          requiredAction: "module.domain.read",
          scopeType: "all",
          visibilityMode: "hide-if-no-access",
          backedBy: "not-yet-implemented",
          backendDomain: "domain-name",
          implementationStatus: "not-started",
        },
        // Add more items...
      ],
    },
    // Add more sections...
  ],
};

// ---------------------------------------------------------------------------
// Derived Helpers
// ---------------------------------------------------------------------------

// Import shared helpers and bind them to this module's config:
//
// import { getAllItems, filterByStatus, findSection } from "../navigation/moduleNavHelpers";
//
// export const getAll = () => getAllItems(MODULE_NAV_CONFIG);
// export const getLive = () => filterByStatus(MODULE_NAV_CONFIG, "live");
// export const getSection = (id: string) => findSection(MODULE_NAV_CONFIG, id);
