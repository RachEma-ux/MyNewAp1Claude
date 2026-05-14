/**
 * 17-γ ASDB sink — `createAsdbCanvasProjectionEventSink` tests
 * (PR-V1-54).
 *
 * Covers the persistence-side sink that composes with the registry
 * from PR-V1-41 (#792) and writes to the
 * `ags_canvas_projection_events` table from PR-V1-53 (#804).
 *
 * Uses DI seams (`getDb`, `resolveWorkspaceId`) so the suite runs
 * without an ASDB instance.
 *
 * Scenarios:
 *   - Happy path: `note_reference_changed` → row inserted with
 *     resolved workspaceId.
 *   - `note_reference_removed` → row inserted with the prior
 *     referencedNoteId.
 *   - workspaceId resolves null → event dropped + WARN (no insert).
 *   - workspaceId resolver throws → event dropped + WARN.
 *   - ASDB unavailable (`getDb()` → null) → event dropped + WARN.
 *   - Source-scan boundaries.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it, vi } from "vitest";

import { createAsdbCanvasProjectionEventSink } from "../../server/agent-studio/services/canvas/projection-events-sink-asdb.js";

// In-memory DB stub: captures inserted rows via spy.
function makeFakeDb() {
  const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const db = {
    insert(table: unknown) {
      return {
        async values(v: Record<string, unknown>) {
          inserts.push({ table, values: v });
        },
      };
    },
    select: () => {
      throw new Error("select should not be called when resolveWorkspaceId is overridden");
    },
  };
  return { db, inserts };
}

describe("ASDB canvas projection events sink — happy path", () => {
  it("note_reference_changed: inserts a row with resolved workspaceId", async () => {
    const { db, inserts } = makeFakeDb();
    const sink = createAsdbCanvasProjectionEventSink({
      getDb: () => db as unknown as { insert: unknown; select: unknown },
      resolveWorkspaceId: async () => 42,
    });
    await sink({
      kind: "canvas.note_reference_changed",
      payload: { canvasId: 10, canvasNodeId: 100, referencedNoteId: 555 },
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toMatchObject({
      kind: "note_reference_changed",
      workspaceId: 42,
      canvasId: 10,
      canvasNodeId: 100,
      referencedNoteId: 555,
    });
  });

  it("note_reference_removed: inserts a row with the prior referencedNoteId", async () => {
    const { db, inserts } = makeFakeDb();
    const sink = createAsdbCanvasProjectionEventSink({
      getDb: () => db as unknown as { insert: unknown; select: unknown },
      resolveWorkspaceId: async () => 7,
    });
    await sink({
      kind: "canvas.note_reference_removed",
      payload: { canvasId: 1, canvasNodeId: 2, priorReferencedNoteId: 9999 },
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toMatchObject({
      kind: "note_reference_removed",
      workspaceId: 7,
      canvasId: 1,
      canvasNodeId: 2,
      referencedNoteId: 9999,
    });
  });

  it("invokes the workspaceId resolver with the canvasId from the event", async () => {
    const { db } = makeFakeDb();
    const resolver = vi.fn(async (_canvasId: number) => 1);
    const sink = createAsdbCanvasProjectionEventSink({
      getDb: () => db as unknown as { insert: unknown; select: unknown },
      resolveWorkspaceId: resolver,
    });
    await sink({
      kind: "canvas.note_reference_changed",
      payload: { canvasId: 77, canvasNodeId: 1, referencedNoteId: 2 },
    });
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledWith(77);
  });
});

describe("ASDB canvas projection events sink — defensive paths", () => {
  it("drops the event + WARNs when workspaceId resolves to null", async () => {
    const { db, inserts } = makeFakeDb();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sink = createAsdbCanvasProjectionEventSink({
      getDb: () => db as unknown as { insert: unknown; select: unknown },
      resolveWorkspaceId: async () => null,
    });
    await sink({
      kind: "canvas.note_reference_changed",
      payload: { canvasId: 1, canvasNodeId: 2, referencedNoteId: 3 },
    });
    expect(inserts).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("drops the event + WARNs when workspaceId resolver throws", async () => {
    const { db, inserts } = makeFakeDb();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sink = createAsdbCanvasProjectionEventSink({
      getDb: () => db as unknown as { insert: unknown; select: unknown },
      resolveWorkspaceId: async () => {
        throw new Error("ASDB unavailable");
      },
    });
    await sink({
      kind: "canvas.note_reference_changed",
      payload: { canvasId: 1, canvasNodeId: 2, referencedNoteId: 3 },
    });
    expect(inserts).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("drops the event + WARNs when getDb returns null (ASDB unavailable)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sink = createAsdbCanvasProjectionEventSink({
      getDb: () => null,
      resolveWorkspaceId: async () => 42,
    });
    await sink({
      kind: "canvas.note_reference_changed",
      payload: { canvasId: 1, canvasNodeId: 2, referencedNoteId: 3 },
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("ASDB canvas projection events sink — source-scan boundaries", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/canvas/projection-events-sink-asdb.ts",
  );
  const src = readFileSync(file, "utf8");
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");

  it("does not import credential-resolver", () => {
    expect(/from\s+["'][^"']*credential-resolver/.test(code)).toBe(false);
  });

  it("does not import or call dispatchMcpToolCall", () => {
    expect(/dispatchMcpToolCall\s*\(/.test(code)).toBe(false);
    expect(/import[^;]*dispatchMcpToolCall/.test(code)).toBe(false);
  });

  it("does not read *_API_KEY env vars", () => {
    expect(/process\.env\.[A-Z_]*API_KEY/.test(code)).toBe(false);
  });

  it("does not import neo4j-driver", () => {
    expect(/from\s+["']neo4j-driver["']/.test(code)).toBe(false);
  });

  it("does not import openrouter", () => {
    expect(/from\s+["'][^"']*openrouter/.test(code)).toBe(false);
  });

  it("does not import GraphRepository", () => {
    expect(
      /from\s+["'][^"']*graph\/repository(\.|\/|["'])/.test(code),
    ).toBe(false);
  });

  it("writes ONLY to agsCanvasProjectionEvents (append-only contract)", () => {
    expect(/\.insert\s*\(\s*agsCanvasProjectionEvents\s*\)/.test(code)).toBe(
      true,
    );
    // Disallow update/delete on the events table.
    expect(/\.update\s*\(\s*agsCanvasProjectionEvents/.test(code)).toBe(false);
    expect(/\.delete\s*\(\s*agsCanvasProjectionEvents/.test(code)).toBe(false);
  });
});
