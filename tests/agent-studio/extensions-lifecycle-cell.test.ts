/**
 * Extensions lifecycle cell — PR-V1-198.
 *
 * Source-scan that the previously approvedAt-only column now
 * surfaces `installedAt` / `approvedAt` / `disabledAt` together:
 * inline cell shows the most-recently-relevant timestamp
 * (disabledAt when status is disabled/revoked, otherwise
 * approvedAt) and the tooltip carries the full lifecycle.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-198 — extensions lifecycle cell", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/ExtensionsAdminPanel.tsx",
  );

  it("column header renamed to Lifecycle with a multi-line tooltip", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(">Lifecycle<");
    // Header tooltip explains both inline-value and lifecycle-tooltip
    // behavior.
    expect(
      /title="approvedAt \(or disabledAt when status=disabled\/revoked\)/.test(
        src,
      ),
    ).toBe(true);
  });

  it("inline cell uses disabledAt when disabled or revoked; approvedAt otherwise", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain("extension-row-approved-");
    // Cell-value branch on closed taxonomy.
    expect(
      /ext\.governanceStatus\s*===\s*"disabled"\s*\|\|\s*ext\.governanceStatus\s*===\s*"revoked"\s*\?\s*fmtTs\(ext\.disabledAt\)\s*:\s*fmtTs\(ext\.approvedAt\)/.test(
        src,
      ),
    ).toBe(true);
    // Tooltip carries the full three-timestamp lifecycle.
    expect(
      /installed \$\{fmtTs\(ext\.installedAt\)\}\s*\/\s*approved \$\{fmtTs\(ext\.approvedAt\)\}\s*\/\s*disabled \$\{fmtTs\(ext\.disabledAt\)\}/.test(
        src,
      ),
    ).toBe(true);
  });
});
