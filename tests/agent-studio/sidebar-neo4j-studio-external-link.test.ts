/**
 * Source-scan integrity test for the Neo4j Studio sidebar link.
 *
 * Phase: external-link sidebar primitive. The Agent Studio sidebar
 * historically only dispatched internal AgentStudioView keys; this
 * test guards the new `externalUrl` extension and the specific
 * Neo4j Studio entry.
 *
 * If the entry is renamed or the URL fallback drifts, this test
 * fails loud so future authors see the implicit contract before
 * landing the rename.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("Neo4j Studio sidebar external link", () => {
  const src = read(
    "client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
  );

  describe("type extension", () => {
    it("SidebarItem interface allows external:<slug> keys", () => {
      expect(/key:\s*AgentStudioView\s*\|\s*`external:\$\{string\}`/.test(src)).toBe(
        true,
      );
    });

    it("SidebarItem interface declares optional externalUrl", () => {
      expect(/externalUrl\?:\s*string;/.test(src)).toBe(true);
    });
  });

  describe("Neo4j Studio entry", () => {
    it("uses the external:neo4j-studio key", () => {
      expect(/key:\s*"external:neo4j-studio",/.test(src)).toBe(true);
    });

    it("uses Database icon", () => {
      const block = src.match(/key:\s*"external:neo4j-studio"[\s\S]{0,200}/);
      expect(block).not.toBeNull();
      expect(/icon:\s*Database/.test(block?.[0] ?? "")).toBe(true);
    });

    it("falls back to http://localhost:7474/browser/ when VITE_NEO4J_BROWSER_URL unset", () => {
      expect(/"http:\/\/localhost:7474\/browser\/"/.test(src)).toBe(true);
    });

    it("respects VITE_NEO4J_BROWSER_URL env override", () => {
      expect(/VITE_NEO4J_BROWSER_URL/.test(src)).toBe(true);
    });

    it("sits under the Graph Utilities group", () => {
      const block = src.match(/label:\s*"Graph Utilities"[\s\S]+?\]/);
      expect(block).not.toBeNull();
      expect(/external:neo4j-studio/.test(block?.[0] ?? "")).toBe(true);
    });
  });

  describe("click handler", () => {
    it("opens externalUrl via window.open with _blank target", () => {
      expect(
        /window\.open\(\s*externalUrl,\s*"_blank",\s*"noopener,noreferrer"\s*\)/.test(
          src,
        ),
      ).toBe(true);
    });

    it("returns early without calling onNavigate when externalUrl is set", () => {
      expect(
        /if\s*\(\s*externalUrl\s*\)\s*\{[\s\S]+?window\.open[\s\S]+?return;\s*\}/.test(
          src,
        ),
      ).toBe(true);
    });

    it("preserves the internal navigation path for non-external items", () => {
      expect(/onNavigate\(key\s+as\s+AgentStudioView\)/.test(src)).toBe(true);
    });

    it("propagates externalUrl into the data-external-url attribute for testing", () => {
      expect(/data-external-url=\{externalUrl\s*\?\?\s*undefined\}/.test(src)).toBe(
        true,
      );
    });
  });
});
