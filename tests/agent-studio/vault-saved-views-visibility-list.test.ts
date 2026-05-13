/**
 * Viewer-scoped saved-views list tests (V1+ Phase 16-β).
 *
 * Covers:
 *   - workspace_shared views are visible to any viewer
 *   - personal views are visible only to their owner
 *   - personal with null ownerUserId is invisible to all (legacy
 *     NULL ownership defensive)
 *   - mixed-visibility set: filter result respects per-row gate
 *   - viewerUserId=null sees only workspace_shared
 *   - intrinsic ListSavedViewsInput filters (vaultId/ownerUserId/
 *     viewKind/limit) forwarded to the underlying listImpl unchanged
 *   - ASDB-unavailable fall-through returns []
 *   - source-scan boundary: no neo4j-driver / credential-resolver /
 *     dispatcher / *_API_KEY in saved-views.ts
 *
 * Test seam: `options.listImpl` lets tests inject a fake list
 * function so the composition can be exercised without a live ASDB.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it, vi } from "vitest";

import {
  listVisibleSavedViewsForUser,
  type ListSavedViewsInput,
  type SavedViewRow,
  type SavedViewServiceOptions,
} from "../../server/agent-studio/services/vault/saved-views.js";

function row(over: Partial<SavedViewRow>): SavedViewRow {
  return {
    id: 1,
    vaultId: 1,
    ownerUserId: null,
    name: "v",
    viewKind: "table",
    filters: null,
    sort: null,
    columns: null,
    visibility: "workspace_shared",
    version: 1,
    parentSavedViewId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as SavedViewRow;
}

function stubList(
  rows: SavedViewRow[],
): (
  input: ListSavedViewsInput,
  options: SavedViewServiceOptions,
) => Promise<SavedViewRow[]> {
  return async () => rows;
}

describe("listVisibleSavedViewsForUser — visibility composition", () => {
  it("workspace_shared is visible to any viewer", async () => {
    const res = await listVisibleSavedViewsForUser(
      { vaultId: 1, viewerUserId: 999 },
      {
        listImpl: stubList([
          row({ id: 1, ownerUserId: 100, visibility: "workspace_shared" }),
        ]),
      },
    );
    expect(res.map((r) => r.id)).toEqual([1]);
  });

  it("personal is visible only to its owner", async () => {
    const list = stubList([
      row({ id: 2, ownerUserId: 100, visibility: "personal" }),
      row({ id: 3, ownerUserId: 200, visibility: "personal" }),
    ]);

    const viewedBy100 = await listVisibleSavedViewsForUser(
      { vaultId: 1, viewerUserId: 100 },
      { listImpl: list },
    );
    expect(viewedBy100.map((r) => r.id)).toEqual([2]);

    const viewedBy200 = await listVisibleSavedViewsForUser(
      { vaultId: 1, viewerUserId: 200 },
      { listImpl: list },
    );
    expect(viewedBy200.map((r) => r.id)).toEqual([3]);
  });

  it("personal with null ownerUserId is invisible to all (legacy NULL defensive)", async () => {
    const list = stubList([
      row({ id: 4, ownerUserId: null, visibility: "personal" }),
    ]);
    const res100 = await listVisibleSavedViewsForUser(
      { vaultId: 1, viewerUserId: 100 },
      { listImpl: list },
    );
    const resNull = await listVisibleSavedViewsForUser(
      { vaultId: 1, viewerUserId: null },
      { listImpl: list },
    );
    expect(res100).toEqual([]);
    expect(resNull).toEqual([]);
  });

  it("mixed-visibility set: viewer sees workspace_shared + own personal", async () => {
    const res = await listVisibleSavedViewsForUser(
      { vaultId: 1, viewerUserId: 100 },
      {
        listImpl: stubList([
          row({ id: 10, ownerUserId: 100, visibility: "personal" }),
          row({ id: 11, ownerUserId: 200, visibility: "personal" }),
          row({ id: 12, ownerUserId: 100, visibility: "workspace_shared" }),
          row({ id: 13, ownerUserId: 300, visibility: "workspace_shared" }),
        ]),
      },
    );
    expect(res.map((r) => r.id).sort()).toEqual([10, 12, 13]);
  });

  it("viewerUserId=null sees only workspace_shared (anonymous viewer)", async () => {
    const res = await listVisibleSavedViewsForUser(
      { vaultId: 1, viewerUserId: null },
      {
        listImpl: stubList([
          row({ id: 20, ownerUserId: 100, visibility: "personal" }),
          row({ id: 21, ownerUserId: 200, visibility: "workspace_shared" }),
        ]),
      },
    );
    expect(res.map((r) => r.id)).toEqual([21]);
  });

  it("forwards intrinsic ListSavedViewsInput filters to the underlying listImpl", async () => {
    const captured: ListSavedViewsInput[] = [];
    await listVisibleSavedViewsForUser(
      {
        vaultId: 7,
        viewerUserId: 100,
        ownerUserId: 100,
        viewKind: "kanban",
        limit: 50,
      },
      {
        listImpl: async (input) => {
          captured.push(input);
          return [];
        },
      },
    );
    expect(captured).toHaveLength(1);
    expect(captured[0].vaultId).toBe(7);
    expect(captured[0].ownerUserId).toBe(100);
    expect(captured[0].viewKind).toBe("kanban");
    expect(captured[0].limit).toBe(50);
  });

  it("returns [] when underlying listImpl returns []", async () => {
    const res = await listVisibleSavedViewsForUser(
      { vaultId: 1, viewerUserId: 100 },
      { listImpl: stubList([]) },
    );
    expect(res).toEqual([]);
  });
});

describe("listVisibleSavedViewsForUser — ASDB-unavailable fall-through (default listImpl)", () => {
  it("returns [] via the real listSavedViews when getDb is null", async () => {
    // Real listSavedViews short-circuits to [] when getDb returns null.
    const res = await listVisibleSavedViewsForUser(
      { vaultId: 1, viewerUserId: 100 },
      { getDb: () => null as unknown as never },
    );
    expect(res).toEqual([]);
  });
});

describe("source-scan boundary — saved-views.ts (with 16-β addition)", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/vault/saved-views.ts",
  );
  const src = readFileSync(file, "utf8");
  const code = src
    .split("\n")
    .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
    .join("\n");

  it("does not import neo4j-driver", () => {
    expect(/from\s+["']neo4j-driver["']/.test(code)).toBe(false);
  });

  it("does not import credential-resolver", () => {
    expect(/credential-resolver/.test(code)).toBe(false);
  });

  it("does not import the MCP dispatcher", () => {
    expect(
      /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.test(
        code,
      ),
    ).toBe(false);
  });

  it("does not read process.env.*_API_KEY raw", () => {
    expect(/process\.env\.[A-Z_]*_API_KEY/.test(code)).toBe(false);
  });

  it("imports filterVisibleSavedViews from saved-views-visibility", () => {
    expect(
      /import\s+\{\s*filterVisibleSavedViews\s*\}\s+from\s+["']\.\/saved-views-visibility/.test(
        code,
      ),
    ).toBe(true);
  });
});
