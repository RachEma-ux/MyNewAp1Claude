#!/usr/bin/env tsx
/**
 * check:db-ownership
 *
 * Fails CI if:
 *  - a module file accesses another module's `getXxxDb()` accessor
 *    (handled by check-cross-module-sql.ts as well — this script is
 *    redundant but explicit per architecture spec)
 *  - a strong module's manifest does not declare a private DB
 *  - a strong module's repository file imports any DB other than its own
 */

import { join, relative, sep } from "path";
import {
  MODULE_MAP,
  REPO_ROOT,
  listSourceFiles,
  moduleOfPath,
  readFile,
  type Violation,
} from "./lib/module-graph";

const root = REPO_ROOT;
const files = listSourceFiles(join(root, "server"));
const violations: Violation[] = [];

const STRONG_MODULES = new Set([
  "prm",
  "psm",
  "codeStudio",
  "agentStudio",
  "sandboxWf",
  "rag",
  "communication",
  "pmCentral",
]);

// 1. Each strong module must have a manifest with kind: "owned".
for (const desc of MODULE_MAP) {
  if (!STRONG_MODULES.has(desc.key)) continue;
  const manifestPath = join(root, "server", desc.folder, "manifest.ts");
  let src: string;
  try {
    src = readFile(manifestPath);
  } catch {
    violations.push({
      rule: "missing-manifest",
      file: `server/${desc.folder}/manifest.ts`,
      line: 1,
      severity: "error",
      message: `Strong module '${desc.key}' is missing manifest.ts`,
    });
    continue;
  }
  if (!/kind:\s*"owned"/.test(src)) {
    violations.push({
      rule: "missing-owned-db",
      file: `server/${desc.folder}/manifest.ts`,
      line: 1,
      severity: "error",
      message: `Strong module '${desc.key}' must declare database.kind = "owned"`,
    });
  }
}

// Allow-list: documented exceptions. Mirrors check-cross-module-sql.ts.
const ALLOW_FOREIGN_DB: Set<string> = new Set([
  "kgraAgent::getRagDb",
]);

// 2. A module's repository / service files must not call foreign Db accessors.
//    (Already covered by check-cross-module-sql; we re-run a strict pass.)
for (const file of files) {
  const importerModule = moduleOfPath(file, root);
  if (!importerModule) continue;

  const src = readFile(file);
  for (const owner of MODULE_MAP) {
    if (owner.key === importerModule.key) continue;
    for (const accessor of owner.connectionAccessors) {
      if (ALLOW_FOREIGN_DB.has(`${importerModule.key}::${accessor}`)) continue;
      const re = new RegExp(`\\b${accessor}\\s*\\(`, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const fileRel = relative(root, file).split(sep).join("/");
        const line = computeLine(src, m.index);
        violations.push({
          rule: "foreign-db-connection-call",
          file: fileRel,
          line,
          severity: "error",
          message: `'${importerModule.key}' calls '${accessor}()' (owned by '${owner.key}')`,
        });
      }
    }
  }
}

reportViolations(violations);

function computeLine(src: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx; i++) if (src[i] === "\n") line++;
  return line;
}

function reportViolations(viols: Violation[]) {
  const errors = viols.filter((v) => v.severity === "error");
  for (const v of errors) {
    console.error(`[ERROR] ${v.rule} :: ${v.file}:${v.line}\n        ${v.message}`);
  }
  if (errors.length > 0) {
    console.error(`\n${errors.length} DB ownership violation(s).`);
    process.exit(1);
  }
  console.log("OK — DB ownership check passed.");
}
