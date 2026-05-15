/**
 * Extensions never-invoked count — PR-V1-222.
 *
 * Symmetric with publish-targets never-published (#972). An
 * approved extension that has never been invoked is either
 * misconfigured, capability-gated out at every call site, or
 * freshly installed. The
 * `workspaceInvocationSummaries.totalInvocations` field already
 * carries that fact — this slice rolls it up to a single inline
 * count.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-222 — extensions never-invoked count", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/ExtensionsAdminPanel.tsx",
  );
  const manifest = resolve(
    __dirname,
    "../../server/agent-studio/services/extensions/manifest.ts",
  );

  it("renders count with testid + predicate using summaryByExtId", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain('data-testid="extensions-never-invoked-count"');
    expect(/summaryByExtId\.get\(ext\.id\)/.test(src)).toBe(true);
    expect(/totalInvocations\s*===\s*0/.test(src)).toBe(true);
  });

  it("amber highlight when neverInvoked > 0", () => {
    const src = readFileSync(panel, "utf8");
    expect(/neverInvoked\s*>\s*0[\s\S]{0,80}text-amber-600/.test(src)).toBe(
      true,
    );
  });

  it("render gate requires listQ.data + listQ.data.length > 0 + summariesQ.data", () => {
    const src = readFileSync(panel, "utf8");
    expect(
      /listQ\.data\s*&&\s*listQ\.data\.length\s*>\s*0\s*&&\s*summariesQ\.data/.test(
        src,
      ),
    ).toBe(true);
  });

  it("contract anchor: ExtensionInvocationSummary still carries totalInvocations: number", () => {
    const src = readFileSync(manifest, "utf8");
    expect(/readonly\s+totalInvocations:\s*number/.test(src)).toBe(true);
  });
});
