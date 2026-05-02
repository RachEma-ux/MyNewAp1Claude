#!/usr/bin/env tsx
/**
 * check:module-route-inventory
 *
 * For migrated modules, verify:
 *   - manifest.routeInventory matches the patterns declared in
 *     mod.tsx / routes.tsx
 *   - every nav.ts href resolves to a routeInventory entry (or to
 *     a known dynamic route within it)
 *   - every compatibilityRoute.to points at a canonical route the
 *     module declares
 *   - dynamic routes (`:id`, `:rest*`) resolve correctly via the
 *     route-parser matcher
 *
 * For unmigrated modules, missing inventory is a baseline warning.
 */

import {
  isMigrated,
  RTLM_FOLDER_MAP,
  RTLM_LIST,
  type RtlmKey,
} from "./module-tools/migration-state";
import { readManifestFor } from "./module-tools/manifest-reader";
import {
  normalizePath,
  routePatternMatches,
} from "./module-tools/route-parser";

interface Finding {
  severity: "fail" | "warn";
  module: RtlmKey;
  msg: string;
}

function main() {
  const repoRoot = process.cwd();
  const findings: Finding[] = [];

  for (const key of RTLM_LIST) {
    const folder = RTLM_FOLDER_MAP[key as RtlmKey];
    const strict = isMigrated(key);
    const sev: Finding["severity"] = strict ? "fail" : "warn";

    const snap = readManifestFor(repoRoot, key as RtlmKey, folder);
    if (!snap.manifestExists) continue;

    const routePatterns = (() => {
      const set = new Set<string>();
      for (const p of snap.routeInventory) set.add(normalizePath(p));
      for (const p of snap.routesFileEntries) set.add(normalizePath(p));
      for (const r of snap.routes) set.add(normalizePath(r.path));
      return [...set];
    })();

    if (strict && routePatterns.length === 0) {
      findings.push({
        severity: sev,
        module: key as RtlmKey,
        msg: `${key}: no routes/routeInventory declared in manifest`,
      });
    }

    /* nav hrefs must resolve */
    for (const href of snap.navHrefs) {
      const candidate = normalizePath(href);
      const matched = routePatterns.some((pat) =>
        routePatternMatches(pat, candidate),
      );
      if (!matched) {
        findings.push({
          severity: sev,
          module: key as RtlmKey,
          msg: `${key}: nav href ${href} has no matching route pattern`,
        });
      }
    }

    /* compatibility targets must be canonical */
    for (const c of snap.compatibilityRoutes) {
      const to = normalizePath(c.to);
      const matched = routePatterns.some((pat) => routePatternMatches(pat, to));
      if (!matched) {
        findings.push({
          severity: sev,
          module: key as RtlmKey,
          msg: `${key}: compatibilityRoutes.to ${c.to} does not match any declared route`,
        });
      }
    }

    /* mod.tsx coverage: routeInventory ⊆ routesFileEntries (strict) */
    if (strict && snap.routeInventory.length > 0 && snap.routesFileEntries.length > 0) {
      const fileSet = new Set(snap.routesFileEntries.map(normalizePath));
      for (const inv of snap.routeInventory.map(normalizePath)) {
        if (!fileSet.has(inv) && !snap.routesFileEntries.some((p) => routePatternMatches(p, inv))) {
          findings.push({
            severity: sev,
            module: key as RtlmKey,
            msg: `${key}: routeInventory entry ${inv} not present in routes.tsx/mod.tsx`,
          });
        }
      }
    }
  }

  /* ----- output ----- */
  console.log("Module Route Inventory");
  console.log("======================");
  const fails = findings.filter((f) => f.severity === "fail");
  const warns = findings.filter((f) => f.severity === "warn");
  for (const f of fails) console.log(`  [FAIL] ${f.msg}`);
  for (const w of warns) console.log(`  [warn] ${w.msg}`);
  console.log("");
  console.log(`Failures: ${fails.length}`);
  console.log(`Baseline warnings: ${warns.length}`);
  if (fails.length > 0) process.exit(1);
  console.log("OK — route inventory consistent for migrated modules.");
  process.exit(0);
}

main();
