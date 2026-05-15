/**
 * Canvas operator browser page mount source-scan — V1+ Phase 17
 * closure. PR-V1-171.
 *
 * Verifies the page + panel exist, the panel queries the 3 canvas
 * tRPC reads, and AgentStudioShell wires the route.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("Phase 17 closure — canvas operator page mount", () => {
  const pageFile = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/pages/CanvasOperatorPage.tsx",
  );
  const panelFile = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/CanvasOperatorPanel.tsx",
  );
  const shellFile = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/AgentStudioShell.tsx",
  );

  it("page mounts the panel + accepts optional initialVaultId (default 1)", () => {
    const src = readFileSync(pageFile, "utf8");
    expect(src).toContain(
      'import { CanvasOperatorPanel } from "../components/CanvasOperatorPanel"',
    );
    expect(
      /<CanvasOperatorPanel\s+initialVaultId=\{initialVaultId\}\s*\/>/.test(src),
    ).toBe(true);
    expect(/initialVaultId\s*=\s*1\s*\}/.test(src)).toBe(true);
  });

  it("panel queries the 3 canvas tRPC reads", () => {
    const src = readFileSync(panelFile, "utf8");
    expect(src).toContain("trpc.agentStudio.canvas.listByVault.useQuery");
    expect(src).toContain("trpc.agentStudio.canvas.getSnapshot.useQuery");
    expect(src).toContain(
      "trpc.agentStudio.canvas.listNoteReferences.useQuery",
    );
  });

  it("panel guards snapshot + refs queries on selectedCanvasId via `enabled`", () => {
    const src = readFileSync(panelFile, "utf8");
    expect(/enabled:\s*selectedCanvasId\s*!=\s*null/.test(src)).toBe(true);
  });

  it("panel renders inspect button that selects the canvas id", () => {
    const src = readFileSync(panelFile, "utf8");
    expect(/onClick=\{\(\)\s*=>\s*setSelectedCanvasId\(c\.id\)\}/.test(src)).toBe(
      true,
    );
  });

  it("AgentStudioShell lazy-imports the page", () => {
    const src = readFileSync(shellFile, "utf8");
    expect(
      /const\s+CanvasOperatorPage\s*=\s*lazy\(\s*\(\)\s*=>\s*import\("\.\.\/pages\/CanvasOperatorPage"\)\)/.test(
        src,
      ),
    ).toBe(true);
  });

  it("AgentStudioShell registers the /canvas-operator route + dispatch", () => {
    const src = readFileSync(shellFile, "utf8");
    expect(src).toContain('path.startsWith("/agent-studio/canvas-operator")');
    expect(src).toContain('view: "canvas-operator" as any');
    expect(
      /case\s+"canvas-operator"\s+as\s+any:\s*\n\s*return\s+<CanvasOperatorPage\s*\/>/.test(
        src,
      ),
    ).toBe(true);
  });
});
