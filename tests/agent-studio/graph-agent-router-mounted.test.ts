/**
 * Phase 13 §1 — verify `graphAgentRouter` is mounted on the top-level
 * `agentStudio` tRPC tree as `agentStudio.graphAgent.*`.
 *
 * The sub-router lived unmounted from PR-#411-era through Phase 12.5;
 * the doc-block said "Phase 13.5 wires the mount" but nothing ever
 * did. This test locks the mount in source so it can't regress
 * silently.
 *
 * Source-string scan rather than runtime import because importing
 * `server/agent-studio/api/router.ts` transitively pulls in the
 * entire Agent Studio service surface (DB connections, governance
 * loader, etc.) which is heavyweight for what is a one-line
 * structural assertion.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");
const ROUTER_PATH = join(REPO_ROOT, "server/agent-studio/api/router.ts");

describe("agent-studio top-level router — graphAgent mount", () => {
  const src = readFileSync(ROUTER_PATH, "utf8");

  it("imports graphAgentRouter from services/graph-agent/router", () => {
    expect(src).toMatch(
      /import\s*\{\s*graphAgentRouter\s*\}\s*from\s*["']\.\.\/services\/graph-agent\/router["']/,
    );
  });

  it("mounts graphAgent: graphAgentRouter in the appRouter object", () => {
    expect(src).toMatch(/\bgraphAgent\s*:\s*graphAgentRouter\b/);
  });

  it("the mount sits in the last router({...}) call (the appRouter, not a sibling sub-router)", () => {
    // The appRouter is the final top-level `router({...})` in this
    // file — every sub-router above it is a `const xRouter = router(
    // {...})`. Find the last `router({` and assert the mount is in
    // its body.
    const lastRouterIdx = src.lastIndexOf("router({");
    expect(lastRouterIdx).toBeGreaterThanOrEqual(0);
    const tail = src.slice(lastRouterIdx);
    expect(tail).toMatch(/\bgraphAgent\s*:\s*graphAgentRouter\b/);
  });
});
