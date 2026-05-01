#!/usr/bin/env tsx
/**
 * check:coordinator-boundaries
 *
 * Fails CI if any file under `server/orchestrator/` or
 * `server/platform/coordinator/` imports a module-private file.
 *
 * The coordinator is allowed to use:
 *   - `server/platform/modules/module-gateway`
 *   - `server/platform/handoff/*`
 *   - `server/platform/events/*`
 *   - module `public-api.ts` / `contracts.ts` / `types.ts`
 *   - the platform DB (`server/db/*`, `server/_core/*`)
 *   - shared types
 */

import { join, relative, sep } from "path";
import {
  MODULE_MAP,
  REPO_ROOT,
  listSourceFiles,
  readFile,
  isInsideCoordinator,
  isAllowedPublicImport,
  type Violation,
} from "./lib/module-graph";

const root = REPO_ROOT;
const files = listSourceFiles(join(root, "server")).filter((f) =>
  isInsideCoordinator(f, root),
);

const violations: Violation[] = [];
const importRegex = /(?:^|\n)\s*(?:import\s[^"';]+from\s*|import\s*|export\s[^"';]*from\s*)["']([^"']+)["']/g;

const PRIVATE_NAME_PATTERNS = [
  /\.repository(\.ts)?$/,
  /\.service(\.ts)?$/,
  /\/connection(\.ts)?$/,
  /\/seed(\.ts)?$/,
  /\/executor(\.ts)?$/,
];

for (const file of files) {
  const src = readFile(file);
  importRegex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(src)) !== null) {
    const spec = match[1];
    if (!spec.startsWith(".") && !spec.startsWith("@/") && !spec.startsWith("@shared/")) continue;
    const fileRel = relative(root, file).split(sep).join("/");
    const fileDirRel = fileRel.split("/").slice(0, -1).join("/");
    const resolved = resolveImport(fileDirRel, spec);
    if (!resolved) continue;

    const targetModule = MODULE_MAP.find((d) =>
      resolved.startsWith(`server/${d.folder}/`),
    );
    if (!targetModule) continue;
    if (isAllowedPublicImport(resolved)) continue;
    if (resolved.endsWith(`/${targetModule.folder}/manifest.ts`)) continue;

    const isPrivate = PRIVATE_NAME_PATTERNS.some((re) => re.test(resolved));
    if (isPrivate) {
      const line = computeLine(src, match.index);
      violations.push({
        rule: "coordinator-private-import",
        file: fileRel,
        line,
        severity: "error",
        message: `coordinator imports private '${targetModule.key}' file: ${spec}`,
      });
    }
  }
}

reportViolations(violations);

function resolveImport(fromDirRel: string, spec: string): string | null {
  if (spec.startsWith("@/")) return `client/src/${spec.slice(2)}`;
  if (spec.startsWith("@shared/")) return `shared/${spec.slice("@shared/".length)}`;
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
  if (!/\.[a-z]+$/.test(joined)) joined += ".ts";
  return joined;
}

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
    console.error(`\n${errors.length} coordinator boundary violation(s).`);
    process.exit(1);
  }
  console.log("OK — coordinator boundary check passed.");
}
