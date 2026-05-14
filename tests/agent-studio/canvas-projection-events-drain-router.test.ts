/**
 * 17-γ canvas projection events drain admin router tests
 * (PR-V1-62).
 *
 * Source-scan that the router module is well-formed + mounted in
 * the main agent-studio router. Mirrors the J-1-β graph-health
 * router shape (#758).
 *
 * Does NOT exercise the tRPC procedure end-to-end (that requires
 * the harness setup); the runtime behavior is already covered by
 * #810's tick-wrapper test suite. This file only enforces the
 * mount + shape contract.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const routerFile = resolve(
  __dirname,
  "../../server/agent-studio/services/canvas/projection-events-drain-router.ts",
);
const mainRouterFile = resolve(
  __dirname,
  "../../server/agent-studio/api/router.ts",
);

const routerSrc = readFileSync(routerFile, "utf8");
const mainRouterSrc = readFileSync(mainRouterFile, "utf8");

describe("canvasProjectionEventsDrainRouter — module shape", () => {
  it("exports canvasProjectionEventsDrainRouter", () => {
    expect(
      /export\s+const\s+canvasProjectionEventsDrainRouter\s*=\s*router\s*\(/.test(
        routerSrc,
      ),
    ).toBe(true);
  });

  it("declares getDrainStatus as an adminProcedure", () => {
    expect(
      /getDrainStatus\s*:\s*adminProcedure\s*\.query\s*\(/.test(routerSrc),
    ).toBe(true);
  });

  it("delegates to getCanvasProjectionEventsDrainLastTickResult", () => {
    expect(
      /getCanvasProjectionEventsDrainLastTickResult\s*\(\s*\)/.test(
        routerSrc,
      ),
    ).toBe(true);
  });

  it("imports from the #810 tick module", () => {
    expect(
      /from\s+["']\.\/projection-events-drain-tick(?:\.js)?["']/.test(
        routerSrc,
      ),
    ).toBe(true);
  });
});

describe("canvasProjectionEventsDrainRouter — mount in agent-studio router", () => {
  it("main router imports the drain router", () => {
    expect(
      /import\s*\{\s*canvasProjectionEventsDrainRouter\s*\}\s*from\s+["'][^"']*projection-events-drain-router["']/.test(
        mainRouterSrc,
      ),
    ).toBe(true);
  });

  it("main router mounts canvasProjectionEventsDrain", () => {
    expect(
      /canvasProjectionEventsDrain\s*:\s*canvasProjectionEventsDrainRouter/.test(
        mainRouterSrc,
      ),
    ).toBe(true);
  });
});

describe("canvasProjectionEventsDrainRouter — source-scan boundaries", () => {
  const code = routerSrc
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

  it("is read-only — no mutation procedures", () => {
    expect(/\.mutation\s*\(/.test(code)).toBe(false);
  });
});
