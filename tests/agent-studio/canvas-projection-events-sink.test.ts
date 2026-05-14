/**
 * Canvas projection events sink — V1+ 17-γ (PR-V1-41).
 *
 * Covers:
 *   - Registry semantics: register / get / has / __reset (mirrors AS-2)
 *   - recordCanvasProjectionEvent no-op when no sink registered
 *     (default state — preserves existing behavior)
 *   - recordCanvasProjectionEvent forwards event to registered sink
 *   - Sink errors are caught + logged (warn) — mutation path never
 *     fails on sink failure
 *   - Closed event-shape union (canvas.note_reference_changed +
 *     canvas.note_reference_removed)
 *   - Public-api re-export shape
 *   - Source-scan boundary: sink file is hard-rule clean + does NOT
 *     import the ProjectionSyncWorker (forbidden — would pull
 *     forbidden surfaces transitively)
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __resetCanvasProjectionEventSinkForTests,
  getCanvasProjectionEventSink,
  hasCanvasProjectionEventSink,
  recordCanvasProjectionEvent,
  registerCanvasProjectionEventSink,
  type CanvasProjectionEvent,
  type CanvasProjectionEventSink,
} from "../../server/agent-studio/services/canvas/projection-events-sink.js";

afterEach(() => {
  __resetCanvasProjectionEventSinkForTests();
  vi.restoreAllMocks();
});

describe("canvas projection events sink — registry", () => {
  it("starts unregistered — get returns null, has=false", () => {
    expect(getCanvasProjectionEventSink()).toBeNull();
    expect(hasCanvasProjectionEventSink()).toBe(false);
  });

  it("register + get + has — returns the registered sink", () => {
    const sink: CanvasProjectionEventSink = vi.fn();
    registerCanvasProjectionEventSink(sink);
    expect(getCanvasProjectionEventSink()).toBe(sink);
    expect(hasCanvasProjectionEventSink()).toBe(true);
  });

  it("re-register overwrites prior sink (idempotent)", () => {
    const a: CanvasProjectionEventSink = vi.fn();
    const b: CanvasProjectionEventSink = vi.fn();
    registerCanvasProjectionEventSink(a);
    registerCanvasProjectionEventSink(b);
    expect(getCanvasProjectionEventSink()).toBe(b);
  });

  it("__reset clears the registered sink", () => {
    registerCanvasProjectionEventSink(vi.fn());
    __resetCanvasProjectionEventSinkForTests();
    expect(getCanvasProjectionEventSink()).toBeNull();
    expect(hasCanvasProjectionEventSink()).toBe(false);
  });
});

describe("recordCanvasProjectionEvent — no-op default", () => {
  it("does NOT throw when no sink is registered (default state)", async () => {
    await expect(
      recordCanvasProjectionEvent({
        kind: "canvas.note_reference_changed",
        payload: { canvasId: 1, canvasNodeId: 2, referencedNoteId: 3 },
      }),
    ).resolves.toBeUndefined();
  });

  it("does NOT throw on the removed-kind either", async () => {
    await expect(
      recordCanvasProjectionEvent({
        kind: "canvas.note_reference_removed",
        payload: { canvasNodeId: 7 },
      }),
    ).resolves.toBeUndefined();
  });
});

describe("recordCanvasProjectionEvent — sink forwarding", () => {
  it("forwards canvas.note_reference_changed events to the registered sink", async () => {
    const sink = vi.fn();
    registerCanvasProjectionEventSink(sink);
    const event: CanvasProjectionEvent = {
      kind: "canvas.note_reference_changed",
      payload: { canvasId: 1, canvasNodeId: 2, referencedNoteId: 3 },
    };
    await recordCanvasProjectionEvent(event);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith(event);
  });

  it("forwards canvas.note_reference_removed events to the registered sink", async () => {
    const sink = vi.fn();
    registerCanvasProjectionEventSink(sink);
    const event: CanvasProjectionEvent = {
      kind: "canvas.note_reference_removed",
      payload: { canvasNodeId: 99 },
    };
    await recordCanvasProjectionEvent(event);
    expect(sink).toHaveBeenCalledWith(event);
  });

  it("awaits async sinks", async () => {
    const seen: CanvasProjectionEvent[] = [];
    registerCanvasProjectionEventSink(async (e) => {
      await new Promise((r) => setImmediate(r));
      seen.push(e);
    });
    await recordCanvasProjectionEvent({
      kind: "canvas.note_reference_removed",
      payload: { canvasNodeId: 5 },
    });
    expect(seen).toHaveLength(1);
  });
});

describe("recordCanvasProjectionEvent — sink errors caught", () => {
  it("caught sink throw does NOT propagate (mutation path stays alive)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerCanvasProjectionEventSink(() => {
      throw new Error("sink boom");
    });
    await expect(
      recordCanvasProjectionEvent({
        kind: "canvas.note_reference_changed",
        payload: { canvasId: 1, canvasNodeId: 2, referencedNoteId: 3 },
      }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls[0]?.[0]).toMatch(/sink error/);
  });

  it("caught async sink rejection does NOT propagate", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerCanvasProjectionEventSink(async () => {
      throw new Error("async boom");
    });
    await expect(
      recordCanvasProjectionEvent({
        kind: "canvas.note_reference_removed",
        payload: { canvasNodeId: 1 },
      }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});

describe("public-api re-exports", () => {
  it("the canvas barrel re-exports the 5 sink-registry names + 2 types", async () => {
    const barrel = await import(
      "../../server/agent-studio/services/canvas/public-api.js"
    );
    expect(typeof barrel.registerCanvasProjectionEventSink).toBe("function");
    expect(typeof barrel.getCanvasProjectionEventSink).toBe("function");
    expect(typeof barrel.hasCanvasProjectionEventSink).toBe("function");
    expect(
      typeof barrel.__resetCanvasProjectionEventSinkForTests,
    ).toBe("function");
    expect(typeof barrel.recordCanvasProjectionEvent).toBe("function");
  });
});

describe("source-scan boundary", () => {
  const sinkFile = resolve(
    __dirname,
    "../../server/agent-studio/services/canvas/projection-events-sink.ts",
  );
  const serviceFile = resolve(
    __dirname,
    "../../server/agent-studio/services/canvas/canvas-service.ts",
  );
  const sinkSrc = readFileSync(sinkFile, "utf8");
  const serviceSrc = readFileSync(serviceFile, "utf8");

  it("sink does not import credential-resolver", () => {
    expect(/from\s+["'][^"']*credential-resolver/.test(sinkSrc)).toBe(false);
  });

  it("sink does not import dispatchMcpToolCall", () => {
    expect(
      /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.test(
        sinkSrc,
      ),
    ).toBe(false);
  });

  it("sink does not read process.env.*_API_KEY", () => {
    expect(/process\.env\.[A-Z_]*_API_KEY/.test(sinkSrc)).toBe(false);
  });

  it("sink does not import neo4j-driver", () => {
    expect(/from\s+["']neo4j-driver["']/.test(sinkSrc)).toBe(false);
  });

  it("sink does not import openrouter model-access", () => {
    expect(/from\s+["'][^"']*openrouter\/model-access/.test(sinkSrc)).toBe(
      false,
    );
  });

  it("sink does not import GraphRepository", () => {
    expect(/from\s+["'][^"']*graph\/repository/.test(sinkSrc)).toBe(false);
  });

  it("sink does not import ProjectionSyncWorker (avoids transitive coupling)", () => {
    expect(
      /from\s+["'][^"']*graph\/projection\/sync-worker/.test(sinkSrc),
    ).toBe(false);
  });

  it("canvas-service imports recordCanvasProjectionEvent from the sink module", () => {
    expect(/recordCanvasProjectionEvent/.test(serviceSrc)).toBe(true);
    expect(
      /from\s+["']\.\/projection-events-sink(\.js)?["']/.test(serviceSrc),
    ).toBe(true);
  });

  it("canvas-service does NOT import the ProjectionSyncWorker directly", () => {
    expect(
      /from\s+["'][^"']*graph\/projection\/sync-worker/.test(serviceSrc),
    ).toBe(false);
  });
});
