/**
 * Sidebar admin nav additions — PR-V1-177.
 *
 * The 3 admin pages shipped this session (region admin #908,
 * extensions admin #914, canvas operator #922) all had routes
 * registered in AgentStudioShell but no sidebar entry. Operators
 * had to type the URL by hand. This slice adds them to the
 * sidebar `HOME_GROUPS` and wires their click handlers.
 *
 * Source-scan only — sidebar render is exercised by existing
 * snapshot/integration coverage.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-177 — sidebar admin nav entries", () => {
  const sidebar = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
  );
  const shell = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/AgentStudioShell.tsx",
  );

  it("AgentStudioView union extends with the 3 new keys", () => {
    const src = readFileSync(sidebar, "utf8");
    expect(src).toContain('| "region-admin"');
    expect(src).toContain('| "extensions-admin"');
    expect(src).toContain('| "canvas-operator"');
  });

  it("imports Globe + LayoutGrid icons", () => {
    const src = readFileSync(sidebar, "utf8");
    expect(src).toContain("Globe,");
    expect(src).toContain("LayoutGrid,");
  });

  it("HOME_GROUPS contains an Extensions group with extensions-admin item", () => {
    const src = readFileSync(sidebar, "utf8");
    expect(src).toContain('label: "Extensions"');
    expect(/key:\s*"extensions-admin"/.test(src)).toBe(true);
  });

  it("HOME_GROUPS contains a Multi-region group with region-admin item", () => {
    const src = readFileSync(sidebar, "utf8");
    expect(src).toContain('label: "Multi-region"');
    expect(/key:\s*"region-admin"/.test(src)).toBe(true);
  });

  it("Canvas group adds the operator-browser item alongside projection drain", () => {
    const src = readFileSync(sidebar, "utf8");
    expect(/key:\s*"canvas-operator"/.test(src)).toBe(true);
    expect(/key:\s*"canvas-projection-events-drain"/.test(src)).toBe(true);
  });

  it("Shell maps each new key to its absolute admin URL", () => {
    const src = readFileSync(shell, "utf8");
    expect(
      /\(key as string\)\s*===\s*"region-admin"[\s\S]{0,150}navigate\("\/agent-studio\/region-admin"\)/.test(
        src,
      ),
    ).toBe(true);
    expect(
      /\(key as string\)\s*===\s*"extensions-admin"[\s\S]{0,150}navigate\("\/agent-studio\/extensions-admin"\)/.test(
        src,
      ),
    ).toBe(true);
    expect(
      /\(key as string\)\s*===\s*"canvas-operator"[\s\S]{0,150}navigate\("\/agent-studio\/canvas-operator"\)/.test(
        src,
      ),
    ).toBe(true);
  });
});
