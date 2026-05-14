/**
 * 17-γ drain tick module-singleton wrapper tests (PR-V1-59).
 *
 * Covers the module-local cursor map + forwarder install path.
 * Uses DI seam (`getDb`, `getWorkspaceIds`) so tests run without
 * a live ASDB.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetCanvasProjectionEventsDrainForTests,
  getCanvasProjectionEventsDrainLastTickResult,
  hasCanvasProjectionEventsDrainForwarder,
  installCanvasProjectionEventsDrainForwarder,
  tickCanvasProjectionEventsDrain,
} from "../../server/agent-studio/services/canvas/projection-events-drain-tick.js";
import type { AgsCanvasProjectionEvent } from "../../../drizzle/tables/agent-studio-canvas.js";

function makeRow(id: number, workspaceId: number): AgsCanvasProjectionEvent {
  return {
    id,
    kind: "note_reference_changed",
    workspaceId,
    canvasId: 10,
    canvasNodeId: 100 + id,
    referencedNoteId: 500 + id,
    metadata: null,
    createdAt: new Date(),
  };
}

function makeFakeDb(pages: unknown[][]) {
  let i = 0;
  return {
    select() {
      return {
        from() {
          return {
            where() {
              return {
                orderBy() {
                  return {
                    async limit(_n: number) {
                      const page = pages[i] ?? [];
                      i++;
                      return page;
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

beforeEach(() => {
  __resetCanvasProjectionEventsDrainForTests();
});

describe("tick wrapper — install + invoke", () => {
  it("no-op + WARN when no forwarder installed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await tickCanvasProjectionEventsDrain();
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("hasForwarder() reflects install state", () => {
    expect(hasCanvasProjectionEventsDrainForwarder()).toBe(false);
    installCanvasProjectionEventsDrainForwarder(async () => {});
    expect(hasCanvasProjectionEventsDrainForwarder()).toBe(true);
  });

  it("invokes the fan-out when a forwarder is installed", async () => {
    const forwarded: AgsCanvasProjectionEvent[] = [];
    installCanvasProjectionEventsDrainForwarder(async (e) => {
      forwarded.push(e);
    });
    const db = makeFakeDb([[makeRow(1, 7), makeRow(2, 7)]]);
    const result = await tickCanvasProjectionEventsDrain({
      getDb: () => db as never,
      getWorkspaceIds: async () => [7],
      limit: 10,
    });
    expect(result).not.toBeNull();
    expect(result!.workspacesScanned).toBe(1);
    expect(result!.totalProcessed).toBe(2);
    expect(forwarded.map((e) => e.id)).toEqual([1, 2]);
  });
});

describe("tick wrapper — module-local cursor map persists across ticks", () => {
  it("second tick continues from the first tick's cursor", async () => {
    installCanvasProjectionEventsDrainForwarder(async () => {});

    // First tick: workspace 7 sees row id=10 → cursor map gets {7: 10}.
    const db1 = makeFakeDb([[makeRow(10, 7)]]);
    await tickCanvasProjectionEventsDrain({
      getDb: () => db1 as never,
      getWorkspaceIds: async () => [7],
      limit: 10,
    });

    // Second tick: workspace 7 sees row id=20. Cursor advances to 20.
    const db2 = makeFakeDb([[makeRow(20, 7)]]);
    const result = await tickCanvasProjectionEventsDrain({
      getDb: () => db2 as never,
      getWorkspaceIds: async () => [7],
      limit: 10,
    });
    expect(result!.totalProcessed).toBe(1);
    const status = getCanvasProjectionEventsDrainLastTickResult();
    expect(status.ticksRun).toBe(2);
    expect(status.cursorMapSize).toBe(1);
  });
});

describe("tick wrapper — observability state", () => {
  it("tracks ticksRun + lastTickResult on success", async () => {
    installCanvasProjectionEventsDrainForwarder(async () => {});
    const db = makeFakeDb([[]]);
    await tickCanvasProjectionEventsDrain({
      getDb: () => db as never,
      getWorkspaceIds: async () => [42],
    });
    const status = getCanvasProjectionEventsDrainLastTickResult();
    expect(status.ticksRun).toBe(1);
    expect(status.lastTickResult).not.toBeNull();
    expect(status.lastTickError).toBeNull();
  });

  it("captures lastTickError on unexpected fan-out throws (e.g. cursor mutation crash)", async () => {
    installCanvasProjectionEventsDrainForwarder(async () => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // The fan-out wraps per-workspace drains in try/catch, but a
    // throw from `getWorkspaceIds` itself is ALSO caught (returns
    // an empty workspaces list with a WARN). To exercise the tick
    // wrapper's outer try/catch we use a `getWorkspaceIds` that
    // returns a non-iterable to force `for (const workspaceId of
    // workspaceIds)` to throw at the language level.
    const result = await tickCanvasProjectionEventsDrain({
      getWorkspaceIds: async () =>
        (null as unknown) as readonly number[],
    });
    expect(result).toBeNull();
    const status = getCanvasProjectionEventsDrainLastTickResult();
    expect(status.lastTickError).not.toBeNull();
    warn.mockRestore();
  });
});

describe("tick wrapper — source-scan boundaries", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/canvas/projection-events-drain-tick.ts",
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

  it("does not import neo4j-driver / openrouter / GraphRepository", () => {
    expect(/from\s+["']neo4j-driver["']/.test(code)).toBe(false);
    expect(/from\s+["'][^"']*openrouter/.test(code)).toBe(false);
    expect(
      /from\s+["'][^"']*graph\/repository(\.|\/|["'])/.test(code),
    ).toBe(false);
  });

  it("has no insert/update/delete (drain is read + forward)", () => {
    expect(/\.insert\s*\(/.test(code)).toBe(false);
    expect(/\.update\s*\(/.test(code)).toBe(false);
    expect(/\.delete\s*\(/.test(code)).toBe(false);
  });
});
