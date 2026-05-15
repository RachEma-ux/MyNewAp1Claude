/**
 * Extensions per-lane breakdown — PR-V1-217.
 *
 * Each extension can hook multiple capability lanes, so the
 * per-lane counts can sum to more than the total extension count.
 * Closed taxonomy: `EXTENSION_CAPABILITY_LANES` =
 * retrieve / assemble / compose / tool.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-217 — extensions per-lane breakdown", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/ExtensionsAdminPanel.tsx",
  );
  const contracts = resolve(
    __dirname,
    "../../server/agent-studio/services/extensions/contracts.ts",
  );

  it("renders per-lane breakdown line with testid + 4 closed-taxonomy counts", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      'data-testid="extensions-lanes-aggregate-summary"',
    );
    expect(src).toContain("retrieve: 0");
    expect(src).toContain("assemble: 0");
    expect(src).toContain("compose: 0");
    expect(src).toContain("tool: 0");
    // Nested loop: per-extension → per-lane increment with
    // in-taxonomy guard so future server-side additions don't
    // silently get missed.
    expect(/if\s*\(\s*lane\s+in\s+laneCounts\s*\)/.test(src)).toBe(true);
  });

  it("contract anchor: EXTENSION_CAPABILITY_LANES still matches the 4 names", () => {
    const src = readFileSync(contracts, "utf8");
    expect(/"retrieve"/.test(src)).toBe(true);
    expect(/"assemble"/.test(src)).toBe(true);
    expect(/"compose"/.test(src)).toBe(true);
    expect(/"tool"/.test(src)).toBe(true);
  });
});
