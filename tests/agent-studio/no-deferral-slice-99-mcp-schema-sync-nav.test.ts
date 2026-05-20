/**
 * No-Deferral continuation-22 slice 99 — MCP Schema Sync admin
 * nav-surface source-scan lockstep. Per continuation-10 completion-
 * audit lesson #1, asserts all 7 nav-surface items wired.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("slice 99 — MCP Schema Sync nav surface", () => {
  it("Page file exists at the expected path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "client/src/modules/agent-studio/pages/McpSchemaSyncPage.tsx",
        ),
      ),
    ).toBe(true);
  });

  describe("AgentStudioSidebar.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
    );

    it('includes "mcp-schema-sync" in the AgentStudioView union', () => {
      expect(/\|\s*"mcp-schema-sync"/.test(src)).toBe(true);
    });

    it("MCP Schema sidebar group has a Schema Sync entry with Webhook icon", () => {
      const block = src.match(/label:\s*"MCP Schema"[\s\S]+?\]/);
      expect(block).not.toBeNull();
      const body = block?.[0] ?? "";
      expect(
        /key:\s*"mcp-schema-sync",\s*label:\s*"Schema Sync",\s*icon:\s*Webhook/.test(
          body,
        ),
      ).toBe(true);
    });
  });

  describe("AgentStudioShell.tsx", () => {
    const src = read(
      "client/src/modules/agent-studio/components/AgentStudioShell.tsx",
    );

    it("lazy-imports McpSchemaSyncPage", () => {
      expect(
        /const McpSchemaSyncPage = lazy\([\s\S]+?McpSchemaSyncPage[\s\S]+?\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("path resolver maps /agent-studio/mcp-schema-sync → view", () => {
      expect(
        /path\.startsWith\("\/agent-studio\/mcp-schema-sync"\)[\s\S]+?view:\s*"mcp-schema-sync"/.test(
          src,
        ),
      ).toBe(true);
    });

    it("nav-key dispatcher navigates to the path on key match", () => {
      expect(
        /key === "mcp-schema-sync"[\s\S]+?navigate\("\/agent-studio\/mcp-schema-sync"\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("view switch has a case rendering McpSchemaSyncPage", () => {
      expect(
        /case\s+"mcp-schema-sync":\s*\n?\s*return\s+<McpSchemaSyncPage\s*\/>/.test(
          src,
        ),
      ).toBe(true);
    });

    it("no `as any` casts on mcp-schema-sync sites", () => {
      expect(/"mcp-schema-sync"\s+as\s+any/.test(src)).toBe(false);
    });
  });
});
