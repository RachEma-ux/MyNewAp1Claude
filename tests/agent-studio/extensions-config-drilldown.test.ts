/**
 * Extensions per-row config drill-down — PR-V1-203.
 *
 * Source-scan that the extensions panel adds a `view config` /
 * `hide config` toggle next to the per-row uninstall button.
 * `ext.config` is already on `ExtensionRecord`, so no new tRPC is
 * needed — just inline expansion rendered as JSON.stringify.
 * Symmetric with publish-targets config drill-down (#944).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-203 — extensions per-row config drill-down", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/ExtensionsAdminPanel.tsx",
  );

  it("renders a view/hide config toggle next to the uninstall button", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain("extension-row-config-toggle-");
    expect(
      /isConfigExpanded\s*\?\s*"hide config"\s*:\s*"view config"/.test(src),
    ).toBe(true);
    expect(/setExpandedConfigId\(\s*isConfigExpanded\s*\?\s*null\s*:\s*ext\.id\s*\)/.test(src)).toBe(
      true,
    );
  });

  it("expanded row renders the ext.config JSON inline (no extra fetch)", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain("extension-row-config-row-");
    // Uses ext.config directly (already on the listExtensionsByWorkspace
    // payload), not a separate query.
    expect(
      /JSON\.stringify\(\s*ext\.config\s*\?\?\s*\{\},\s*null,\s*2\s*\)/.test(
        src,
      ),
    ).toBe(true);
    // colSpan=11 matches the current column count (Key/Name/Version/
    // Status/Lanes/Tools/Lifecycle/Actors/Invocations/Last invoked/
    // Actions).
    expect(/colSpan=\{11\}/.test(src)).toBe(true);
  });

  it("row wrapped in React.Fragment for the keyed-list invariant", () => {
    const src = readFileSync(panel, "utf8");
    expect(/<React\.Fragment\s+key=\{ext\.id\}>/.test(src)).toBe(true);
  });
});
