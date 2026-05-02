#!/usr/bin/env tsx
/**
 * check:module-api-boundaries
 *
 * Walks `client/src/modules/<folder>/...` and reports any:
 *   - private cross-module imports (`@/modules/<other>/pages/...`)
 *   - cross-module tRPC calls (`trpc.<otherRtlm>.*`)
 *   - reach-around imports (`modules/<other>/...` without alias)
 *
 * For migrated modules this is a hard failure. For unmigrated
 * modules it is a baseline warning so we can see the existing
 * surface without blocking the guardrails PR.
 */

import { readFileSync } from "fs";
import { join, relative } from "path";

import { isMigrated, type RtlmKey } from "./module-tools/migration-state";
import { walkSourceFiles } from "./module-tools/walk";
import { scanFileForBoundaries } from "./module-tools/boundary-rules";

interface Finding {
  severity: "fail" | "warn";
  msg: string;
}

function main() {
  const repoRoot = process.cwd();
  const findings: Finding[] = [];

  for (const file of walkSourceFiles(
    join(repoRoot, "client", "src", "modules"),
  )) {
    const rel = relative(repoRoot, file);
    const src = readFileSync(file, "utf8");
    const inner = scanFileForBoundaries(rel, src);
    for (const f of inner) {
      if (f.kind !== "private-import" && f.kind !== "cross-module-trpc" && f.kind !== "non-public-modules-import") {
        continue;
      }
      const sev: Finding["severity"] =
        f.selfModule && isMigrated(f.selfModule) ? "fail" : "warn";
      const desc =
        f.kind === "cross-module-trpc"
          ? `cross-module trpc.${f.foreignModule} call`
          : f.kind === "private-import"
            ? `private import from ${f.foreignModule}`
            : `non-public 'modules/...' import`;
      findings.push({ severity: sev, msg: `${rel}: ${desc} — ${f.evidence}` });
    }
  }

  /* ----- output ----- */
  console.log("Module API Boundaries");
  console.log("=====================");
  const fails = findings.filter((f) => f.severity === "fail");
  const warns = findings.filter((f) => f.severity === "warn");
  for (const f of fails) console.log(`  [FAIL] ${f.msg}`);
  for (const w of warns) console.log(`  [warn] ${w.msg}`);
  console.log("");
  console.log(`Failures: ${fails.length}`);
  console.log(`Baseline warnings: ${warns.length}`);
  if (fails.length > 0) process.exit(1);
  console.log("OK — no cross-module boundary violations from migrated modules.");
  process.exit(0);
}

main();
