#!/usr/bin/env tsx
/**
 * check:module-registration
 *
 * Verifies that:
 *   - For migrated modules: client.ts exists and is imported by
 *     client/src/modules/index.ts (the bootstrap).
 *   - The manifest's `key` field matches the canonical RTLM key for
 *     its folder (avoids "communication" folder declaring
 *     `key: "comm"` etc.).
 *   - For unmigrated modules: missing client.ts is a baseline warning.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

import {
  isMigrated,
  RTLM_FOLDER_MAP,
  RTLM_LIST,
  type RtlmKey,
} from "./module-tools/migration-state";
import { readManifestFor } from "./module-tools/manifest-reader";

interface Finding {
  severity: "fail" | "warn";
  msg: string;
}

function main() {
  const repoRoot = process.cwd();
  const findings: Finding[] = [];

  const indexPath = join(repoRoot, "client", "src", "modules", "index.ts");
  if (!existsSync(indexPath)) {
    console.error("[FAIL] client/src/modules/index.ts not found");
    process.exit(1);
  }
  const indexSrc = readFileSync(indexPath, "utf8");

  for (const key of RTLM_LIST) {
    const folder = RTLM_FOLDER_MAP[key as RtlmKey];
    const moduleDir = join(repoRoot, "client", "src", "modules", folder);
    const strict = isMigrated(key);
    const sev: Finding["severity"] = strict ? "fail" : "warn";

    const clientTsPath = join(moduleDir, "client.ts");
    const hasClientTs = existsSync(clientTsPath);
    if (!hasClientTs) {
      findings.push({
        severity: sev,
        msg: `${key}: missing client.ts at ${folder}/`,
      });
    }

    const snap = readManifestFor(repoRoot, key as RtlmKey, folder);
    if (snap.manifestExists && snap.key && snap.key !== key) {
      findings.push({
        severity: "fail",
        msg: `${key}: manifest declares key="${snap.key}", expected "${key}"`,
      });
    }

    /* Bootstrap registration: either client.ts is imported, or the
       manifest itself is imported into client/src/modules/index.ts. */
    const folderRe = new RegExp(`from\\s+["'\`]\\./${folder}/(client|manifest)["'\`]`);
    if (!folderRe.test(indexSrc)) {
      findings.push({
        severity: sev,
        msg: `${key}: client/src/modules/index.ts does not import ./${folder}/{client,manifest}`,
      });
    }
  }

  /* ----- output ----- */
  console.log("Module Registration");
  console.log("===================");
  const fails = findings.filter((f) => f.severity === "fail");
  const warns = findings.filter((f) => f.severity === "warn");
  for (const f of fails) console.log(`  [FAIL] ${f.msg}`);
  for (const w of warns) console.log(`  [warn] ${w.msg}`);
  console.log("");
  console.log(`Failures: ${fails.length}`);
  console.log(`Baseline warnings: ${warns.length}`);
  if (fails.length > 0) process.exit(1);
  console.log("OK — module registration consistent.");
  process.exit(0);
}

main();
