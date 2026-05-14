/**
 * 17-γ canvas projection events drain orchestrator tests
 * (PR-V1-57).
 *
 * Covers `drainCanvasProjectionEventsForWorkspace` — stateless
 * batched drain composing the reader (#807) with a caller-supplied
 * forwarder.
 *
 * Uses DI seam (`getDb` via the reader) so tests run without a
 * live ASDB. Each test wires a fake DB whose `select().from().where().orderBy().limit(n)`
 * chain resolves to a pre-staged page of rows, optionally
 * different per cursor value to simulate multi-batch drains.
 */

import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_DRAIN_LIMIT,
  DEFAULT_DRAIN_MAX_BATCHES,
  drainCanvasProjectionEventsForWorkspace,
  type CanvasProjectionEventForwarder,
} from "../../server/agent-studio/services/canvas/projection-events-drain.js";
import type { AgsCanvasProjectionEvent } from "../../../drizzle/tables/agent-studio-canvas.js";

function makeRow(id: number): AgsCanvasProjectionEvent {
  return {
    id,
    kind: "note_reference_changed",
    workspaceId: 7,
    canvasId: 10,
    canvasNodeId: 100 + id,
    referencedNoteId: 500 + id,
    metadata: null,
    createdAt: new Date(),
  };
}

/**
 * Builds a fake DB whose `.limit(n)` resolves to the rows for the
 * current page based on `whereCondition`. Pages are returned by
 * `pageFn(lastSeenIdSeen)` so multi-batch tests can stage cursor-
 * keyed pages.
 */
function makeFakeDb(pageFn: (lastSeenIdHint: number) => unknown[]) {
  // We can't easily read the actual `gt(...)` SQL builder value
  // back out of the captured `whereCondition` — instead, track
  // the cumulative call count and feed pages sequentially. The
  // drain's contract guarantees the cursor advances monotonically,
  // so this matches behavior the production code requires.
  let callIdx = 0;
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
                      const rows = pageFn(callIdx);
                      callIdx++;
                      return rows;
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

describe("drainCanvasProjectionEventsForWorkspace — single batch", () => {
  it("processes all rows when reader returns < limit (catch-up)", async () => {
    const rows = [makeRow(1), makeRow(2), makeRow(3)];
    const db = makeFakeDb(() => rows);
    const forwarded: AgsCanvasProjectionEvent[] = [];
    const forward: CanvasProjectionEventForwarder = async (e) => {
      forwarded.push(e);
    };
    const result = await drainCanvasProjectionEventsForWorkspace(
      { workspaceId: 7, lastSeenId: 0, forward, limit: 10 },
      { getDb: () => db as never },
    );
    expect(result.processed).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.nextLastSeenId).toBe(3);
    expect(result.batchesRun).toBe(1);
    expect(result.hitMaxBatches).toBe(false);
    expect(forwarded.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it("returns lastSeenId unchanged when reader returns []", async () => {
    const db = makeFakeDb(() => []);
    const result = await drainCanvasProjectionEventsForWorkspace(
      {
        workspaceId: 7,
        lastSeenId: 42,
        forward: async () => {},
      },
      { getDb: () => db as never },
    );
    expect(result.processed).toBe(0);
    expect(result.nextLastSeenId).toBe(42);
    expect(result.batchesRun).toBe(1);
  });
});

describe("drainCanvasProjectionEventsForWorkspace — multi-batch", () => {
  it("keeps draining when reader returns full batches", async () => {
    // Two full batches (3 + 3), then 1 partial batch (2) → stop.
    const pages = [
      [makeRow(1), makeRow(2), makeRow(3)],
      [makeRow(4), makeRow(5), makeRow(6)],
      [makeRow(7), makeRow(8)],
    ];
    const db = makeFakeDb((i) => pages[i] ?? []);
    const forwarded: number[] = [];
    const result = await drainCanvasProjectionEventsForWorkspace(
      {
        workspaceId: 7,
        lastSeenId: 0,
        limit: 3,
        forward: async (e) => {
          forwarded.push(e.id);
        },
      },
      { getDb: () => db as never },
    );
    expect(result.processed).toBe(8);
    expect(result.nextLastSeenId).toBe(8);
    expect(result.batchesRun).toBe(3);
    expect(result.hitMaxBatches).toBe(false);
    expect(forwarded).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("stops at maxBatches even with more rows available", async () => {
    // Every batch returns a full page → infinite work if we
    // didn't have the ceiling.
    const db = makeFakeDb(() => [makeRow(1), makeRow(2)]);
    let counter = 0;
    const forward: CanvasProjectionEventForwarder = async () => {
      // Re-id the rows so cursor moves; otherwise the reader stub
      // would feed the same rows back. We instead just count
      // forwards.
      counter++;
    };
    const result = await drainCanvasProjectionEventsForWorkspace(
      {
        workspaceId: 7,
        lastSeenId: 0,
        forward,
        limit: 2,
        maxBatches: 3,
      },
      { getDb: () => db as never },
    );
    expect(result.batchesRun).toBe(3);
    expect(result.hitMaxBatches).toBe(true);
    // 3 batches * 2 rows = 6 forwards.
    expect(counter).toBe(6);
  });
});

describe("drainCanvasProjectionEventsForWorkspace — forwarder failures", () => {
  it("halts at the failing row; cursor stays at last successful id", async () => {
    const db = makeFakeDb(() => [makeRow(1), makeRow(2), makeRow(3)]);
    let count = 0;
    const forward: CanvasProjectionEventForwarder = async (e) => {
      count++;
      if (e.id === 2) throw new Error("forward boom");
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await drainCanvasProjectionEventsForWorkspace(
      { workspaceId: 7, lastSeenId: 0, forward, limit: 10 },
      { getDb: () => db as never },
    );
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.nextLastSeenId).toBe(1);
    expect(count).toBe(2);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("drainCanvasProjectionEventsForWorkspace — defaults", () => {
  it("uses DEFAULT_DRAIN_LIMIT when no limit supplied", async () => {
    let capturedLimit: number | null = null;
    const db = {
      select() {
        return {
          from() {
            return {
              where() {
                return {
                  orderBy() {
                    return {
                      async limit(n: number) {
                        capturedLimit = n;
                        return [];
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
    await drainCanvasProjectionEventsForWorkspace(
      {
        workspaceId: 7,
        lastSeenId: 0,
        forward: async () => {},
      },
      { getDb: () => db as never },
    );
    expect(capturedLimit).toBe(DEFAULT_DRAIN_LIMIT);
  });

  it("exports a defensive default for maxBatches", () => {
    expect(DEFAULT_DRAIN_MAX_BATCHES).toBeGreaterThan(0);
    expect(DEFAULT_DRAIN_MAX_BATCHES).toBeLessThan(1000);
  });
});

describe("drainCanvasProjectionEventsForWorkspace — source-scan boundaries", () => {
  const { readFileSync } = require("fs");
  const { resolve } = require("path");
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/canvas/projection-events-drain.ts",
  );
  const src: string = readFileSync(file, "utf8");
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
