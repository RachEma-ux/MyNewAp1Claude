#!/usr/bin/env tsx
/**
 * check:module-readiness
 *
 * Verifies the readiness scorer is sane:
 *   - every module has a numeric score in [0, 100]
 *   - every module has a readiness status from the documented set
 *   - the status assignment matches the score / blockers
 *   - any module with `required` missing/broken/blocked area appears
 *     in `blockers`
 *
 * Exits non-zero on structural mismatches.
 */
import {
  buildApplicationWiringInventory,
  computeReadiness,
  readinessStatusFor,
  type ModuleReadinessStatus,
} from "../server/platform/wiring";

const VALID_STATUSES: ReadonlySet<ModuleReadinessStatus> = new Set([
  "fully-wired",
  "mostly-wired",
  "partially-wired",
  "declared-only",
  "blocked",
]);

function main() {
  const modules = buildApplicationWiringInventory();
  const issues: string[] = [];

  for (const mod of modules) {
    if (typeof mod.readinessScore !== "number" || Number.isNaN(mod.readinessScore)) {
      issues.push(`${mod.moduleKey}: readinessScore is not a number`);
      continue;
    }
    if (mod.readinessScore < 0 || mod.readinessScore > 100) {
      issues.push(`${mod.moduleKey}: readinessScore ${mod.readinessScore} out of [0,100]`);
    }
    if (!VALID_STATUSES.has(mod.readinessStatus)) {
      issues.push(`${mod.moduleKey}: invalid readinessStatus '${mod.readinessStatus}'`);
    }

    // Recompute and compare for drift.
    const fresh = computeReadiness(mod.areas);
    if (fresh.score !== mod.readinessScore) {
      issues.push(
        `${mod.moduleKey}: stored score ${mod.readinessScore} disagrees with recompute ${fresh.score}`,
      );
    }
    const expectedStatus = readinessStatusFor(fresh.score, fresh.blockers.length);
    if (expectedStatus !== mod.readinessStatus) {
      issues.push(
        `${mod.moduleKey}: status '${mod.readinessStatus}' disagrees with bucket '${expectedStatus}' (score=${fresh.score}, blockers=${fresh.blockers.length})`,
      );
    }

    // Required missing/broken/blocked must be a recorded blocker.
    for (const a of mod.areas) {
      if (
        a.required &&
        (a.status === "missing" || a.status === "broken" || a.status === "blocked") &&
        !mod.blockers.some((b) => b.startsWith(a.area))
      ) {
        issues.push(
          `${mod.moduleKey}: required ${a.area} ${a.status} but not in blockers list`,
        );
      }
    }
  }

  console.log("Module readiness");
  console.log("================");
  for (const mod of modules) {
    console.log(
      `  ${mod.moduleKey.padEnd(24)} ${String(mod.readinessScore).padStart(4)}  ${mod.readinessStatus.padEnd(18)} blockers=${mod.blockers.length} warnings=${mod.warnings.length}`,
    );
  }
  console.log("");

  if (issues.length === 0) {
    console.log("Readiness scoring is internally consistent.");
    process.exit(0);
  }

  console.log(`${issues.length} issue(s):`);
  for (const i of issues) console.log(`  - ${i}`);
  process.exit(1);
}

main();
