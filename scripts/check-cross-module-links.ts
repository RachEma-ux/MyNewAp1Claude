#!/usr/bin/env tsx
/**
 * check:cross-module-links
 *
 * Scans `client/src/modules/...` for hardcoded references to a
 * different module's owned routes:
 *   - <Link href="/other-module/foo">
 *   - <a href="/other-module/foo">
 *   - location = "/other-module/foo"
 *   - navigate("/other-module/foo")
 *
 * When a public route builder exists for the target module (e.g.
 * `CommunicationRoutes.chat()`), the hardcoded form should be
 * replaced with that builder.
 *
 * For unmigrated modules: report-only. For migrated modules: fail
 * when a hardcoded link points at a foreign migrated module while a
 * public route builder is available in the foreign module's
 * `index.ts`.
 */

import { readFileSync, existsSync } from "fs";
import { join, relative } from "path";

import {
  isMigrated,
  RTLM_FOLDER_MAP,
  RTLM_LIST,
  type RtlmKey,
} from "./module-tools/migration-state";
import { walkSourceFiles } from "./module-tools/walk";
import {
  isBaseRouteMatch,
  normalizePath,
} from "./module-tools/route-parser";
import { resolveSelfModule } from "./module-tools/boundary-rules";

interface Finding {
  severity: "fail" | "warn";
  msg: string;
}

function moduleHasRouteBuilder(repoRoot: string, key: RtlmKey): boolean {
  const folder = RTLM_FOLDER_MAP[key];
  const indexPath = join(
    repoRoot,
    "client",
    "src",
    "modules",
    folder,
    "index.ts",
  );
  if (!existsSync(indexPath)) return false;
  const src = readFileSync(indexPath, "utf8");
  return /Routes\s*=\s*\{/.test(src);
}

function main() {
  const repoRoot = process.cwd();
  const findings: Finding[] = [];

  // Build base-route → owner map.
  const baseToOwner = new Map<string, RtlmKey>();
  for (const key of RTLM_LIST) {
    const folder = RTLM_FOLDER_MAP[key as RtlmKey];
    baseToOwner.set(`/${folder}`, key as RtlmKey);
  }

  const linkRe =
    /(?:href\s*=\s*|navigate\s*\(\s*|location\s*=\s*)["'`](\/[A-Za-z0-9/_:?\-*.]+)["'`]/g;

  for (const file of walkSourceFiles(
    join(repoRoot, "client", "src", "modules"),
  )) {
    const rel = relative(repoRoot, file);
    const self = resolveSelfModule(rel);
    const src = readFileSync(file, "utf8");

    for (const m of src.matchAll(linkRe)) {
      const target = normalizePath(m[1]);
      // Find owner via baseRoute prefix.
      const owner =
        [...baseToOwner.entries()]
          .sort((a, b) => b[0].length - a[0].length)
          .find(([base]) => isBaseRouteMatch(base, target))?.[1] ?? null;
      if (!owner || !self || owner === self) continue;

      const ownerHasBuilder = moduleHasRouteBuilder(repoRoot, owner);
      const sev: Finding["severity"] =
        isMigrated(self) && ownerHasBuilder ? "fail" : "warn";
      findings.push({
        severity: sev,
        msg: `${rel}: hardcoded link ${target} owned by ${owner}${ownerHasBuilder ? " (use public route builder)" : ""}`,
      });
    }
  }

  /* ----- output ----- */
  console.log("Cross-Module Links");
  console.log("==================");
  const fails = findings.filter((f) => f.severity === "fail");
  const warns = findings.filter((f) => f.severity === "warn");
  for (const f of fails) console.log(`  [FAIL] ${f.msg}`);
  for (const w of warns) console.log(`  [warn] ${w.msg}`);
  console.log("");
  console.log(`Failures: ${fails.length}`);
  console.log(`Baseline warnings: ${warns.length}`);
  if (fails.length > 0) process.exit(1);
  console.log("OK — no migrated-module link violations.");
  process.exit(0);
}

main();
