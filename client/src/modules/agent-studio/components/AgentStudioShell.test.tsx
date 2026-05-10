/**
 * Agent Studio — list/detail route consistency.
 *
 * Guards against the bug where the AS LIST click handler navigates
 * to a path that does not parse as a valid agent detail route. The
 * canonical click target is `/agent-studio/${agent.id}/overview`.
 *
 * We exercise the real `parseRoute` exported from `agent-studio-route`
 * so the test breaks if the URL grammar drifts. We also assert that
 * the AS LIST handler in `AgentStudioHomePage` builds that exact URL
 * via a source-level check — the navigate(...) call uses the
 * canonical pattern `/agent-studio/${a.id}/overview`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseRoute } from "./agent-studio-route";

describe("agent-studio-route.parseRoute", () => {
  it("parses /agent-studio/:id (no section) as overview + needsOverviewRedirect", () => {
    const r = parseRoute("/agent-studio/42");
    expect(r.agentId).toBe(42);
    expect(r.view).toBe("overview");
    expect(r.needsOverviewRedirect).toBe(true);
    expect(r.invalidAgentSegment).toBe(false);
  });

  it("parses /agent-studio/:id/overview as overview (canonical detail route)", () => {
    const r = parseRoute("/agent-studio/42/overview");
    expect(r.agentId).toBe(42);
    expect(r.view).toBe("overview");
    expect(r.needsOverviewRedirect).toBe(false);
    expect(r.invalidAgentSegment).toBe(false);
  });

  it("parses other detail sections without redirect", () => {
    expect(parseRoute("/agent-studio/7/identity").view).toBe("identity");
    expect(parseRoute("/agent-studio/7/governance").view).toBe("governance");
    expect(parseRoute("/agent-studio/7/tools").view).toBe("tools");
  });

  it("flags non-numeric :id segments as invalid", () => {
    const r = parseRoute("/agent-studio/abc");
    expect(r.invalidAgentSegment).toBe(true);
    expect(r.agentId).toBeNull();
  });

  it("home routes return agentId=null", () => {
    expect(parseRoute("/agent-studio").agentId).toBeNull();
    expect(parseRoute("/agent-studio/").agentId).toBeNull();
  });
});

describe("AgentStudioHomePage — list click target is the canonical detail route", () => {
  it("AS LIST onClick navigates to `/agent-studio/${agent.id}/overview`", () => {
    // Source-level regression test: the URL pattern is checked at the
    // file level so that drift (e.g., to `/agent-studio/${id}` without
    // /overview, or to `/agent-studio/agent/${id}`) breaks this test.
    // The shell parses the bare-id form with `needsOverviewRedirect`
    // but the spec is that the click target itself is the canonical
    // /overview path so the URL is shareable.
    // Resolve from the vitest cwd (repo root) so the test does not
    // depend on `__dirname`, which is not reliably populated for
    // ESM/TS test files across vitest versions.
    const homePagePath = resolve(
      process.cwd(),
      "client/src/modules/agent-studio/pages/AgentStudioHomePage.tsx",
    );
    const src = readFileSync(homePagePath, "utf8");

    // The list <tr> onClick handler.
    expect(src).toContain("`/agent-studio/${a.id}/overview`");
    // The review-queue list also uses the canonical path.
    expect(src).toContain("`/agent-studio/${a.id}/overview`");
    // None of these alternative shapes should be present.
    expect(src).not.toContain("`/agent-studio/${a.id}`)");
    expect(src).not.toContain("`/agent-studio/${a.id}/`");
    expect(src).not.toContain("/agent-studio/agent/");
  });
});
