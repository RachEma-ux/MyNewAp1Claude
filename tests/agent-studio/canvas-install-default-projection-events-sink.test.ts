/**
 * 17-γ default canvas projection events sink installer tests
 * (PR-V1-55).
 *
 * Mirrors AS-4 (`publish-targets-install-default-governance-gate.test.ts`
 * from #786): env-flag-gated installer with three test seams
 * (`env`, `install`, `makeSink`). Covers:
 *
 *   - Env flag unset → no-op (mode="off", installed=false).
 *   - Env flag with any other value → no-op (strict equality).
 *   - Env flag = "asdb" → installs the ASDB sink.
 *   - Install seam wins (test-only path bypasses the real registry).
 *   - MakeSink seam wins (test-only path bypasses the ASDB sink).
 *   - Source-scan boundaries.
 *   - Boot integration: server/agent-studio/boot.ts calls the
 *     installer in Step 3.28 with the expected logging shape.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it, vi } from "vitest";

import {
  ASDB_SINK_MODE,
  CANVAS_PROJECTION_EVENTS_SINK_ENV_VAR,
  maybeInstallDefaultCanvasProjectionEventsSink,
} from "../../server/agent-studio/services/canvas/install-default-projection-events-sink.js";
import {
  __resetCanvasProjectionEventSinkForTests,
  hasCanvasProjectionEventSink,
} from "../../server/agent-studio/services/canvas/projection-events-sink.js";

describe("maybeInstallDefaultCanvasProjectionEventsSink — env-flag matrix", () => {
  it("env unset → no-op", () => {
    __resetCanvasProjectionEventSinkForTests();
    const result = maybeInstallDefaultCanvasProjectionEventsSink({
      env: {},
    });
    expect(result.mode).toBe("off");
    expect(result.installed).toBe(false);
    expect(hasCanvasProjectionEventSink()).toBe(false);
  });

  it.each(["", "ASDB", "off", "true", "1", "asdb "])(
    'env="%s" → no-op (strict equality match required)',
    (flagValue) => {
      __resetCanvasProjectionEventSinkForTests();
      const result = maybeInstallDefaultCanvasProjectionEventsSink({
        env: { [CANVAS_PROJECTION_EVENTS_SINK_ENV_VAR]: flagValue },
      });
      expect(result.mode).toBe("off");
      expect(result.installed).toBe(false);
      expect(hasCanvasProjectionEventSink()).toBe(false);
    },
  );

  it('env="asdb" + makeSink + install seams → installs the produced sink', () => {
    __resetCanvasProjectionEventSinkForTests();
    const sentinel: () => void = () => {};
    const result = maybeInstallDefaultCanvasProjectionEventsSink({
      env: { [CANVAS_PROJECTION_EVENTS_SINK_ENV_VAR]: ASDB_SINK_MODE },
      makeSink: () => sentinel,
      install: (sink) => {
        // Seam: capture without going through the real registry to
        // avoid the lazy ASDB import.
        captured = sink;
      },
    });
    expect(result.mode).toBe("asdb");
    expect(result.installed).toBe(true);
    expect(captured).toBe(sentinel);
  });

  it('env="asdb" + makeSink seam only → install routes through the registry', () => {
    __resetCanvasProjectionEventSinkForTests();
    expect(hasCanvasProjectionEventSink()).toBe(false);
    const sentinel = () => {};
    const result = maybeInstallDefaultCanvasProjectionEventsSink({
      env: { [CANVAS_PROJECTION_EVENTS_SINK_ENV_VAR]: ASDB_SINK_MODE },
      makeSink: () => sentinel,
    });
    expect(result.installed).toBe(true);
    expect(hasCanvasProjectionEventSink()).toBe(true);
    __resetCanvasProjectionEventSinkForTests();
  });
});

describe("maybeInstallDefaultCanvasProjectionEventsSink — process.env default", () => {
  it("defaults to process.env when no env seam is supplied (still off by default)", () => {
    __resetCanvasProjectionEventSinkForTests();
    const prior = process.env[CANVAS_PROJECTION_EVENTS_SINK_ENV_VAR];
    delete process.env[CANVAS_PROJECTION_EVENTS_SINK_ENV_VAR];
    try {
      const result = maybeInstallDefaultCanvasProjectionEventsSink();
      expect(result.mode).toBe("off");
      expect(result.installed).toBe(false);
    } finally {
      if (prior !== undefined) {
        process.env[CANVAS_PROJECTION_EVENTS_SINK_ENV_VAR] = prior;
      }
    }
  });
});

describe("install-default-projection-events-sink — source-scan boundaries", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/canvas/install-default-projection-events-sink.ts",
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
});

describe("boot.ts wiring — Step 3.28", () => {
  const file = resolve(__dirname, "../../server/agent-studio/boot.ts");
  const src = readFileSync(file, "utf8");

  it("imports maybeInstallDefaultCanvasProjectionEventsSink", () => {
    expect(/maybeInstallDefaultCanvasProjectionEventsSink/.test(src)).toBe(
      true,
    );
  });

  it("logs the installed-mode + skipped-mode cases", () => {
    expect(src.includes("[ags-canvas-projection-events] default sink installed")).toBe(true);
    expect(src.includes("[ags-canvas-projection-events] default sink not installed")).toBe(true);
  });

  it("references the install module by its file path", () => {
    expect(
      src.includes("./services/canvas/install-default-projection-events-sink"),
    ).toBe(true);
  });
});

// Test-scoped storage for the install seam in the third top-level
// test. Declared after `describe` blocks so vitest's module-init
// timing doesn't trip on `let`-binding hoisting.
let captured: unknown = null;
