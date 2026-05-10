/**
 * Phase 11 — promotion adapter boot wiring source-scan.
 *
 * Verifies `bootAgentStudio()` injects `AsdbPromotionAdapter` into the
 * promotion router via `_setPromotionAdapter()`. Source-scan only — does
 * not actually boot. Runtime behavior of the adapter lives in
 * `promotion-adapter-asdb.test.ts`; the lifecycle in
 * `promotion-lifecycle.test.ts`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();

describe("Promotion adapter boot wiring", () => {
  const bootSrc = readFileSync(
    join(REPO_ROOT, "server/agent-studio/boot.ts"),
    "utf8",
  );

  it("boot.ts imports AsdbPromotionAdapter dynamically", () => {
    expect(bootSrc).toMatch(
      /import\(\s*["']\.\/services\/promotion\/adapter-asdb["']\s*\)/,
    );
    expect(bootSrc).toMatch(/AsdbPromotionAdapter/);
  });

  it("boot.ts calls _setPromotionAdapter", () => {
    expect(bootSrc).toMatch(/_setPromotionAdapter/);
    expect(bootSrc).toMatch(
      /_setPromotionAdapter\(new\s+AsdbPromotionAdapter/,
    );
  });

  it("boot.ts checks getAsDb() before wiring", () => {
    // Otherwise we would NPE at adapter construction when ASDB is missing.
    const wiringIdx = bootSrc.indexOf("_setPromotionAdapter");
    const dbCheckIdx = bootSrc.lastIndexOf("getAsDb()", wiringIdx);
    expect(dbCheckIdx).toBeGreaterThan(-1);
    expect(dbCheckIdx).toBeLessThan(wiringIdx);
  });

  it("promotion adapter wiring runs after seedAsDb (tables present) and before scheduler start", () => {
    const seedAsDbIdx = bootSrc.indexOf("await seedAsDb()");
    const promoIdx = bootSrc.indexOf("_setPromotionAdapter");
    const schedIdx = bootSrc.indexOf('import("./services/scheduler")');
    expect(seedAsDbIdx).toBeGreaterThan(-1);
    expect(promoIdx).toBeGreaterThan(seedAsDbIdx);
    expect(promoIdx).toBeLessThan(schedIdx);
  });
});
