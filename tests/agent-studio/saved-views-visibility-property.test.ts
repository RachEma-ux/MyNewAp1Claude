// Saved-views visibility property tests — V1+ Phase 16-α.
//
// Covers the V1+ plan §"Phase 16 — Saved views" acceptance criterion
// #4: "Permission-aware materialization — shared saved views must
// respect viewer's permissions (re-runs the visibility filter per
// viewer, not snapshot of author's results)."
//
// Property under test: for ANY combination of (view.visibility,
// view.ownerUserId, viewerUserId), the materialization path
// re-applies the viewer-permission filter on top of the saved
// view's intrinsic query — never reuses the author's snapshot.

import { describe, expect, it } from "vitest";

import {
  SAVED_VIEW_VISIBILITIES,
  canViewSavedView,
  filterVisibleSavedViews,
  isSavedViewVisibility,
  materializeWithViewerPermissions,
} from "../../server/agent-studio/services/vault/saved-views-visibility.js";
import type { SavedViewRow } from "../../server/agent-studio/services/vault/saved-views.js";

function makeView(
  overrides: Partial<SavedViewRow> = {},
): SavedViewRow {
  return {
    id: 1,
    vaultId: 1,
    ownerUserId: 100,
    name: "v",
    viewKind: "note_list",
    filters: null,
    sort: null,
    columns: null,
    visibility: "personal",
    version: 1,
    parentSavedViewId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("SAVED_VIEW_VISIBILITIES taxonomy", () => {
  it("is the 2-value closed union", () => {
    expect(SAVED_VIEW_VISIBILITIES).toEqual(["personal", "workspace_shared"]);
  });

  it("isSavedViewVisibility narrows correctly", () => {
    expect(isSavedViewVisibility("personal")).toBe(true);
    expect(isSavedViewVisibility("workspace_shared")).toBe(true);
    expect(isSavedViewVisibility("public")).toBe(false);
    expect(isSavedViewVisibility(123)).toBe(false);
  });
});

describe("canViewSavedView (pure predicate)", () => {
  it("workspace_shared is viewable by any user", () => {
    const view = makeView({ visibility: "workspace_shared" });
    expect(canViewSavedView({ view, viewerUserId: 1 })).toBe(true);
    expect(canViewSavedView({ view, viewerUserId: 999 })).toBe(true);
    expect(canViewSavedView({ view, viewerUserId: null })).toBe(true);
  });

  it("personal view is viewable only by the owner", () => {
    const view = makeView({ visibility: "personal", ownerUserId: 100 });
    expect(canViewSavedView({ view, viewerUserId: 100 })).toBe(true);
    expect(canViewSavedView({ view, viewerUserId: 101 })).toBe(false);
    expect(canViewSavedView({ view, viewerUserId: null })).toBe(false);
  });

  it("personal view with null owner is viewable by NO ONE (legacy NULL safety)", () => {
    const view = makeView({ visibility: "personal", ownerUserId: null });
    expect(canViewSavedView({ view, viewerUserId: 100 })).toBe(false);
    expect(canViewSavedView({ view, viewerUserId: null })).toBe(false);
  });
});

describe("filterVisibleSavedViews", () => {
  it("filters a mixed list correctly for a non-owner", () => {
    const views = [
      makeView({ id: 1, visibility: "personal", ownerUserId: 100 }),
      makeView({ id: 2, visibility: "personal", ownerUserId: 200 }),
      makeView({ id: 3, visibility: "workspace_shared", ownerUserId: 300 }),
    ];
    const visible = filterVisibleSavedViews({ views, viewerUserId: 200 });
    expect(visible.map((v) => v.id).sort()).toEqual([2, 3]);
  });

  it("returns empty for an anonymous viewer with no shared views", () => {
    const views = [
      makeView({ id: 1, visibility: "personal", ownerUserId: 100 }),
    ];
    expect(filterVisibleSavedViews({ views, viewerUserId: null })).toEqual([]);
  });
});

describe("materializeWithViewerPermissions (property)", () => {
  it("when the viewer cannot view the saved view, returns [] without running the intrinsic query", async () => {
    let intrinsicCalled = false;
    const result = await materializeWithViewerPermissions({
      view: makeView({ visibility: "personal", ownerUserId: 100 }),
      viewerUserId: 999,
      runViewQuery: async () => {
        intrinsicCalled = true;
        return [{ noteId: 1 }, { noteId: 2 }];
      },
      filterRowsByViewerPermission: (rows) => rows,
    });
    expect(result).toEqual([]);
    expect(intrinsicCalled).toBe(false);
  });

  it("always re-applies the viewer-permission filter even for workspace_shared", async () => {
    let filterCalled = false;
    const view = makeView({ visibility: "workspace_shared" });
    const result = await materializeWithViewerPermissions({
      view,
      viewerUserId: 42,
      runViewQuery: async () => [{ noteId: 1 }, { noteId: 2 }, { noteId: 3 }],
      filterRowsByViewerPermission: (rows, viewerId) => {
        filterCalled = true;
        expect(viewerId).toBe(42);
        // Simulate a viewer-permission filter that drops noteId 2.
        return rows.filter((r) => r.noteId !== 2);
      },
    });
    expect(filterCalled).toBe(true);
    expect(result.map((r) => r.noteId)).toEqual([1, 3]);
  });

  it("two different viewers MUST get permission-filtered results (no shared snapshot)", async () => {
    const view = makeView({ visibility: "workspace_shared" });
    const intrinsic = [{ noteId: 1, restricted: 1 }, { noteId: 2, restricted: 2 }, { noteId: 3, restricted: 3 }];
    const filterByViewer = (
      rows: ReadonlyArray<{ noteId: number; restricted: number }>,
      viewerId: number | null,
    ) =>
      // Viewer can see rows whose `restricted` field matches their id.
      rows.filter((r) => r.restricted === viewerId);

    const a = await materializeWithViewerPermissions({
      view,
      viewerUserId: 1,
      runViewQuery: async () => intrinsic,
      filterRowsByViewerPermission: filterByViewer,
    });
    const b = await materializeWithViewerPermissions({
      view,
      viewerUserId: 2,
      runViewQuery: async () => intrinsic,
      filterRowsByViewerPermission: filterByViewer,
    });

    expect(a.map((r) => r.noteId)).toEqual([1]);
    expect(b.map((r) => r.noteId)).toEqual([2]);
    // Sanity: the two viewers never saw each other's rows.
    expect(a).not.toEqual(b);
  });

  it("supports sync filter callbacks (not only async)", async () => {
    const view = makeView({ visibility: "workspace_shared" });
    const result = await materializeWithViewerPermissions({
      view,
      viewerUserId: 1,
      runViewQuery: async () => [{ noteId: 1 }, { noteId: 2 }],
      filterRowsByViewerPermission: (rows) => rows.slice(0, 1),
    });
    expect(result).toHaveLength(1);
  });
});
