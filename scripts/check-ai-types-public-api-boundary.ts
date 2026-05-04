#!/usr/bin/env tsx
/**
 * check:ai-types-public-api-boundary  (Plan v3 Phase 26)
 *
 * Enforces that code outside `server/ai-types/` may only import from
 * the AI Types public-API surface (`public-api.ts`, `manifest.ts`,
 * `types.ts`, `contracts.ts`, `events.ts`, `ports.ts`) — anything
 * else (`db`, `service`, `service-runtime`, `execution`, `invoke`,
 * `import-normalizer`, `projection`, `availability`, `publishing`,
 * `legacy-import`, `register`, `router`, `boot`) is private.
 *
 * Mode: baseline-allow.
 *   - The 18 known offenders are listed in
 *     `scripts/baseline/ai-types-public-api-boundary.txt`. They are
 *     reported as WARNINGS; the run still exits 0.
 *   - Any NEW file that imports a private module is reported as a
 *     FAILURE; the run exits 1.
 *   - Files inside `server/ai-types/` are exempt.
 *   - Test files (*.test.ts) are exempt — tests routinely poke at
 *     internals; this is acceptable per the existing Plan v3 pattern
 *     (see `server/ai-types/legacy-import.test.ts`).
 *
 * Wired into `npm run check:architecture` via the package.json
 * compound script.
 */

import { readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { walkSourceFiles } from "./module-tools/walk";

const ROOT = process.cwd();
const BASELINE_PATH = join(
  ROOT,
  "scripts/baseline/ai-types-public-api-boundary.txt",
);

const PUBLIC_SURFACE = new Set([
  "public-api",
  "manifest",
  "types",
  "contracts",
  "events",
  "ports",
]);

interface Finding {
  severity: "fail" | "warn";
  file: string;
  line: number;
  evidence: string;
}

function loadBaseline(): Set<string> {
  try {
    const raw = readFileSync(BASELINE_PATH, "utf8");
    const out = new Set<string>();
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      out.add(trimmed);
    }
    return out;
  } catch {
    return new Set();
  }
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

function scanFile(absPath: string, rel: string, findings: Finding[], baseline: Set<string>): void {
  let content: string;
  try {
    content = readFileSync(absPath, "utf8");
  } catch {
    return;
  }
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const submodule = detectPrivateImport(lines[i]);
    if (!submodule) continue;
    const isBaselined = baseline.has(rel);
    findings.push({
      severity: isBaselined ? "warn" : "fail",
      file: rel,
      line: i + 1,
      evidence: `imports ai-types/${submodule} (private)`,
    });
  }
}

function main(): void {
  const baseline = loadBaseline();
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
    scanFile(abs, rel, findings, baseline);
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
    scanFile(abs, rel, findings, baseline);
  }

  console.log("AI Types Public-API Boundary");
  console.log("=============================");
  const fails = findings.filter((f) => f.severity === "fail");
  const warns = findings.filter((f) => f.severity === "warn");
  for (const f of fails) {
    console.log(`  [FAIL] ${f.file}:${f.line} — ${f.evidence}`);
  }
  for (const w of warns) {
    console.log(`  [warn] ${w.file}:${w.line} — ${w.evidence}`);
  }
  console.log("");
  console.log(`Failures: ${fails.length}`);
  console.log(`Baseline warnings: ${warns.length}`);
  if (fails.length > 0) {
    console.log(
      "FAIL — new AI Types boundary violation(s). Either migrate the import to `ai-types/public-api.ts` or add to scripts/baseline/ai-types-public-api-boundary.txt with a deadline-tracked LR entry.",
    );
    process.exit(1);
  }
  console.log(
    "OK — no new AI Types public-API boundary violations beyond the baseline.",
  );
  process.exit(0);
}

main();
