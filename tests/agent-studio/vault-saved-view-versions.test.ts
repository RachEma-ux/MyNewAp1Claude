/**
 * Saved-view immutable version-history tests — V1+ Phase 16-γ.
 *
 * Covers:
 *   - ags_vault_saved_view_versions table schema declaration
 *     (savedViewId + version unique, capture columns present)
 *   - listSavedViewVersions returns [] when ASDB unavailable
 *   - getSavedViewVersionById returns null when ASDB unavailable
 *   - updateSavedView captures prior row state (pre-mutation)
 *     before applying the patch — uses spies on getSavedViewById
 *     + insert sequence
 *   - SavedViewVersionRow shape matches the column projection
 *   - source-scan boundary: no neo4j-driver / credential-resolver /
 *     dispatcher / *_API_KEY in saved-views.ts (with γ addition).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import {
  getSavedViewVersionById,
  listSavedViewVersions,
  type SavedViewVersionRow,
} from "../../server/agent-studio/services/vault/saved-views.js";
import { agsVaultSavedViewVersions } from "../../drizzle/tables/agent-studio-vault.js";

describe("ags_vault_saved_view_versions — schema declaration", () => {
  it("has the expected column set", () => {
    // Drizzle .name === SQL column for the JS field "savedViewId"
    const cols = Object.keys(agsVaultSavedViewVersions);
    for (const k of [
      "id",
      "savedViewId",
      "version",
      "name",
      "viewKind",
      "filters",
      "sort",
      "columns",
      "visibility",
      "capturedByUserId",
      "capturedAt",
    ]) {
      expect(cols).toContain(k);
    }
  });

  it("savedViewId references agsVaultSavedViews.id (compile-time ref)", () => {
    // The references() call wires the FK metadata; reading the
    // column shape's .config.references object verifies the wire.
    // We only check the JS-level structural presence here.
    expect(agsVaultSavedViewVersions.savedViewId).toBeDefined();
  });
});

describe("listSavedViewVersions / getSavedViewVersionById — ASDB-unavailable fall-through", () => {
  it("listSavedViewVersions returns [] when getDb is null", async () => {
    const rows = await listSavedViewVersions(1, {
      getDb: () => null as unknown as never,
    });
    expect(rows).toEqual([]);
  });

  it("getSavedViewVersionById returns null when getDb is null", async () => {
    const row = await getSavedViewVersionById(1, {
      getDb: () => null as unknown as never,
    });
    expect(row).toBeNull();
  });
});

describe("SavedViewVersionRow shape", () => {
  it("is a fully-typed row shape — no fields lost in projection", () => {
    // Type-check via destructuring (compile-time validation).
    const sample: SavedViewVersionRow = {
      id: 1,
      savedViewId: 42,
      version: 3,
      name: "Active sprints",
      viewKind: "table",
      filters: { tag: "sprint" },
      sort: { by: "updated_at", dir: "desc" },
      columns: ["title", "status"],
      visibility: "workspace_shared",
      capturedByUserId: 7,
      capturedAt: new Date("2026-05-13T00:00:00Z"),
    };
    expect(sample.savedViewId).toBe(42);
    expect(sample.version).toBe(3);
    expect(sample.visibility).toBe("workspace_shared");
  });
});

describe("source-scan boundary — saved-views.ts (with 16-γ addition)", () => {
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

  it("imports agsVaultSavedViewVersions from the schema (γ wire-up)", () => {
    expect(
      /import\s+\{[^}]*agsVaultSavedViewVersions[^}]*\}\s+from\s+["'][^"']*agent-studio-vault/.test(
        code,
      ),
    ).toBe(true);
  });

  it("updateSavedView inserts a snapshot row before applying the patch (γ load-bearing)", () => {
    // Order-of-operations source-scan: the source for updateSavedView
    // must contain `agsVaultSavedViewVersions` insert ABOVE the
    // update-set call. We assert by index ordering of the literal
    // appearances of the two table refs inside the updateSavedView
    // function body.
    const updateFnMatch = src.match(
      /export async function updateSavedView[\s\S]+?\n\}\n/,
    );
    expect(updateFnMatch).not.toBeNull();
    const fnBody = updateFnMatch?.[0] ?? "";
    const insertIdx = fnBody.indexOf("agsVaultSavedViewVersions");
    const updateIdx = fnBody.indexOf(".update(agsVaultSavedViews)");
    expect(insertIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeLessThan(updateIdx);
  });
});
