/**
 * V1+ 17-γ env-flag-gated default canvas projection events drain
 * forwarder installer tests (PR-V1-79).
 *
 * Behavior tests + boot.ts wire-up source-scan. Pattern mirrors the
 * existing #811 `install-default-projection-events-drain-scheduler`
 * test suite.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it, vi } from "vitest";

import {
  CANVAS_PROJECTION_EVENTS_DRAIN_FORWARDER_MODES,
  maybeInstallDefaultCanvasProjectionEventsDrainForwarder,
} from "../../server/agent-studio/services/canvas/install-default-projection-events-drain-forwarder.js";

describe("CANVAS_PROJECTION_EVENTS_DRAIN_FORWARDER_MODES — closed taxonomy", () => {
  it("currently exposes a single mode: 'log' (sync-worker deferred)", () => {
    expect(CANVAS_PROJECTION_EVENTS_DRAIN_FORWARDER_MODES).toEqual(["log"]);
  });
});

describe("maybeInstallDefaultCanvasProjectionEventsDrainForwarder — env-flag matrix", () => {
  it("unset env → no-op, returns {mode: null, installed: false}", async () => {
    const install = vi.fn();
    const result =
      await maybeInstallDefaultCanvasProjectionEventsDrainForwarder({
        env: {},
        install,
      });
    expect(result).toEqual({ mode: null, installed: false });
    expect(install).not.toHaveBeenCalled();
  });

  it("AGS_CANVAS_PROJECTION_EVENTS_DRAIN_FORWARDER=log → installs", async () => {
    const install = vi.fn();
    const result =
      await maybeInstallDefaultCanvasProjectionEventsDrainForwarder({
        env: {
          AGS_CANVAS_PROJECTION_EVENTS_DRAIN_FORWARDER: "log",
        },
        install,
      });
    expect(result).toEqual({ mode: "log", installed: true });
    expect(install).toHaveBeenCalledTimes(1);
  });

  it.each([
    "LOG",
    "log ",
    " log",
    "yes",
    "true",
    "sync-worker",
    "",
  ])(
    "rejects non-matching env value %j (strict equality on the closed taxonomy)",
    async (raw) => {
      const install = vi.fn();
      const result =
        await maybeInstallDefaultCanvasProjectionEventsDrainForwarder({
          env: { AGS_CANVAS_PROJECTION_EVENTS_DRAIN_FORWARDER: raw },
          install,
        });
      expect(result).toEqual({ mode: null, installed: false });
      expect(install).not.toHaveBeenCalled();
    },
  );
});

describe("log-mode forwarder — dispatch behavior", () => {
  it("the installed forwarder logs one structured line per event", async () => {
    let captured: ((row: unknown) => Promise<void>) | undefined;
    const install = vi.fn((forwarder: (row: unknown) => Promise<void>) => {
      captured = forwarder;
    });
    await maybeInstallDefaultCanvasProjectionEventsDrainForwarder({
      env: { AGS_CANVAS_PROJECTION_EVENTS_DRAIN_FORWARDER: "log" },
      install,
    });
    expect(captured).toBeDefined();

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      // Feed it a fake row matching the AgsCanvasProjectionEvent shape.
      await captured!({
        id: 1,
        kind: "note_reference_changed",
        workspaceId: 100,
        canvasId: 7,
        canvasNodeId: 70,
        referencedNoteId: 700,
        metadata: null,
        createdAt: new Date(),
      });
      expect(logSpy).toHaveBeenCalledTimes(1);
      const callArg = logSpy.mock.calls[0]?.[0] as string;
      expect(callArg).toMatch(/canvas-projection-events-drain/);
      expect(callArg).toMatch(/kind=canvas\.note_reference_changed/);
      expect(callArg).toMatch(/canvasNodeId/);
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe("boot.ts source-scan — Step 3.30 wire-up", () => {
  const file = resolve(__dirname, "../../server/agent-studio/boot.ts");
  const src = readFileSync(file, "utf8");

  it("boot.ts imports maybeInstallDefaultCanvasProjectionEventsDrainForwarder", () => {
    expect(
      /maybeInstallDefaultCanvasProjectionEventsDrainForwarder/.test(src),
    ).toBe(true);
  });

  it("boot.ts has a Step 3.30 label for the new install step", () => {
    expect(/Step 3\.30/.test(src)).toBe(true);
  });

  it("boot.ts wraps the install call in try/catch", () => {
    // Slice from Step 3.30 forward to the next Step header, assert
    // a try/catch envelope is present.
    const stepStart = src.search(/\/\/\s*Step\s+3\.30\b/);
    expect(stepStart).toBeGreaterThan(-1);
    const after = src.slice(stepStart);
    const nextStep = after.search(/\/\/\s*Step\s+3\.\d{2,}\b/g);
    // Re-search after skipping the matched Step 3.30 header itself.
    const afterHeader = after.slice(20);
    const nextStepIdx = afterHeader.search(/\/\/\s*Step\s+3\.\d{2,}\b/);
    const slice =
      nextStepIdx > 0 ? after.slice(0, 20 + nextStepIdx) : after;
    expect(/\btry\s*\{/.test(slice)).toBe(true);
    expect(/\}\s*catch\s*\(/.test(slice)).toBe(true);
  });

  it("boot.ts logs the installed-mode case with the mode in the message", () => {
    const stepStart = src.search(/\/\/\s*Step\s+3\.30\b/);
    const after = src.slice(stepStart);
    expect(
      /default forwarder installed.*mode=\$\{result\.mode\}/.test(after),
    ).toBe(true);
  });
});
