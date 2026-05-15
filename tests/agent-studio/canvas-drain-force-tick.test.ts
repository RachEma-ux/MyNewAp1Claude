/**
 * Canvas projection events drain — force-tick admin mutation.
 * PR-V1-174.
 *
 * Source-scan of the new `forceTick` mutation on the existing
 * `canvasProjectionEventsDrainRouter`. The tick wrapper's behavior
 * is covered by the existing #810 test suite; this verifies the
 * router exposure + the no-forwarder-installed short-circuit shape.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-174 — canvas projection events drain forceTick mutation", () => {
  const routerFile = resolve(
    __dirname,
    "../../server/agent-studio/services/canvas/projection-events-drain-router.ts",
  );

  it("imports tick wrapper + forwarder-installed predicate", () => {
    const src = readFileSync(routerFile, "utf8");
    expect(src).toContain(
      "getCanvasProjectionEventsDrainLastTickResult",
    );
    expect(src).toContain(
      "hasCanvasProjectionEventsDrainForwarder",
    );
    expect(src).toContain("tickCanvasProjectionEventsDrain");
  });

  it("declares forceTick as an adminProcedure mutation", () => {
    const src = readFileSync(routerFile, "utf8");
    expect(/forceTick:\s*adminProcedure\.mutation\(/.test(src)).toBe(true);
  });

  it("short-circuits with no_forwarder_installed when no forwarder is wired", () => {
    const src = readFileSync(routerFile, "utf8");
    expect(
      /if\s*\(\s*!hasCanvasProjectionEventsDrainForwarder\(\)\s*\)/.test(src),
    ).toBe(true);
    expect(src).toContain('reason: "no_forwarder_installed" as const');
    expect(src).toContain("ran: false as const");
  });

  it("happy path runs the tick and wraps the aggregate", () => {
    const src = readFileSync(routerFile, "utf8");
    expect(
      /const\s+result\s*=\s*await\s+tickCanvasProjectionEventsDrain\(\)/.test(
        src,
      ),
    ).toBe(true);
    expect(src).toContain("ran: true as const");
  });

  it("hard-rule compliance + adminProcedure guard", () => {
    const src = readFileSync(routerFile, "utf8");
    expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(src)).toBe(false);
    expect(/credential-resolver/.test(src)).toBe(false);
    expect(/dispatchMcpToolCall/.test(src)).toBe(false);
    expect(/neo4j-driver/.test(src)).toBe(false);
    expect(/adminProcedure/.test(src)).toBe(true);
    // Read-only assertion broken — mutations now exist. Verify both
    // verbs are present.
    expect(/\.query\(/.test(src)).toBe(true);
    expect(/\.mutation\(/.test(src)).toBe(true);
  });
});
