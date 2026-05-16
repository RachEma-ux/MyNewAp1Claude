/**
 * Phase B §T-B.7 — `summarizeSavedViews` lockstep + visibility
 * tuple promotion.
 *
 * 18th instantiation of the lesson-30 aggregator-pair pattern.
 */

import { describe, expect, it } from "vitest";
import { summarizeSavedViews } from "../../server/agent-studio/services/vault/saved-view-summary.js";
import {
  SAVED_VIEW_VISIBILITIES,
  type SavedViewRow,
  type SavedViewVisibility,
} from "../../server/agent-studio/services/vault/saved-views.js";

function makeRow(overrides: Partial<SavedViewRow> = {}): SavedViewRow {
  return {
    id: 1,
    vaultId: 1,
    ownerUserId: null,
    name: "Test View",
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

describe("SAVED_VIEW_VISIBILITIES — closed-taxonomy invariant", () => {
  it("contains exactly 2 values", () => {
    expect(SAVED_VIEW_VISIBILITIES.length).toBe(2);
  });

  it("includes personal and workspace_shared", () => {
    expect(new Set(SAVED_VIEW_VISIBILITIES)).toEqual(
      new Set<SavedViewVisibility>(["personal", "workspace_shared"]),
    );
  });
});

describe("summarizeSavedViews — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizeSavedViews([]);
    expect(s.total).toBe(0);
    expect(s.distinctViewKindCount).toBe(0);
    expect(s.withOwnerCount).toBe(0);
    expect(s.forkedCount).toBe(0);
    expect(s.distinctVaultCount).toBe(0);
    expect(s.versionStats).toBeNull();
    expect(s.byViewKind).toEqual({});
  });

  it("byVisibility carries every closed visibility at 0", () => {
    const s = summarizeSavedViews([]);
    for (const v of SAVED_VIEW_VISIBILITIES) {
      expect(s.byVisibility[v]).toBe(0);
    }
  });
});

describe("summarizeSavedViews — populated input", () => {
  it("counts each visibility correctly", () => {
    const s = summarizeSavedViews([
      makeRow({ visibility: "personal" }),
      makeRow({ visibility: "personal" }),
      makeRow({ visibility: "workspace_shared" }),
    ]);
    expect(s.byVisibility.personal).toBe(2);
    expect(s.byVisibility.workspace_shared).toBe(1);
  });

  it("byViewKind is sparse — only blueprint keys that appear show up", () => {
    const s = summarizeSavedViews([
      makeRow({ viewKind: "note_list" }),
      makeRow({ viewKind: "note_list" }),
      makeRow({ viewKind: "entity_list" }),
      makeRow({ viewKind: "graph_quality" }),
    ]);
    expect(s.byViewKind.note_list).toBe(2);
    expect(s.byViewKind.entity_list).toBe(1);
    expect(s.byViewKind.graph_quality).toBe(1);
    expect(s.byViewKind.never_used_blueprint).toBeUndefined();
    expect(s.distinctViewKindCount).toBe(3);
  });

  it("byViewKind handles custom (non-blueprint) viewKind values too", () => {
    // The aggregator doesn't validate viewKind — it's an open-ended
    // string axis. Custom view kinds bucket naturally.
    const s = summarizeSavedViews([makeRow({ viewKind: "custom_view" })]);
    expect(s.byViewKind.custom_view).toBe(1);
  });
});

describe("summarizeSavedViews — ownership and fork gauges", () => {
  it("withOwnerCount counts non-null ownerUserId", () => {
    const s = summarizeSavedViews([
      makeRow({ ownerUserId: null }),
      makeRow({ ownerUserId: 0 }), // 0 is a valid user id, non-null
      makeRow({ ownerUserId: 5 }),
    ]);
    expect(s.withOwnerCount).toBe(2);
  });

  it("forkedCount counts non-null parentSavedViewId", () => {
    const s = summarizeSavedViews([
      makeRow({ parentSavedViewId: null }), // root
      makeRow({ parentSavedViewId: 0 }), // fork of view 0
      makeRow({ parentSavedViewId: 5 }), // fork of view 5
    ]);
    expect(s.forkedCount).toBe(2);
  });
});

describe("summarizeSavedViews — distinct vault tracking", () => {
  it("tracks unique vaultId values", () => {
    const s = summarizeSavedViews([
      makeRow({ vaultId: 1 }),
      makeRow({ vaultId: 1 }),
      makeRow({ vaultId: 2 }),
      makeRow({ vaultId: 3 }),
    ]);
    expect(s.distinctVaultCount).toBe(3);
  });
});

describe("summarizeSavedViews — version stats", () => {
  it("computes version stats across all rows", () => {
    const s = summarizeSavedViews([
      makeRow({ version: 1 }),
      makeRow({ version: 3 }),
      makeRow({ version: 5 }),
    ]);
    expect(s.versionStats!.count).toBe(3);
    expect(s.versionStats!.sum).toBe(9);
    expect(s.versionStats!.min).toBe(1);
    expect(s.versionStats!.max).toBe(5);
    expect(s.versionStats!.mean).toBe(3);
  });

  it("null when input is empty", () => {
    expect(summarizeSavedViews([]).versionStats).toBeNull();
  });
});

describe("summarizeSavedViews — invariants", () => {
  it("byVisibility sums to total", () => {
    const s = summarizeSavedViews([
      makeRow({ visibility: "personal" }),
      makeRow({ visibility: "personal" }),
      makeRow({ visibility: "workspace_shared" }),
    ]);
    let sum = 0;
    for (const v of SAVED_VIEW_VISIBILITIES) sum += s.byVisibility[v];
    expect(sum).toBe(s.total);
  });

  it("sum of byViewKind values equals total", () => {
    const s = summarizeSavedViews([
      makeRow({ viewKind: "note_list" }),
      makeRow({ viewKind: "note_list" }),
      makeRow({ viewKind: "entity_list" }),
    ]);
    let sum = 0;
    for (const k of Object.keys(s.byViewKind)) sum += s.byViewKind[k];
    expect(sum).toBe(s.total);
  });
});
