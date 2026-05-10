/**
 * Phase 12.5 / 22 / 23 — boot wiring source-scan.
 *
 * Verifies `bootAgentStudio()` calls `seedGraphSkillRows()` and that the
 * adapter module imports the underlying seed functions + Drizzle tables
 * for ASDB row upserts. Source-scan only — does not actually boot the
 * module (DB-dependent). Runtime invariants for the seed data live in
 * `graph-skill-seeds.test.ts`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();

describe("Graph Skill row-seed boot wiring", () => {
  const bootSrc = readFileSync(
    join(REPO_ROOT, "server/agent-studio/boot.ts"),
    "utf8",
  );
  const seedSrc = readFileSync(
    join(REPO_ROOT, "server/agent-studio/db/seed-graph-skill-rows.ts"),
    "utf8",
  );

  it("boot.ts imports seedGraphSkillRows", () => {
    expect(bootSrc).toMatch(/seedGraphSkillRows/);
    expect(bootSrc).toMatch(
      /import\(["']\.\/db\/seed-graph-skill-rows["']\)/,
    );
  });

  it("boot.ts calls seedGraphSkillRows in the bootAgentStudio function", () => {
    const fnIdx = bootSrc.indexOf("export async function bootAgentStudio");
    expect(fnIdx).toBeGreaterThan(-1);
    const after = bootSrc.slice(fnIdx);
    expect(after).toMatch(/await\s+seedGraphSkillRows\(\)/);
  });

  it("seed-graph-skill-rows wires the three pure seed modules", () => {
    expect(seedSrc).toMatch(/seedCypherTemplates/);
    expect(seedSrc).toMatch(/seedGraphSkillPacks/);
    expect(seedSrc).toMatch(/seedGoldenQuestionSuites/);
  });

  it("seed-graph-skill-rows targets the expected ASDB tables", () => {
    expect(seedSrc).toMatch(/agsQueryTemplates/);
    expect(seedSrc).toMatch(/agsGraphSkillPacks/);
    expect(seedSrc).toMatch(/agsGoldenQuestionSuites/);
    expect(seedSrc).toMatch(/agsGoldenQuestions/);
  });

  it("seed-graph-skill-rows uses getAsDb (not main DATABASE_URL)", () => {
    expect(seedSrc).toMatch(/getAsDb/);
    expect(seedSrc).not.toMatch(/getDb\(\)/);
  });

  it("seed-graph-skill-rows uses upsert-by-natural-key shape (not unconditional insert)", () => {
    // Each entity type checks for an existing row before inserting/updating.
    expect(seedSrc).toMatch(/templateKey,\s*t\.templateKey/);
    expect(seedSrc).toMatch(/skillKey,\s*p\.skillKey/);
    expect(seedSrc).toMatch(/suiteKey,\s*suite\.suiteKey/);
  });

  it("boot wiring runs after seedAsDb (table provisioning) and before scheduler start", () => {
    // Use the call sites — `await seedAsDb()`, `await seedGraphSkillRows()`,
    // and the scheduler import — not arbitrary mentions in doc-blocks.
    const seedAsDbIdx = bootSrc.indexOf("await seedAsDb()");
    const rowsIdx = bootSrc.indexOf("await seedGraphSkillRows()");
    const schedIdx = bootSrc.indexOf(
      'import("./services/scheduler")',
    );
    expect(seedAsDbIdx).toBeGreaterThan(-1);
    expect(rowsIdx).toBeGreaterThan(seedAsDbIdx);
    expect(rowsIdx).toBeLessThan(schedIdx);
  });
});
