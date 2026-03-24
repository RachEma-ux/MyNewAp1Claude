/**
 * HR Nav Authorization Helpers — Reusable client-side permission layer
 *
 * Phase 3 deliverable — consumes the canonical HR nav config and the
 * user's allowed actions to determine visibility, scope classification,
 * and masking status for every section and leaf item.
 *
 * These helpers are designed to be consumed by:
 * - MainLayout sidebar rendering
 * - HRSectionLandingPage child filtering
 * - Any future Carbon SideNav renderer
 * - Route guards and access-denied gates
 *
 * None of these functions access the backend. They are pure functions
 * operating on the nav config + the user's action set.
 */

import {
  HR_NAV_CONFIG,
  getAllHrNavItems,
  type HrNavItem,
  type HrNavSection,
  type ScopeType,
  type MaskingFieldSet,
} from "@/config/hrNavConfig";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NavVisibilityResult {
  /** Whether the item/section should appear in the nav */
  visible: boolean;
  /** Whether it should be rendered in a disabled state */
  disabled: boolean;
  /** Reason it's hidden or disabled (for debugging/logging) */
  reason?: string;
}

export interface ItemScopeInfo {
  id: string;
  label: string;
  scopeType: ScopeType;
  maskingRequired: boolean;
  maskingFieldSet?: MaskingFieldSet;
  sensitiveReadAudit: boolean;
  sensitiveAction?: string;
  hasScopeActions: boolean;
  scopeActions?: HrNavItem["scopeActions"];
}

export interface SectionAccessSummary {
  sectionId: string;
  sectionLabel: string;
  totalItems: number;
  visibleItems: number;
  sensitiveItems: number;
  maskedItems: number;
}

// ---------------------------------------------------------------------------
// Core Permission Check
// ---------------------------------------------------------------------------

/**
 * Check if the user has a specific HR action in their allowed set.
 *
 * The `allowedActions` array comes from `useHrRole().allowedActions`
 * which is populated by the HR_ROLE_PERMISSIONS matrix on the server.
 */
function hasAction(allowedActions: readonly string[], action: string): boolean {
  return allowedActions.includes(action);
}

// ---------------------------------------------------------------------------
// Item-Level Visibility
// ---------------------------------------------------------------------------

/**
 * Determine whether a single nav item should be visible to the current user.
 *
 * Applies the item's `visibilityMode` against the user's allowed actions:
 * - "show": always visible
 * - "hide-if-no-access": hidden when user lacks `requiredAction`
 * - "show-disabled": visible but disabled when user lacks access
 * - "redirect-to-parent": treated as hidden (redirect handled at route level)
 */
export function resolveItemVisibility(
  item: HrNavItem,
  allowedActions: readonly string[],
): NavVisibilityResult {
  const canAccess = hasAction(allowedActions, item.requiredAction);

  switch (item.visibilityMode) {
    case "show":
      return { visible: true, disabled: false };
    case "hide-if-no-access":
      return canAccess
        ? { visible: true, disabled: false }
        : { visible: false, disabled: false, reason: `Missing action: ${item.requiredAction}` };
    case "show-disabled":
      return canAccess
        ? { visible: true, disabled: false }
        : { visible: true, disabled: true, reason: `Missing action: ${item.requiredAction}` };
    case "redirect-to-parent":
      return canAccess
        ? { visible: true, disabled: false }
        : { visible: false, disabled: false, reason: "Redirects to parent" };
    default:
      return { visible: true, disabled: false };
  }
}

// ---------------------------------------------------------------------------
// Section-Level Visibility
// ---------------------------------------------------------------------------

/**
 * Determine whether a section should be visible.
 *
 * A section is visible if:
 * 1. The user has the section's `requiredAction`, OR
 * 2. At least one child item is visible
 *
 * This prevents empty sections from cluttering the nav.
 */
export function resolveSectionVisibility(
  section: HrNavSection,
  allowedActions: readonly string[],
): NavVisibilityResult {
  // Section's own visibility mode check
  const sectionAccess = hasAction(allowedActions, section.requiredAction);

  if (section.visibilityMode === "hide-if-no-access" && !sectionAccess) {
    // Even if section is hidden, check if any child is visible
    const hasVisibleChild = section.items.some(
      (item) => resolveItemVisibility(item, allowedActions).visible,
    );
    if (!hasVisibleChild) {
      return { visible: false, disabled: false, reason: `No accessible items in section ${section.id}` };
    }
  }

  // Section with "show" mode or with accessible children
  return { visible: true, disabled: false };
}

// ---------------------------------------------------------------------------
// Filtered Nav Accessors
// ---------------------------------------------------------------------------

/**
 * Get all sections visible to the current user, with their items filtered.
 * Returns only sections that have at least one visible child.
 */
export function getVisibleSections(
  allowedActions: readonly string[],
): Array<HrNavSection & { visibleItems: HrNavItem[] }> {
  return HR_NAV_CONFIG.sections
    .map((section) => {
      const visibleItems = section.items.filter(
        (item) => resolveItemVisibility(item, allowedActions).visible,
      );
      return { ...section, visibleItems };
    })
    .filter((section) => section.visibleItems.length > 0);
}

/**
 * Get visible items within a specific section.
 */
export function getVisibleItemsForSection(
  sectionId: string,
  allowedActions: readonly string[],
): HrNavItem[] {
  const section = HR_NAV_CONFIG.sections.find((s) => s.id === sectionId);
  if (!section) return [];
  return section.items.filter(
    (item) => resolveItemVisibility(item, allowedActions).visible,
  );
}

/**
 * Check if a user can access a specific route path.
 * Looks up the nav item by href and checks the user's permissions.
 */
export function canAccessRoute(
  href: string,
  allowedActions: readonly string[],
): boolean {
  const item = getAllHrNavItems().find((i) => i.href === href);
  if (!item) return false;
  return hasAction(allowedActions, item.requiredAction);
}

// ---------------------------------------------------------------------------
// Scope & Masking Introspection
// ---------------------------------------------------------------------------

/**
 * Get detailed scope/masking info for a specific item.
 */
export function getItemScopeInfo(item: HrNavItem): ItemScopeInfo {
  return {
    id: item.id,
    label: item.label,
    scopeType: item.scopeType,
    maskingRequired: item.maskingRequired ?? false,
    maskingFieldSet: item.maskingFieldSet,
    sensitiveReadAudit: item.sensitiveReadAudit ?? false,
    sensitiveAction: item.sensitiveAction,
    hasScopeActions: item.scopeActions != null,
    scopeActions: item.scopeActions,
  };
}

/**
 * Determine if a user would see masked data for a given item.
 *
 * Returns true if the item requires masking AND the user does NOT
 * have the elevated sensitive action.
 */
export function wouldSeeMaskedData(
  item: HrNavItem,
  allowedActions: readonly string[],
): boolean {
  if (!item.maskingRequired) return false;
  if (!item.sensitiveAction) return false;
  return !hasAction(allowedActions, item.sensitiveAction);
}

/**
 * Get a summary of what the user can access per section.
 */
export function getSectionAccessSummaries(
  allowedActions: readonly string[],
): SectionAccessSummary[] {
  return HR_NAV_CONFIG.sections.map((section) => {
    const visibleItems = section.items.filter(
      (item) => resolveItemVisibility(item, allowedActions).visible,
    );
    const sensitiveItems = section.items.filter(
      (item) => item.scopeType === "sensitive" && resolveItemVisibility(item, allowedActions).visible,
    );
    const maskedItems = section.items.filter(
      (item) => wouldSeeMaskedData(item, allowedActions),
    );
    return {
      sectionId: section.id,
      sectionLabel: section.label,
      totalItems: section.items.length,
      visibleItems: visibleItems.length,
      sensitiveItems: sensitiveItems.length,
      maskedItems: maskedItems.length,
    };
  });
}

// ---------------------------------------------------------------------------
// Classification Helpers
// ---------------------------------------------------------------------------

/**
 * Get all items that the user can access but will see with masked fields.
 * Useful for UI indicators ("some fields are restricted").
 */
export function getMaskedItemsForUser(
  allowedActions: readonly string[],
): HrNavItem[] {
  return getAllHrNavItems().filter((item) => {
    const vis = resolveItemVisibility(item, allowedActions);
    return vis.visible && wouldSeeMaskedData(item, allowedActions);
  });
}

/**
 * Get all items that the user can access with full (unmasked) data.
 */
export function getUnmaskedItemsForUser(
  allowedActions: readonly string[],
): HrNavItem[] {
  return getAllHrNavItems().filter((item) => {
    const vis = resolveItemVisibility(item, allowedActions);
    if (!vis.visible) return false;
    if (!item.maskingRequired) return true;
    if (!item.sensitiveAction) return true;
    return hasAction(allowedActions, item.sensitiveAction);
  });
}

/**
 * Get the effective scope the user would have on a given item.
 *
 * This mirrors the backend resolveDataScope logic but runs client-side.
 * Returns the most specific scope: "all" > "team" > "self" > "none".
 */
export function resolveClientScope(
  item: HrNavItem,
  allowedActions: readonly string[],
): "all" | "team" | "self" | "none" {
  if (!item.scopeActions) {
    // No scope actions declared — fall back to requiredAction check
    return hasAction(allowedActions, item.requiredAction) ? "all" : "none";
  }

  const { global: globalAction, team: teamAction, self: selfAction } = item.scopeActions;

  if (globalAction && hasAction(allowedActions, globalAction)) return "all";
  if (teamAction && hasAction(allowedActions, teamAction)) return "team";
  if (selfAction && hasAction(allowedActions, selfAction)) return "self";

  return "none";
}
