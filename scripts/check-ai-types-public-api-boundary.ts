#!/usr/bin/env tsx
/**
 * check:ai-types-public-api-boundary  (Plan v3 Phase 26 + Phase 31)
 *
 * Enforces that code outside `server/ai-types/` may only import from
 * the AI Types public-API surface (`public-api.ts`, `manifest.ts`,
 * `types.ts`, `contracts.ts`, `events.ts`, `ports.ts`) — anything
 * else (`db`, `service`, `service-runtime`, `execution`, `invoke`,
 * `import-normalizer`, `projection`, `availability`, `publishing`,
 * `legacy-import`, `register`, `router`, `boot`) is private.
 *
 * Mode: **strict** (Phase 31 / Phase 26.1, 2026-05-07).
 *   - Any file that imports a private module is reported as a
 *     FAILURE; the run exits 1. There is no baseline.
 *   - Files inside `server/ai-types/` are exempt.
 *   - Test files (*.test.ts) are exempt — tests routinely poke at
 *     internals; this is acceptable per the existing Plan v3 pattern
 *     (see `server/ai-types/legacy-import.test.ts`).
 *
 * Wired into `npm run check:architecture` via the package.json
 * compound script.
 */

import { statSync } from "fs";
import { join, relative } from "path";
import { walkSourceFiles } from "./module-tools/walk";

const ROOT = process.cwd();

const PUBLIC_SURFACE = new Set([
  "public-api",
  "manifest",
  "types",
  "contracts",
  "events",
  "ports",
]);

interface Finding {
  severity: "fail";
  file: string;
  line: number;
  evidence: string;
}

/**
 * Returns the matched private-module name (e.g. "db", "service") if
 * the line imports from a private AI Types module. Returns null
 * otherwise. Recognizes:
 *   - from "../ai-types/<name>"
 *   - from "../../ai-types/<name>"
 *   - from "../../../ai-types/<name>"
 *   - from "@/ai-types/<name>" (in case of any client-style alias)
 */
function detectPrivateImport(line: string): string | null {
  const re = /from\s+["']((?:\.{1,2}\/){1,4}|@\/)ai-types\/([a-zA-Z0-9_-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const submodule = m[2];
    if (!PUBLIC_SURFACE.has(submodule)) {
      return submodule;
    }
  }
  return null;
}

function scanFile(absPath: string, rel: string, findings: Finding[]): void {
  let content: string;
  try {
    const fs = require("fs") as typeof import("fs");
    content = fs.readFileSync(absPath, "utf8");
  } catch {
    return;
  }
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const submodule = detectPrivateImport(lines[i]);
    if (!submodule) continue;
    findings.push({
      severity: "fail",
      file: rel,
      line: i + 1,
      evidence: `imports ai-types/${submodule} (private)`,
    });
  }
}

function main(): void {
  const findings: Finding[] = [];

  const serverDir = join(ROOT, "server");
  for (const abs of walkSourceFiles(serverDir)) {
    const rel = relative(ROOT, abs);
    // Skip AI Types own files
    if (rel.startsWith("server/ai-types/")) continue;
    // Skip test files
    if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue;
    // Skip type-only declaration files
    if (rel.endsWith(".d.ts")) continue;
    try {
      if (!statSync(abs).isFile()) continue;
    } catch {
      continue;
    }
    scanFile(abs, rel, findings);
  }

  // Also scan scripts/ for completeness — they are server-side too.
  const scriptsDir = join(ROOT, "scripts");
  for (const abs of walkSourceFiles(scriptsDir)) {
    const rel = relative(ROOT, abs);
    if (rel.endsWith(".test.ts")) continue;
    if (rel.endsWith(".d.ts")) continue;
    try {
      if (!statSync(abs).isFile()) continue;
    } catch {
      continue;
    }
    scanFile(abs, rel, findings);
  }

  console.log("AI Types Public-API Boundary");
  console.log("=============================");
  for (const f of findings) {
    console.log(`  [FAIL] ${f.file}:${f.line} — ${f.evidence}`);
  }
  console.log("");
  console.log(`Failures: ${findings.length}`);
  if (findings.length > 0) {
    console.log(
      "FAIL — AI Types boundary violation(s). Migrate the import to `ai-types/public-api.ts`.",
    );
    process.exit(1);
  }
  console.log(
    "OK — all AI Types imports go through the public-API surface.",
  );
  process.exit(0);
}

main();
