/**
 * Phase 11.5 — graph change proposal adapter boot wiring source-scan.
 *
 * Verifies `bootAgentStudio()` injects `AsdbGraphChangeProposalAdapter`
 * into the graph-change-proposals router via
 * `_setGraphChangeProposalAdapter()`. Source-scan only — does not
 * actually boot. Runtime behavior of the adapter lives in
 * `graph-change-proposal-adapter-asdb.test.ts`; the lifecycle in
 * `graph-change-proposal-lifecycle.test.ts`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();

describe("Graph change proposal adapter boot wiring", () => {
  const bootSrc = readFileSync(
    join(REPO_ROOT, "server/agent-studio/boot.ts"),
    "utf8",
  );

  it("boot.ts imports AsdbGraphChangeProposalAdapter dynamically", () => {
    expect(bootSrc).toMatch(
      /import\(\s*["']\.\/services\/graph-change-proposals\/adapter-asdb["']\s*\)/,
    );
    expect(bootSrc).toMatch(/AsdbGraphChangeProposalAdapter/);
  });

  it("boot.ts calls _setGraphChangeProposalAdapter", () => {
    expect(bootSrc).toMatch(/_setGraphChangeProposalAdapter/);
    expect(bootSrc).toMatch(
      /_setGraphChangeProposalAdapter\(\s*\n?\s*new\s+AsdbGraphChangeProposalAdapter/,
    );
  });

  it("boot.ts checks getAsDb() before wiring", () => {
    // Otherwise we would NPE at adapter construction when ASDB is missing.
    const wiringIdx = bootSrc.indexOf("_setGraphChangeProposalAdapter");
    const dbCheckIdx = bootSrc.lastIndexOf("getAsDb()", wiringIdx);
    expect(dbCheckIdx).toBeGreaterThan(-1);
    expect(dbCheckIdx).toBeLessThan(wiringIdx);
  });

  it("graph change proposal wiring runs after promotion adapter (Phase 11) and before scheduler start", () => {
    const promoIdx = bootSrc.indexOf("_setPromotionAdapter");
    const proposalIdx = bootSrc.indexOf("_setGraphChangeProposalAdapter");
    const schedIdx = bootSrc.indexOf('import("./services/scheduler")');
    expect(promoIdx).toBeGreaterThan(-1);
    expect(proposalIdx).toBeGreaterThan(promoIdx);
    expect(proposalIdx).toBeLessThan(schedIdx);
  });
});
