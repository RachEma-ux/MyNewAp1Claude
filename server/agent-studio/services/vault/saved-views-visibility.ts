/**
 * Vault — Saved-Views visibility filter (Phase 16-α V1+).
 *
 * Closes the Phase 16-α acceptance criterion #4:
 * "Permission-aware materialization — shared saved views must
 *  respect viewer's permissions (re-runs the visibility filter per
 *  viewer, not snapshot of author's results)."
 *
 * The shape:
 *   - A saved view's `visibility` column is the gate for who can
 *     SEE the view definition (`personal` = owner only;
 *     `workspace_shared` = any vault member).
 *   - The view's `filters` field is operator-supplied query state
 *     (tags, properties, sort, columns). When a viewer materializes
 *     a shared view, the system must re-apply the viewer's own
 *     permission filter on top — never reuse the author's result
 *     set, which may contain rows the viewer is not allowed to see.
 *
 * This module exposes:
 *   - `canViewSavedView()` — pure predicate over (view, viewer).
 *   - `filterVisibleSavedViews()` — pure list-filter wrapper.
 *   - `materializeWithViewerPermissions()` — composes the saved
 *     view's filters with a viewer permission callback. The
 *     viewer-permission step is pluggable so tests don't need a
 *     full RBAC stack.
 *
 * Hard-rule compliance:
 *   - Pure functions only; no DB / no I/O.
 *   - No graph mutation. No raw env reads.
 *
 * The integration with `listSavedViews()` happens in `saved-views.
 * ts` where the existing list path now respects `visibility`. This
 * file is the standalone pure-logic surface so tests can verify
 * the property without a live ASDB.
 */

import type { SavedViewRow } from "./saved-views.js";

export const SAVED_VIEW_VISIBILITIES = ["personal", "workspace_shared"] as const;
export type SavedViewVisibility = (typeof SAVED_VIEW_VISIBILITIES)[number];

export function isSavedViewVisibility(s: unknown): s is SavedViewVisibility {
  return (
    typeof s === "string" &&
    (SAVED_VIEW_VISIBILITIES as readonly string[]).includes(s)
  );
}

// ============================================================================
// Per-visibility operator-facing metadata (T-V.1)
// ============================================================================

export interface SavedViewVisibilityMetadata {
  /** Display label rendered in the visibility picker / view-card badge. */
  readonly label: string;
  /** Short operator-facing description of who can see this view. */
  readonly description: string;
  /** Whether non-owner workspace members can see this view's
   *  definition (true). The `personal` visibility scopes the view to
   *  the owner only. */
  readonly visibleToOthers: boolean;
}

export const SAVED_VIEW_VISIBILITY_METADATA: Readonly<
  Record<SavedViewVisibility, SavedViewVisibilityMetadata>
> = {
  personal: {
    label: "Personal",
    description:
      "Visible only to the view's owner — saved views with this visibility do not appear in the workspace-wide view list.",
    visibleToOthers: false,
  },
  workspace_shared: {
    label: "Workspace Shared",
    description:
      "Visible to every member of the owner's workspace — appears in the workspace-wide view list and is selectable by all members.",
    visibleToOthers: true,
  },
};

export function getSavedViewVisibilityMetadata(
  visibility: SavedViewVisibility,
): SavedViewVisibilityMetadata {
  return SAVED_VIEW_VISIBILITY_METADATA[visibility];
}

/**
 * Pure predicate. Returns true iff `viewer` should be able to see
 * the view's definition. Does NOT speak to the data inside the
 * view's result — that's covered by `materializeWithViewerPermissions`.
 */
export function canViewSavedView(input: {
  readonly view: Pick<SavedViewRow, "ownerUserId" | "visibility">;
  readonly viewerUserId: number | null;
}): boolean {
  if (input.view.visibility === "workspace_shared") return true;
  // personal: only the owner can see it. A view with no owner is
  // a system-seeded shared view — treat as personal-to-no-one
  // (not viewable) so we don't leak via legacy NULL ownership.
  if (input.view.ownerUserId == null) return false;
  return input.view.ownerUserId === input.viewerUserId;
}

/**
 * Pure list-filter wrapper. Mirrors what `listSavedViews()` does
 * at the DB layer; exposed so caller-side validation paths can
 * defensively re-filter without re-querying.
 */
export function filterVisibleSavedViews<
  T extends Pick<SavedViewRow, "ownerUserId" | "visibility">,
>(input: { readonly views: ReadonlyArray<T>; readonly viewerUserId: number | null }): T[] {
  return input.views.filter((v) =>
    canViewSavedView({ view: v, viewerUserId: input.viewerUserId }),
  );
}

/**
 * Materialize a saved view's result set, re-applying the viewer's
 * permission filter on top of the view's filters.
 *
 * `runViewQuery` is the saved-view's intrinsic query (e.g.
 * `select notes where tag=X order by updated_at desc limit 50`).
 * `filterRowsByViewerPermission` is the viewer-scoped re-check
 * (e.g. "drop rows the viewer is not a member of the vault for").
 *
 * Both are caller-supplied callables so this composition stays
 * pure and testable.
 */
export async function materializeWithViewerPermissions<TRow>(input: {
  readonly view: SavedViewRow;
  readonly viewerUserId: number | null;
  readonly runViewQuery: () => Promise<ReadonlyArray<TRow>>;
  readonly filterRowsByViewerPermission: (
    rows: ReadonlyArray<TRow>,
    viewerUserId: number | null,
  ) => Promise<ReadonlyArray<TRow>> | ReadonlyArray<TRow>;
}): Promise<ReadonlyArray<TRow>> {
  if (!canViewSavedView({ view: input.view, viewerUserId: input.viewerUserId })) {
    return [];
  }
  const intrinsicRows = await input.runViewQuery();
  // Re-apply the viewer's permission filter. NEVER skip this step
  // — even if the saved view is workspace_shared, individual rows
  // may be restricted (e.g. a note in a member-restricted folder).
  // This is the property-based test target in
  // `saved-views-visibility-property.test.ts`.
  return input.filterRowsByViewerPermission(intrinsicRows, input.viewerUserId);
}
