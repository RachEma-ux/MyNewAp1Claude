/**
 * F5 (2026-05-22) — source-scan integrity test ensuring the ASDB
 * seed reconciler's `combinedSchema` includes every `ags_*` table
 * file under `drizzle/tables/`. Before this test landed,
 * `agent-studio-regions.ts`, `agent-studio-workspace-region-pins.ts`,
 * and `agent-studio-runtime-alerts.ts` were defined + re-exported
 * via `drizzle/schema.ts` but never spread into `combinedSchema`,
 * so those three tables silently did NOT exist on a freshly-seeded
 * ASDB. The region-cache-rewarm + graph-health-alert crons then
 * failed every tick.
 *
 * The cheapest defense against this drift is to scan the seed file
 * for every `agent-studio-*` import path, list every actual table
 * file on disk, and assert no file is missing.
 *
 * Pattern: same as the other source-scan tests in this directory
 * (e.g. `*-router-mounted.test.ts`, the mount-drift audit pattern).
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");
const SEED_PATH = join(REPO_ROOT, "server/agent-studio/db/seed.ts");
const TABLES_DIR = join(REPO_ROOT, "drizzle/tables");

/**
 * Returns the `agent-studio-*.ts` filenames (without extension) under
 * `drizzle/tables/`. These are the table-definition modules the seed
 * reconciler must introspect.
 *
 * Files allow-listed as "intentionally not in the seed" go in
 * KNOWN_NON_ASDB_TABLES below — e.g. table files that target a
 * different database or are pure type re-exports.
 */
function listAgentStudioTableFiles(): string[] {
  return readdirSync(TABLES_DIR)
    .filter((f) => f.startsWith("agent-studio") && f.endsWith(".ts"))
    .map((f) => f.replace(/\.ts$/, ""))
    .sort();
}

/**
 * Allow-list of table files that legitimately do NOT belong in the
 * ASDB seed's `combinedSchema` (because they live on a different DB,
 * are pure type-only modules, etc).
 *
 * If you add a new `drizzle/tables/agent-studio-*.ts` that targets a
 * different database, add its basename here AND in a comment
 * explaining the boundary.
 */
const KNOWN_NON_ASDB_TABLES: ReadonlySet<string> = new Set([
  // (empty — all current `agent-studio-*` files target ASDB)
]);

describe("ASDB seed combinedSchema completeness (F5)", () => {
  it("imports every drizzle/tables/agent-studio-*.ts module", () => {
    const seedSource = readFileSync(SEED_PATH, "utf-8");
    const tableFiles = listAgentStudioTableFiles();

    const missing: string[] = [];
    for (const basename of tableFiles) {
      if (KNOWN_NON_ASDB_TABLES.has(basename)) continue;
      // Look for `from "../../../drizzle/tables/<basename>"` (with or
      // without trailing `.js`). Hand-written paths in this codebase
      // are all relative-from-server-root.
      const importPattern = new RegExp(
        `from\\s+["'].*drizzle/tables/${basename.replace(/-/g, "\\-")}(?:\\.js)?["']`,
      );
      if (!importPattern.test(seedSource)) {
        missing.push(basename);
      }
    }

    expect(missing).toEqual([]);
  });

  it("spreads the F5 schema imports into combinedSchema (regression guard)", () => {
    const seedSource = readFileSync(SEED_PATH, "utf-8");
    // The three originally-surfaced tables (region-cache cron failures):
    expect(seedSource).toMatch(/\.\.\.agsRegionsSchema\b/);
    expect(seedSource).toMatch(/\.\.\.agsWorkspaceRegionPinsSchema\b/);
    expect(seedSource).toMatch(/\.\.\.agsRuntimeAlertsSchema\b/);
    // The five extras the source-scan caught in the same sweep:
    expect(seedSource).toMatch(/\.\.\.agsCodeGraphSchema\b/);
    expect(seedSource).toMatch(/\.\.\.agsExtensionsSchema\b/);
    expect(seedSource).toMatch(/\.\.\.agsPublishTargetsSchema\b/);
    expect(seedSource).toMatch(/\.\.\.agsSecurityGraphSchema\b/);
    expect(seedSource).toMatch(/\.\.\.agsVaultTemplateInstantiationsSchema\b/);
  });
});
