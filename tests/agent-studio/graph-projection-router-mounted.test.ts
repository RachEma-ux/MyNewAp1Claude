// graphProjectionRouter — mount + procedure integrity.
//
// Strict-audit item #9 partial closure (2026-05-13). Sister of
// promotion-router-mounted.test.ts. Locks two invariants:
//
//   1. graphProjectionRouter is imported and mounted on
//      agentStudioRouter as `graphProjection: graphProjectionRouter`.
//   2. `getDriftCronStatus` is declared inside the router body.
//
// Source-string scan rather than runtime import to avoid pulling
// the heavy tRPC tree into the test environment.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");
const AGENT_STUDIO_ROUTER_PATH = join(
  REPO_ROOT,
  "server/agent-studio/api/router.ts",
);
const GRAPH_PROJECTION_ROUTER_PATH = join(
  REPO_ROOT,
  "server/agent-studio/services/graph/projection/router.ts",
);

describe("agent-studio top-level router — graphProjection mount integrity", () => {
  const agentStudioSrc = readFileSync(AGENT_STUDIO_ROUTER_PATH, "utf8");

  it("imports graphProjectionRouter from services/graph/projection/router", () => {
    expect(agentStudioSrc).toMatch(
      /import\s*\{\s*graphProjectionRouter\s*\}\s*from\s*["']\.\.\/services\/graph\/projection\/router["']/,
    );
  });

  it("mounts `graphProjection: graphProjectionRouter` on agentStudioRouter", () => {
    expect(agentStudioSrc).toMatch(
      /\bgraphProjection\s*:\s*graphProjectionRouter\b/,
    );
  });

  it("the mount sits inside the last router({...}) block (the top-level agentStudioRouter)", () => {
    const lastRouterIdx = agentStudioSrc.lastIndexOf("router({");
    expect(lastRouterIdx).toBeGreaterThanOrEqual(0);
    const tail = agentStudioSrc.slice(lastRouterIdx);
    expect(tail).toMatch(/\bgraphProjection\s*:\s*graphProjectionRouter\b/);
  });
});

describe("graphProjectionRouter — declared procedures", () => {
  const routerSrc = readFileSync(GRAPH_PROJECTION_ROUTER_PATH, "utf8");

  it("declares getDriftCronStatus", () => {
    expect(routerSrc).toMatch(/\bgetDriftCronStatus\s*:/);
  });

  it("uses adminProcedure for the status query (auth-gated)", () => {
    expect(routerSrc).toMatch(/adminProcedure\.query/);
  });

  it("imports getProjectionDriftCronStatus from the drift-cron module", () => {
    expect(routerSrc).toMatch(
      /import\s*\{\s*getProjectionDriftCronStatus\s*\}\s*from\s*["']\.\/drift-cron(?:\.js)?["']/,
    );
  });
});

describe("boot.ts — drift cron ensureStarted wired", () => {
  const BOOT_PATH = join(REPO_ROOT, "server/agent-studio/boot.ts");
  const bootSrc = readFileSync(BOOT_PATH, "utf8");

  it("imports ensureProjectionDriftCronStarted", () => {
    expect(bootSrc).toMatch(/ensureProjectionDriftCronStarted/);
  });

  it("calls ensureProjectionDriftCronStarted()", () => {
    expect(bootSrc).toMatch(/ensureProjectionDriftCronStarted\(\)/);
  });
});
