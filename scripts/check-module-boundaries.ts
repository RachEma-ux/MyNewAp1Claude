#!/usr/bin/env tsx
/**
 * check:boundaries
 *
 * Fails CI if any file imports a module-private file from a different
 * module. The legacy allow-list `LEGACY_ALLOW` quarantines pre-existing
 * violations until they are remediated; the list must shrink over time
 * and the script fails if a new entry would be added.
 */

import { join, relative, sep } from "path";
import {
  MODULE_MAP,
  REPO_ROOT,
  isInsideModule,
  listSourceFiles,
  moduleOfPath,
  readFile,
  isAllowedPublicImport,
  isPlatformBootstrap,
  type Violation,
} from "./lib/module-graph";

/** Pre-existing cross-module imports we quarantine. New entries are not
 *  allowed — the script fails on a new violation. */
const LEGACY_ALLOW = new Set<string>([
  // Format: `<importer-relative-path>::<imported-specifier>`
  // Populated empty initially; reviewer will adjust.
]);

const root = REPO_ROOT;
const files = listSourceFiles(join(root, "server"));

const violations: Violation[] = [];
const importRegex = /(?:^|\n)\s*(?:import\s[^"';]+from\s*|import\s*|export\s[^"';]*from\s*)["']([^"']+)["']/g;

for (const file of files) {
  const importerModule = moduleOfPath(file, root);
  if (!importerModule) continue;
  if (isPlatformBootstrap(file, root)) continue;

  const src = readFile(file);
  let match: RegExpExecArray | null;
  importRegex.lastIndex = 0;
  while ((match = importRegex.exec(src)) !== null) {
    const spec = match[1];
    if (!spec.startsWith(".") && !spec.startsWith("@/") && !spec.startsWith("@shared/")) continue;

    // Resolve relative to repo
    const fileRel = relative(root, file).split(sep).join("/");
    const fileDirRel = fileRel.split("/").slice(0, -1).join("/");
    const resolved = resolveImport(fileDirRel, spec);
    if (!resolved) continue;

    // Identify the target module (if any)
    const targetModule = MODULE_MAP.find((d) =>
      resolved.startsWith(`server/${d.folder}/`),
    );
    if (!targetModule) continue;
    if (targetModule.key === importerModule.key) continue;

    // Allowed if it's a public-surface file
    if (isAllowedPublicImport(resolved)) continue;

    // Allowed if importing the target's manifest barrel
    if (resolved.endsWith(`/${targetModule.folder}/manifest.ts`)) continue;

    const allowKey = `${fileRel}::${resolved}`;
    if (LEGACY_ALLOW.has(allowKey)) continue;

    const line = computeLine(src, match.index);
    violations.push({
      rule: "cross-module-private-import",
      file: fileRel,
      line,
      severity: "error",
      message: `'${importerModule.key}' imports private file from '${targetModule.key}': ${spec}`,
    });
  }
}

reportViolations(violations);

function resolveImport(fromDirRel: string, spec: string): string | null {
  if (spec.startsWith("@/")) {
    return `client/src/${spec.slice(2)}`;
  }
  if (spec.startsWith("@shared/")) {
    return `shared/${spec.slice("@shared/".length)}`;
  }
  if (!spec.startsWith(".")) return null;

  const parts = `${fromDirRel}/${spec}`.split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") {
      out.pop();
      continue;
    }
    out.push(p);
  }
  let joined = out.join("/");
  // Add .ts if missing
  if (!/\.[a-z]+$/.test(joined)) {
    joined = joined + ".ts";
  }
  return joined;
}

function computeLine(src: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx; i++) if (src[i] === "\n") line++;
  return line;
}

function reportViolations(viols: Violation[]) {
  const errors = viols.filter((v) => v.severity === "error");
  const warns = viols.filter((v) => v.severity === "warning");
  for (const v of errors) {
    console.error(`[ERROR] ${v.rule} :: ${v.file}:${v.line}\n        ${v.message}`);
  }
  for (const v of warns) {
    console.warn(`[WARN]  ${v.rule} :: ${v.file}:${v.line}\n        ${v.message}`);
  }
  if (errors.length > 0) {
    console.error(`\n${errors.length} boundary violation(s).`);
    process.exit(1);
  }
  console.log(`OK — boundary check passed (${warns.length} warning(s)).`);
}
