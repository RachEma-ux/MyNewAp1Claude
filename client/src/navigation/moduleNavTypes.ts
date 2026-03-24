/**
 * Module Navigation Contract — Shared Types for Carbon SideNav Pattern
 *
 * This file defines the platform standard for module navigation configuration.
 * It is the reusable contract that all module nav configs should conform to.
 *
 * The HR module (client/src/config/hrNavConfig.ts) is the reference implementation.
 * Future modules should import these types and follow this contract.
 *
 * Phase 10 deliverable — platform standardization.
 */

// ---------------------------------------------------------------------------
// Core Enums — Stable across all modules
// ---------------------------------------------------------------------------

/** How data scope is classified for a nav item */
export type ScopeType = "self" | "team" | "all" | "sensitive" | "mixed";

/** How the item behaves when the user lacks the required permission */
export type VisibilityMode =
  | "show"
  | "hide-if-no-access"
  | "show-disabled"
  | "redirect-to-parent";

/** What surface backs this nav item */
export type BackedBy =
  | "existing-page"
  | "new-page"
  | "tab-in-existing-page"
  | "not-yet-implemented";

/** Current implementation lifecycle state */
export type ImplementationStatus =
  | "live"
  | "placeholder"
  | "planned"
  | "not-started";

// ---------------------------------------------------------------------------
// Const Value Sets — For validation, tests, and runtime checks
// ---------------------------------------------------------------------------

export const SCOPE_TYPES: readonly ScopeType[] = [
  "self",
  "team",
  "all",
  "sensitive",
  "mixed",
] as const;

export const VISIBILITY_MODES: readonly VisibilityMode[] = [
  "show",
  "hide-if-no-access",
  "show-disabled",
  "redirect-to-parent",
] as const;

export const BACKED_BY_VALUES: readonly BackedBy[] = [
  "existing-page",
  "new-page",
  "tab-in-existing-page",
  "not-yet-implemented",
] as const;

export const IMPLEMENTATION_STATUSES: readonly ImplementationStatus[] = [
  "live",
  "placeholder",
  "planned",
  "not-started",
] as const;

/**
 * Action string pattern — all module actions should match:
 *   <module>.<domain>.<operation>[.<qualifier>]
 *
 * Examples: hr.directory.read, hr.time.read.self, finance.ledger.write
 */
export const ACTION_PATTERN = /^[a-z]+\.[a-z]+\.[a-z]+(\.[a-z]+)?$/;

// ---------------------------------------------------------------------------
// Generic Module Nav Interfaces
// ---------------------------------------------------------------------------

/**
 * Scope resolution actions — defines which permission action corresponds
 * to each scope level. Used for self/team/all scope narrowing.
 */
export interface ScopeActions {
  global?: string;
  team?: string;
  self?: string;
}

/**
 * ModuleNavItem — Base contract for a leaf navigation item.
 *
 * Every module nav item must satisfy these fields. Module-specific extensions
 * (e.g., HR's maskingFieldSet) are added by the module's own interface
 * extending this base.
 */
export interface ModuleNavItem {
  id: string;
  label: string;
  href: string;
  section: string;
  iconHint?: string;
  purpose?: string;

  /** Permission action required to access this item */
  requiredAction: string;
  /** Data scope classification */
  scopeType: ScopeType;
  /** How the item behaves when the user lacks access */
  visibilityMode: VisibilityMode;
  /** What surface backs this item */
  backedBy: BackedBy;
  /** Backend domain that serves this capability */
  backendDomain: string;
  /** Current implementation lifecycle state */
  implementationStatus: ImplementationStatus;

  /** Current flat route (if different from target href) */
  currentRoute?: string;
  /** Current React component filename backing this item */
  currentComponent?: string;

  // --- Optional governance extensions ---

  /** Whether backend applies field masking for this capability */
  maskingRequired?: boolean;
  /** Whether reads trigger sensitive-read audit logging */
  sensitiveReadAudit?: boolean;
  /** Elevated action that grants unmasked/full access */
  sensitiveAction?: string;
  /** Scope resolution actions for self/team/all narrowing */
  scopeActions?: ScopeActions;
}

/**
 * ModuleNavSection — A purpose-driven grouping of nav items.
 */
export interface ModuleNavSection {
  id: string;
  label: string;
  iconHint: string;
  purpose: string;
  href: string;
  requiredAction: string;
  scopeType: ScopeType;
  visibilityMode: VisibilityMode;
  backedBy: BackedBy;
  backendDomain: string;
  implementationStatus: ImplementationStatus;
  currentRoute?: string;
  currentComponent?: string;
  items: ModuleNavItem[];
}

/**
 * ModuleNavConfig — Top-level module navigation configuration.
 *
 * Each module that adopts the Carbon SideNav pattern should export
 * a single const of this shape as its canonical navigation model.
 */
export interface ModuleNavConfig {
  /** Module identifier (e.g., "human-resources", "finance") */
  id: string;
  /** Display label for the module */
  label: string;
  /** Base route prefix (e.g., "/hr", "/finance") */
  baseRoute: string;
  /** Purpose-driven sections containing leaf items */
  sections: ModuleNavSection[];
}
