// Canvas service unit tests — V1+ Phase 17-α first slice.
//
// Covers:
//   - CANVAS_NODE_KINDS taxonomy closure
//   - isCanvasNodeKind runtime narrowing
//   - CanvasNodeKindError surfaced when service is given a bad kind
//   - ASDB fall-through (no live DB; integration tests cover the
//     persisted shape)
//   - Hard-rule boundary scan: no neo4j-driver imports, no
//     `process.env.*_API_KEY` reads, no credential-resolver import
//     (Plan v3 D2), no GraphRepository import.

import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: () => null,
}));

import {
  CANVAS_NODE_KINDS,
  CanvasNodeKindError,
  CanvasNotFoundError,
  createCanvas,
  createCanvasNode,
  getCanvasById,
  getCanvasSnapshot,
  isCanvasNodeKind,
  listCanvasesByVault,
  listNoteReferencesForCanvas,
  AsdbUnavailableError,
} from "../../server/agent-studio/services/canvas/public-api.js";

describe("CANVAS_NODE_KINDS taxonomy", () => {
  it("is the 4-value closed union", () => {
    expect(CANVAS_NODE_KINDS).toEqual([
      "note_ref",
      "embedded_query",
      "free_text",
      "image_ref",
    ]);
  });

  it("isCanvasNodeKind accepts members + rejects non-members", () => {
    for (const k of CANVAS_NODE_KINDS) expect(isCanvasNodeKind(k)).toBe(true);
    expect(isCanvasNodeKind("note")).toBe(false);
    expect(isCanvasNodeKind("")).toBe(false);
    expect(isCanvasNodeKind(123)).toBe(false);
    expect(isCanvasNodeKind(null)).toBe(false);
  });
});

describe("canvas service — ASDB unavailable fall-through", () => {
  it("getCanvasById returns null", async () => {
    expect(await getCanvasById(1)).toBeNull();
  });

  it("listCanvasesByVault returns []", async () => {
    expect(await listCanvasesByVault(1)).toEqual([]);
  });

  it("listNoteReferencesForCanvas returns []", async () => {
    expect(await listNoteReferencesForCanvas(1)).toEqual([]);
  });

  it("createCanvas throws AsdbUnavailableError", async () => {
    await expect(
      createCanvas({ vaultId: 1, slug: "c", title: "C" }),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });

  it("createCanvasNode throws AsdbUnavailableError (when kind valid)", async () => {
    await expect(
      createCanvasNode({ canvasId: 1, kind: "free_text" }),
    ).rejects.toBeInstanceOf(AsdbUnavailableError);
  });

  it("getCanvasSnapshot throws CanvasNotFoundError when canvas missing", async () => {
    await expect(getCanvasSnapshot(999)).rejects.toBeInstanceOf(
      CanvasNotFoundError,
    );
  });
});

describe("canvas service — kind validation", () => {
  it("createCanvasNode rejects invalid kind BEFORE ASDB lookup", async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createCanvasNode({ canvasId: 1, kind: "node" as any }),
    ).rejects.toBeInstanceOf(CanvasNodeKindError);
  });

  it("CanvasNodeKindError lists the allowed union in its message", () => {
    const err = new CanvasNodeKindError("oops");
    expect(err.message).toMatch(/note_ref/);
    expect(err.message).toMatch(/embedded_query/);
    expect(err.message).toMatch(/free_text/);
    expect(err.message).toMatch(/image_ref/);
  });
});

describe("canvas service — hard-rule boundary scan", () => {
  async function readService(rel: string) {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    return readFileSync(
      join(__dirname, "..", "..", "server/agent-studio/services/canvas", rel),
      "utf8",
    );
  }

  it("canvas service must NOT import neo4j-driver", async () => {
    for (const f of ["canvas-service.ts", "types.ts", "public-api.ts"]) {
      const src = await readService(f);
      expect(
        /from\s+["']neo4j-driver["']/.exec(src),
        `${f} imports neo4j-driver`,
      ).toBeNull();
    }
  });

  it("canvas service must NOT import the GraphRepository (Phase 11.5 proposal route is the mutation path)", async () => {
    for (const f of ["canvas-service.ts", "types.ts", "public-api.ts"]) {
      const src = await readService(f);
      expect(
        /services\/graph\/repository/.exec(src),
        `${f} imports GraphRepository`,
      ).toBeNull();
    }
  });

  it("canvas service must NOT import the internal credential resolver (Plan v3 D2)", async () => {
    for (const f of ["canvas-service.ts", "types.ts", "public-api.ts"]) {
      const src = await readService(f);
      expect(
        /credential-resolver/.exec(src),
        `${f} imports credential-resolver`,
      ).toBeNull();
    }
  });

  it("canvas service body must NOT read process.env.*_API_KEY", async () => {
    for (const f of ["canvas-service.ts", "types.ts", "public-api.ts"]) {
      const src = await readService(f);
      const code = src
        .split("\n")
        .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
        .join("\n");
      expect(/process\.env\.[A-Z_]+_API_KEY/.exec(code)).toBeNull();
    }
  });
});
