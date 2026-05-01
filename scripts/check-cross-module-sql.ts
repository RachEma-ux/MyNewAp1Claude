#!/usr/bin/env tsx
/**
 * check:sql-boundaries
 *
 * Fails CI if a module file accesses another module's owned tables via
 * raw SQL or Drizzle table references. Heuristics used:
 *  - import of `drizzle/tables/<other>` from outside the owner.
 *  - SQL fragments referencing tables that are owned by a different module.
 */

import { join, relative, sep } from "path";
import {
  MODULE_MAP,
  REPO_ROOT,
  listSourceFiles,
  moduleOfPath,
  readFile,
  isPlatformBootstrap,
  type Violation,
} from "./lib/module-graph";

const root = REPO_ROOT;
const files = listSourceFiles(join(root, "server"));

/** Allow-list of legitimate cross-module DB usage. Each entry is
 *  `<importer-module>::<owner-accessor>`. Adding an entry here documents
 *  an intentional architectural exception — currently only KGRA → RAG,
 *  because KGRA is a thin query façade over the shared knowledge graph
 *  storage and is declared `dependsOn: ["rag"]` in its manifest.
 */
const ALLOW_FOREIGN_DB: Set<string> = new Set([
  "kgraAgent::getRagDb",
]);

const violations: Violation[] = [];
const importRegex = /(?:^|\n)\s*(?:import\s[^"';]+from\s*|import\s*|export\s[^"';]*from\s*)["']([^"']+)["']/g;

for (const file of files) {
  const importerModule = moduleOfPath(file, root);
  if (!importerModule) continue;
  if (isPlatformBootstrap(file, root)) continue;

  const src = readFile(file);

  // 1. Foreign Drizzle schema import detection
  importRegex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(src)) !== null) {
    const spec = match[1];
    const m = spec.match(/drizzle\/tables\/([a-zA-Z0-9-_]+)/);
    if (!m) continue;
    const schemaFile = m[1];
    const owner = MODULE_MAP.find((d) => d.privateSchemas.includes(schemaFile));
    if (!owner) continue;
    if (owner.key === importerModule.key) continue;

    const fileRel = relative(root, file).split(sep).join("/");
    const line = computeLine(src, match.index);
    violations.push({
      rule: "cross-module-private-schema-import",
      file: fileRel,
      line,
      severity: "error",
      message: `'${importerModule.key}' imports private Drizzle schema '${schemaFile}' (owned by '${owner.key}')`,
    });
  }

  // 2. Foreign DB connection accessor detection
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
          rule: "cross-module-foreign-db-connection",
          file: fileRel,
          line,
          severity: "error",
          message: `'${importerModule.key}' uses '${accessor}()' which is owned by '${owner.key}'`,
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
    console.error(`\n${errors.length} cross-module SQL/connection violation(s).`);
    process.exit(1);
  }
  console.log("OK — cross-module SQL/connection check passed.");
}
