/**
 * Region active-regions per-row settings drill-down — PR-V1-205.
 *
 * Symmetric with extensions config drill-down (#954) and
 * publish-targets config drill-down (#944). `RegionRecord.settings`
 * JSON is already on the listActiveRegions payload but unrendered.
 * Plus surfaces the `credentialBindingId` field that was also
 * available but unrendered.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-205 — region settings drill-down + credentialBindingId column", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/RegionAdminPanel.tsx",
  );

  it("renders new credentialBindingId column", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(">Cred binding<");
    expect(src).toContain("region-row-cred-binding-");
    expect(/r\.credentialBindingId\s*\?\?\s*"—"/.test(src)).toBe(true);
  });

  it("renders view/hide settings toggle + expanded JSON row", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain("region-row-settings-toggle-");
    expect(src).toContain("region-row-settings-row-");
    expect(
      /isSettingsExpanded\s*\?\s*"hide settings"\s*:\s*"view settings"/.test(
        src,
      ),
    ).toBe(true);
    expect(
      /JSON\.stringify\(\s*r\.settings\s*\?\?\s*\{\},\s*null,\s*2\s*\)/.test(
        src,
      ),
    ).toBe(true);
    // colSpan=7 matches the new column count (Key/Name/Primary/
    // Postgres URI/Neo4j URI/Cred binding/Actions).
    expect(/colSpan=\{7\}/.test(src)).toBe(true);
  });

  it("regions row wrapped in React.Fragment for keyed-list invariant", () => {
    const src = readFileSync(panel, "utf8");
    expect(/<React\.Fragment\s+key=\{r\.regionKey\}>/.test(src)).toBe(true);
  });
});
