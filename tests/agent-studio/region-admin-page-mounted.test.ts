/**
 * Region Admin page mount source-scan — V2 Phase MR-1 Phase-2 ninth
 * slice. PR-V1-157.
 *
 * Source-scan: verifies the page + panel exist, the panel reads from
 * the new tRPC procedures, AgentStudioShell lazy-imports the page,
 * the route pattern is registered, and the dispatch returns the page
 * component for the "region-admin" view key.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("MR-1 Phase-2 — region admin page mount", () => {
  const pageFile = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/pages/RegionAdminPage.tsx",
  );
  const panelFile = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/RegionAdminPanel.tsx",
  );
  const shellFile = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/AgentStudioShell.tsx",
  );

  it("page file exists + mounts the panel", () => {
    const src = readFileSync(pageFile, "utf8");
    expect(src).toContain('import { RegionAdminPanel } from "../components/RegionAdminPanel"');
    expect(/<RegionAdminPanel\s*\/>/.test(src)).toBe(true);
    expect(src).toContain("Region admin");
  });

  it("panel queries the 4 region tRPC procedures", () => {
    const src = readFileSync(panelFile, "utf8");
    expect(src).toContain(
      "trpc.agentStudio.region.getCacheStatus.useQuery",
    );
    expect(src).toContain(
      "trpc.agentStudio.region.getRewarmCronStatus.useQuery",
    );
    expect(src).toContain(
      "trpc.agentStudio.region.listActiveRegions.useQuery",
    );
    expect(src).toContain(
      "trpc.agentStudio.region.listPins.useQuery",
    );
  });

  it("panel masks postgres URI credentials", () => {
    const src = readFileSync(panelFile, "utf8");
    // Same masking pattern used by region-service.ts logging.
    expect(/replace\(\/:\(\[\^:@\]\+\)@\/, ":\*+@"\)/.test(src)).toBe(true);
  });

  it("AgentStudioShell lazy-imports the page", () => {
    const src = readFileSync(shellFile, "utf8");
    expect(
      /const\s+RegionAdminPage\s*=\s*lazy\(\(\)\s*=>\s*import\("\.\.\/pages\/RegionAdminPage"\)\)/.test(
        src,
      ),
    ).toBe(true);
  });

  it("AgentStudioShell registers the /region-admin route + dispatch", () => {
    const src = readFileSync(shellFile, "utf8");
    expect(src).toContain('path.startsWith("/agent-studio/region-admin")');
    expect(src).toContain('view: "region-admin" as any');
    expect(/case\s+"region-admin"\s+as\s+any:\s*\n\s*return\s+<RegionAdminPage\s*\/>/.test(src)).toBe(
      true,
    );
  });
});
