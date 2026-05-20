/**
 * No-Deferral continuation-35 slice 138 — GraphProjectionDrainPanel
 * source-scan lockstep.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("slice 138 — GraphProjectionDrainPanel", () => {
  it("Panel file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/components/GraphProjectionDrainPanel.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("GraphProjectionDrainPanel.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/GraphProjectionDrainPanel.tsx",
    );

    it("calls trpc.agentStudio.graphProjection.getDrainCronStatus", () => {
      expect(
        /trpc\.agentStudio\.graphProjection\.getDrainCronStatus\.useQuery/.test(
          src,
        ),
      ).toBe(true);
    });

    it("calls trpc.agentStudio.graphProjection.runDrainNow", () => {
      expect(
        /trpc\.agentStudio\.graphProjection\.runDrainNow\.useMutation/.test(
          src,
        ),
      ).toBe(true);
    });

    it("invalidates getDrainCronStatus after runDrainNow succeeds", () => {
      expect(
        /utils\.agentStudio\.graphProjection\.getDrainCronStatus\.invalidate/.test(
          src,
        ),
      ).toBe(true);
    });

    it("exports GraphProjectionDrainPanel", () => {
      expect(/export function GraphProjectionDrainPanel/.test(src)).toBe(true);
    });
  });

  describe("GraphHealthAdminPage.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/pages/GraphHealthAdminPage.tsx",
    );

    it("imports GraphProjectionDrainPanel", () => {
      expect(
        /import\s+\{\s*GraphProjectionDrainPanel\s*\}\s+from/.test(src),
      ).toBe(true);
    });

    it("renders GraphProjectionDrainPanel inside the page", () => {
      expect(/<GraphProjectionDrainPanel\s*\/>/.test(src)).toBe(true);
    });

    it("preserves the existing GraphHealthAdminPanel render", () => {
      expect(/<GraphHealthAdminPanel\s*\/>/.test(src)).toBe(true);
    });
  });
});
