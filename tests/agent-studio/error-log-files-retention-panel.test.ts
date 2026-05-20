/**
 * Source-scan integrity test for the ErrorLogFilesRetentionPanel —
 * operator UI for the universal error event log file retention cron
 * (#1674, follow-on to #1673).
 *
 * Asserts the panel calls the correct tRPC namespace, renders the
 * status + manual sweep cards, and is mounted in GraphHealthAdminPage.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("ErrorLogFilesRetentionPanel", () => {
  it("file exists", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/components/ErrorLogFilesRetentionPanel.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("ErrorLogFilesRetentionPanel.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/ErrorLogFilesRetentionPanel.tsx",
    );

    it("calls clientObservability.getErrorLogFilesRetentionCronStatus", () => {
      expect(
        /trpc\.agentStudio\.clientObservability\.getErrorLogFilesRetentionCronStatus\.useQuery/.test(
          src,
        ),
      ).toBe(true);
    });

    it("calls clientObservability.pruneErrorLogFilesRetention mutation", () => {
      expect(
        /trpc\.agentStudio\.clientObservability\.pruneErrorLogFilesRetention\.useMutation/.test(
          src,
        ),
      ).toBe(true);
    });

    it("polls cron status every 30s (refetchInterval 30_000)", () => {
      expect(/refetchInterval:\s*30_000/.test(src)).toBe(true);
    });

    it("renders 3 stat cards (last run / files deleted / bytes freed)", () => {
      expect(/data-testid="elf-last-run"/.test(src)).toBe(true);
      expect(/data-testid="elf-deleted"/.test(src)).toBe(true);
      expect(/data-testid="elf-bytes-freed"/.test(src)).toBe(true);
    });

    it("confirms before running the sweep", () => {
      expect(/window\.confirm\(/.test(src)).toBe(true);
    });

    it("formats bytes (B / KB / MB / GB)", () => {
      expect(/function formatBytes/.test(src)).toBe(true);
      expect(/1024 \* 1024/.test(src)).toBe(true);
    });

    it("invalidates / refetches the status query after a manual sweep", () => {
      expect(/statusQuery\.refetch\(\)/.test(src)).toBe(true);
    });

    it("exports ErrorLogFilesRetentionPanel", () => {
      expect(/export function ErrorLogFilesRetentionPanel/.test(src)).toBe(
        true,
      );
    });
  });

  describe("GraphHealthAdminPage.tsx mount", () => {
    const src = read(
      "client/src/modules/agent-studio/pages/GraphHealthAdminPage.tsx",
    );

    it("imports ErrorLogFilesRetentionPanel", () => {
      expect(
        /import\s+\{\s*ErrorLogFilesRetentionPanel\s*\}\s+from/.test(src),
      ).toBe(true);
    });

    it("renders ErrorLogFilesRetentionPanel inside the page", () => {
      expect(/<ErrorLogFilesRetentionPanel\s*\/>/.test(src)).toBe(true);
    });

    it("preserves the existing GraphHealthAdminPanel and GraphProjectionDrainPanel renders", () => {
      expect(/<GraphHealthAdminPanel\s*\/>/.test(src)).toBe(true);
      expect(/<GraphProjectionDrainPanel\s*\/>/.test(src)).toBe(true);
    });
  });
});
