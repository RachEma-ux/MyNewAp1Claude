#!/usr/bin/env tsx
/**
 * check:architecture
 *
 * Aggregates all modular-platform CI checks. Runs each in turn and
 * exits non-zero if any fails.
 */

import { spawnSync } from "child_process";
import { join } from "path";
import { REPO_ROOT } from "./lib/module-graph";

const SUITES = [
  ["check:modules", "scripts/check-modules.ts"],
  ["check:boundaries", "scripts/check-module-boundaries.ts"],
  ["check:sql-boundaries", "scripts/check-cross-module-sql.ts"],
  ["check:db-ownership", "scripts/check-module-db-ownership.ts"],
  ["check:coordinator-boundaries", "scripts/check-coordinator-boundaries.ts"],
  [
    "check:provider-credential-resolver-boundary",
    "scripts/check-provider-credential-resolver-boundary.ts",
  ],
  [
    "check:provider-key-env-boundary",
    "scripts/check-provider-key-env-boundary.ts",
  ],
  ["check:governance-actions", "scripts/check-governance-actions.ts"],
  // Live-cluster role check — auto-skips when DATABASE_URL is unset, so
  // it's safe to include in the suite for local sandboxes.
  ["check:db-roles", "scripts/check-db-roles.ts"],
];

let failed = 0;
for (const [label, file] of SUITES) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync("npx", ["tsx", join(REPO_ROOT, file)], {
    stdio: "inherit",
    cwd: REPO_ROOT,
  });
  if (result.status !== 0) failed++;
}
if (failed) {
  console.error(`\n${failed} architecture check(s) failed.`);
  process.exit(1);
}
console.log("\nOK — all architecture checks passed.");
