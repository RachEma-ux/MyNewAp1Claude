/**
 * 17-γ canvas projection events drain scheduler installer tests
 * (PR-V1-60).
 *
 * Covers `maybeInstallDefaultCanvasProjectionEventsDrainScheduler` —
 * env-flag-gated setInterval-based scheduler that calls the
 * module-singleton tick (#810) on a fixed cadence.
 *
 * Mirrors the AS-4 / 17-γ sink installer test shape.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it, vi } from "vitest";

import {
  CANVAS_PROJECTION_EVENTS_DRAIN_ENV_VAR,
  CANVAS_PROJECTION_EVENTS_DRAIN_INTERVAL_MS_ENV_VAR,
  DEFAULT_CANVAS_DRAIN_TICK_INTERVAL_MS,
  INTERVAL_SCHEDULER_MODE,
  maybeInstallDefaultCanvasProjectionEventsDrainScheduler,
} from "../../server/agent-studio/services/canvas/install-default-projection-events-drain-scheduler.js";

describe("drain scheduler installer — env-flag matrix", () => {
  it("env unset → no-op", () => {
    const result = maybeInstallDefaultCanvasProjectionEventsDrainScheduler({
      env: {},
    });
    expect(result.mode).toBe("off");
    expect(result.installed).toBe(false);
    expect(result.intervalMs).toBeNull();
    expect(result.handle).toBeNull();
  });

  it.each(["", "Interval", "on", "1", "interval "])(
    'env="%s" → no-op (strict equality required)',
    (flagValue) => {
      const result = maybeInstallDefaultCanvasProjectionEventsDrainScheduler({
        env: { [CANVAS_PROJECTION_EVENTS_DRAIN_ENV_VAR]: flagValue },
      });
      expect(result.mode).toBe("off");
      expect(result.installed).toBe(false);
    },
  );
});

describe("drain scheduler installer — install path", () => {
  it("installs setInterval with the default interval when no override", () => {
    const calls: Array<{ ms: number; fn: () => void }> = [];
    const fakeInterval = vi.fn((fn: () => void, ms: number) => {
      calls.push({ ms, fn });
      return { unref: () => {} };
    });
    const result = maybeInstallDefaultCanvasProjectionEventsDrainScheduler({
      env: { [CANVAS_PROJECTION_EVENTS_DRAIN_ENV_VAR]: INTERVAL_SCHEDULER_MODE },
      setInterval: fakeInterval,
      tick: async () => undefined,
    });
    expect(result.mode).toBe("interval");
    expect(result.installed).toBe(true);
    expect(result.intervalMs).toBe(DEFAULT_CANVAS_DRAIN_TICK_INTERVAL_MS);
    expect(calls.length).toBe(1);
    expect(calls[0].ms).toBe(DEFAULT_CANVAS_DRAIN_TICK_INTERVAL_MS);
  });

  it("honors AGS_*_INTERVAL_MS override when a valid number", () => {
    const fakeInterval = vi.fn(
      (_fn: () => void, _ms: number) => ({ unref: () => {} }),
    );
    const result = maybeInstallDefaultCanvasProjectionEventsDrainScheduler({
      env: {
        [CANVAS_PROJECTION_EVENTS_DRAIN_ENV_VAR]: INTERVAL_SCHEDULER_MODE,
        [CANVAS_PROJECTION_EVENTS_DRAIN_INTERVAL_MS_ENV_VAR]: "15000",
      },
      setInterval: fakeInterval,
      tick: async () => undefined,
    });
    expect(result.intervalMs).toBe(15000);
    expect(fakeInterval).toHaveBeenCalledWith(expect.any(Function), 15000);
  });

  it("falls back to default when AGS_*_INTERVAL_MS is invalid", () => {
    const fakeInterval = vi.fn(
      (_fn: () => void, _ms: number) => ({ unref: () => {} }),
    );
    for (const bad of ["abc", "-100", "0"]) {
      fakeInterval.mockClear();
      const result = maybeInstallDefaultCanvasProjectionEventsDrainScheduler({
        env: {
          [CANVAS_PROJECTION_EVENTS_DRAIN_ENV_VAR]: INTERVAL_SCHEDULER_MODE,
          [CANVAS_PROJECTION_EVENTS_DRAIN_INTERVAL_MS_ENV_VAR]: bad,
        },
        setInterval: fakeInterval,
        tick: async () => undefined,
      });
      expect(result.intervalMs).toBe(DEFAULT_CANVAS_DRAIN_TICK_INTERVAL_MS);
    }
  });
});

describe("drain scheduler installer — tick invocation", () => {
  it("the installed callback invokes the tick implementation", async () => {
    let captured: (() => void) | null = null;
    const tick = vi.fn(async () => undefined);
    const fakeInterval = (fn: () => void, _ms: number) => {
      captured = fn;
      return { unref: () => {} };
    };
    const result = maybeInstallDefaultCanvasProjectionEventsDrainScheduler({
      env: { [CANVAS_PROJECTION_EVENTS_DRAIN_ENV_VAR]: INTERVAL_SCHEDULER_MODE },
      setInterval: fakeInterval,
      tick,
    });
    expect(result.installed).toBe(true);
    expect(captured).not.toBeNull();
    captured!();
    // Wait one microtask for the fire-and-forget promise.
    await new Promise((r) => setImmediate(r));
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("never throws out of the interval callback even if tick rejects", async () => {
    let captured: (() => void) | null = null;
    const tick = vi.fn(async () => {
      throw new Error("tick boom");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fakeInterval = (fn: () => void, _ms: number) => {
      captured = fn;
      return { unref: () => {} };
    };
    maybeInstallDefaultCanvasProjectionEventsDrainScheduler({
      env: { [CANVAS_PROJECTION_EVENTS_DRAIN_ENV_VAR]: INTERVAL_SCHEDULER_MODE },
      setInterval: fakeInterval,
      tick,
    });
    // Should not throw synchronously.
    expect(() => captured!()).not.toThrow();
    await new Promise((r) => setImmediate(r));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("drain scheduler installer — unref handling", () => {
  it("calls unref when the interval handle exposes it", () => {
    const unref = vi.fn();
    const fakeInterval = (_fn: () => void, _ms: number) => ({ unref });
    maybeInstallDefaultCanvasProjectionEventsDrainScheduler({
      env: { [CANVAS_PROJECTION_EVENTS_DRAIN_ENV_VAR]: INTERVAL_SCHEDULER_MODE },
      setInterval: fakeInterval,
      tick: async () => undefined,
    });
    expect(unref).toHaveBeenCalledTimes(1);
  });

  it("tolerates a numeric handle (no unref) without throwing", () => {
    const fakeInterval = (_fn: () => void, _ms: number) => 1234 as unknown as number;
    expect(() =>
      maybeInstallDefaultCanvasProjectionEventsDrainScheduler({
        env: { [CANVAS_PROJECTION_EVENTS_DRAIN_ENV_VAR]: INTERVAL_SCHEDULER_MODE },
        setInterval: fakeInterval,
        tick: async () => undefined,
      }),
    ).not.toThrow();
  });
});

describe("drain scheduler installer — source-scan boundaries", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/canvas/install-default-projection-events-drain-scheduler.ts",
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
});
