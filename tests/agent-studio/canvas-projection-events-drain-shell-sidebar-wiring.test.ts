/**
 * CanvasProjectionEventsDrainPage Shell + Sidebar wiring
 * source-scan — V1+ 17-γ slice (PR-V1-86).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("AgentStudioShell — canvas-projection-events-drain wiring", () => {
  const file = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/AgentStudioShell.tsx",
  );
  const src = readFileSync(file, "utf8");

  it("declares the lazy CanvasProjectionEventsDrainPage import", () => {
    expect(
      /const\s+CanvasProjectionEventsDrainPage\s*=\s*lazy\([\s\S]{0,200}?import\(\s*["']\.\.\/pages\/CanvasProjectionEventsDrainPage["']\s*\)/.test(
        src,
      ),
    ).toBe(true);
  });

  it("URL parser matches /agent-studio/canvas-projection-events-drain → view='canvas-projection-events-drain'", () => {
    expect(
      /path\.startsWith\(\s*["']\/agent-studio\/canvas-projection-events-drain["']\s*\)/.test(
        src,
      ),
    ).toBe(true);
    expect(
      /view:\s*["']canvas-projection-events-drain["']/.test(src),
    ).toBe(true);
  });

  it("global-view switch renders <CanvasProjectionEventsDrainPage /> for the case", () => {
    expect(
      /case\s+["']canvas-projection-events-drain["']\s+as\s+any\s*:\s*\n\s*return\s+<CanvasProjectionEventsDrainPage\s*\/>/.test(
        src,
      ),
    ).toBe(true);
  });

  it("handleNavigate routes the key to the URL", () => {
    expect(
      /["']canvas-projection-events-drain["'][\s\S]{0,200}navigate\(\s*["']\/agent-studio\/canvas-projection-events-drain["']\s*\)/.test(
        src,
      ),
    ).toBe(true);
  });
});

describe("AgentStudioSidebar — canvas-projection-events-drain wiring", () => {
  const file = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
  );
  const src = readFileSync(file, "utf8");

  it("adds 'canvas-projection-events-drain' to the AgentStudioView union", () => {
    expect(
      /export\s+type\s+AgentStudioView\s*=[\s\S]*?\|\s*["']canvas-projection-events-drain["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("Canvas SectionGroup contains the projection-drain entry with the Activity icon", () => {
    expect(
      /label:\s*["']Canvas["'][\s\S]{0,400}key:\s*["']canvas-projection-events-drain["'][\s\S]{0,80}icon:\s*Activity/.test(
        src,
      ),
    ).toBe(true);
  });
});
