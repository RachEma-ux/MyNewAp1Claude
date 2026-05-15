/**
 * Active regions topology aggregate — PR-V1-215.
 *
 * Surfaces total + primary count + neo4j-coverage split above
 * the active regions table. Primary count is the only one that
 * gets a misconfiguration-aware highlight: 1 → healthy, 0 →
 * destructive (no primary), >1 → amber (multi-primary; usually
 * a config error in single-primary deployments).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-215 — active regions topology aggregate", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/RegionAdminPanel.tsx",
  );

  it("renders aggregate line with testid + 3 derived counts", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain('data-testid="region-active-aggregate-summary"');
    expect(/\(r\)\s*=>\s*r\.isPrimary/.test(src)).toBe(true);
    expect(/\(r\)\s*=>\s*r\.neo4jUri/.test(src)).toBe(true);
  });

  it("primary count gets a 3-branch misconfiguration-aware highlight", () => {
    const src = readFileSync(panel, "utf8");
    expect(
      /primaryCount\s*===\s*1\s*\?\s*""[\s\S]{0,200}primaryCount\s*===\s*0\s*\?\s*"text-destructive"[\s\S]{0,200}"text-amber-600 dark:text-amber-400"/.test(
        src,
      ),
    ).toBe(true);
  });

  it("render-gated on regionsQ.data.length > 0", () => {
    const src = readFileSync(panel, "utf8");
    expect(/regionsQ\.data\s*&&\s*regionsQ\.data\.length\s*>\s*0/.test(src)).toBe(
      true,
    );
  });
});
