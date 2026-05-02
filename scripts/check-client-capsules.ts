#!/usr/bin/env tsx
/**
 * check:client-capsules
 *
 * For every migrated RTLM (per `MIGRATED_MODULES`):
 *   - client.ts must exist
 *   - manifest.ts must exist
 *   - mod.tsx must exist
 *   - routes.tsx must exist
 *   - nav.ts must exist
 *   - manifest must declare `baseRoute`, `capsuleEntrypoint`,
 *     `routeInventory`, valid `layoutMode` (and `layoutReason` when
 *     not "inside-main-layout")
 *
 * For unmigrated RTLMs, missing files / fields are emitted as
 * baseline warnings — never as build failures.
 *
 * Exits 1 only on strict failures.
 */

import { existsSync } from "fs";
import { join } from "path";

import {
  isMigrated,
  RTLM_FOLDER_MAP,
  RTLM_LIST,
  type RtlmKey,
} from "./module-tools/migration-state";
import { readManifestFor } from "./module-tools/manifest-reader";

interface Finding {
  module: RtlmKey;
  severity: "fail" | "warn";
  msg: string;
}

function main() {
  const repoRoot = process.cwd();
  const findings: Finding[] = [];

  for (const key of RTLM_LIST) {
    const folder = RTLM_FOLDER_MAP[key as RtlmKey];
    const moduleDir = join(repoRoot, "client", "src", "modules", folder);
    const strict = isMigrated(key);
    const sev: Finding["severity"] = strict ? "fail" : "warn";

    const required = [
      { name: "client.ts", path: join(moduleDir, "client.ts") },
      { name: "manifest.ts", path: join(moduleDir, "manifest.ts") },
      { name: "mod.tsx", path: join(moduleDir, "mod.tsx") },
      { name: "routes.tsx", path: join(moduleDir, "routes.tsx") },
      { name: "nav.ts", path: join(moduleDir, "nav.ts") },
    ];
    for (const r of required) {
      if (!existsSync(r.path)) {
        findings.push({
          module: key as RtlmKey,
          severity: sev,
          msg: `missing ${r.name}`,
        });
      }
    }

    const snap = readManifestFor(repoRoot, key as RtlmKey, folder);
    for (const w of snap.warnings) {
      findings.push({ module: key as RtlmKey, severity: sev, msg: w });
    }
  }

  /* ----- output ----- */
  console.log("Module Client Capsules");
  console.log("======================");
  const fails = findings.filter((f) => f.severity === "fail");
  const warns = findings.filter((f) => f.severity === "warn");

  for (const f of fails) console.log(`  [FAIL] ${f.module}: ${f.msg}`);
  for (const w of warns) console.log(`  [warn] ${w.module}: ${w.msg}`);

  console.log("");
  console.log(`Failures: ${fails.length}`);
  console.log(`Baseline warnings: ${warns.length}`);
  if (fails.length > 0) process.exit(1);
  console.log(
    fails.length === 0 && warns.length === 0
      ? "OK — every migrated module has a complete capsule."
      : "OK — strict checks pass; baseline warnings are expected on unmigrated modules.",
  );
  process.exit(0);
}

main();
