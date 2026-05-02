#!/usr/bin/env tsx
/**
 * check:module-routes-conflict
 *
 * Detects routes that two surfaces both claim to canonically own
 * (i.e. the same path declared in two manifests), and detects
 * baseRoute prefix collisions that would NOT be resolved by safe
 * route-segment matching.
 *
 * Examples:
 *   /ps  vs /psm                     — safe (route-segment boundary)
 *   /pm  vs /pm-central              — safe (different segment)
 *   /data-analysis vs /data-analysis/data-acquisition
 *                                    — safe via longest-baseRoute sort
 *   /foo vs /foo                     — UNSAFE: real conflict
 *   /foo vs /foo/bar (same module)   — fine; nested capsule
 *   /foo vs /foo (different modules) — UNSAFE: ambiguous ownership
 */

import { readAllManifests, type ManifestSnapshot } from "./module-tools/manifest-reader";
import { isBaseRouteMatch, normalizePath } from "./module-tools/route-parser";
import { isMigrated, type RtlmKey } from "./module-tools/migration-state";

interface Finding {
  severity: "fail" | "warn";
  msg: string;
}

function main() {
  const repoRoot = process.cwd();
  const manifests = readAllManifests(repoRoot);

  const findings: Finding[] = [];

  /* duplicate canonical paths across modules */
  const ownerByPath = new Map<string, Set<string>>();
  for (const m of manifests) {
    if (!m.key) continue;
    const declared = new Set<string>();
    for (const r of m.routes) declared.add(normalizePath(r.path));
    for (const p of m.routeInventory) declared.add(normalizePath(p));
    for (const p of declared) {
      let s = ownerByPath.get(p);
      if (!s) ownerByPath.set(p, (s = new Set()));
      s.add(m.key);
    }
  }
  for (const [path, owners] of ownerByPath) {
    if (owners.size > 1) {
      const ownersArr = [...owners];
      const anyMigrated = ownersArr.some((o) => isMigrated(o));
      findings.push({
        severity: anyMigrated ? "fail" : "warn",
        msg: `path ${path} has multiple canonical owners: ${ownersArr.join(", ")}`,
      });
    }
  }

  /* baseRoute equality */
  const byBase = new Map<string, string[]>();
  for (const m of manifests) {
    if (!m.key || !m.baseRoute) continue;
    const b = normalizePath(m.baseRoute);
    let arr = byBase.get(b);
    if (!arr) byBase.set(b, (arr = []));
    arr.push(m.key);
  }
  for (const [base, keys] of byBase) {
    if (keys.length > 1) {
      findings.push({
        severity: "fail",
        msg: `baseRoute ${base} declared by multiple modules: ${keys.join(", ")}`,
      });
    }
  }

  /* baseRoute nesting under another module's baseRoute */
  const baseEntries = [...byBase.entries()];
  for (const [a, [keyA]] of baseEntries) {
    for (const [b, [keyB]] of baseEntries) {
      if (a === b) continue;
      if (isBaseRouteMatch(b, a) && a !== b && keyA !== keyB) {
        findings.push({
          severity: "warn",
          msg: `baseRoute ${a} (${keyA}) is nested under ${b} (${keyB}); resolved by longest-first matching`,
        });
      }
    }
  }

  /* ----- output ----- */
  console.log("Module Routes Conflict");
  console.log("======================");
  const fails = findings.filter((f) => f.severity === "fail");
  const warns = findings.filter((f) => f.severity === "warn");
  for (const f of fails) console.log(`  [FAIL] ${f.msg}`);
  for (const w of warns) console.log(`  [warn] ${w.msg}`);
  console.log("");
  console.log(`Failures: ${fails.length}`);
  console.log(`Baseline warnings: ${warns.length}`);
  if (fails.length > 0) process.exit(1);
  console.log("OK — no conflicting canonical route ownership.");
  process.exit(0);
}

main();
