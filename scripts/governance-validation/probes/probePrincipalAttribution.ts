/**
 * Probe: Principal Attribution
 *
 * Validates:
 * - No hardcoded actor IDs (?? 1, actor: 1, actorId ?? 1)
 * - No placeholder principals in production code
 * - Governance middleware uses real ctx.user.id
 */

import * as fs from "fs";
import * as path from "path";
import type { ProbeResult, Finding } from "../index";

const DANGEROUS_PATTERNS = [
  { regex: /actor:\s*(?:number\s*=\s*)?1\b/, label: "actor: 1 default" },
  { regex: /actorId\s*\?\?\s*1\b/, label: "actorId ?? 1 fallback" },
  { regex: /actor_id\s*\?\?\s*1\b/, label: "actor_id ?? 1 fallback" },
  { regex: /ctx\.user\?\.id\s*\?\?\s*1\b/, label: "ctx.user?.id ?? 1 fallback" },
  { regex: /installedBy.*\?\?\s*1\b/, label: "installedBy ?? 1 fallback" },
  { regex: /loadedBy.*\?\?\s*1\b/, label: "loadedBy ?? 1 fallback" },
];

export function probePrincipalAttribution(rootDir: string): ProbeResult {
  const findings: Finding[] = [];
  const serverDir = path.join(rootDir, "server");

  const files = walkDir(serverDir, /\.ts$/);
  for (const filePath of files) {
    if (filePath.includes(".test.") || filePath.includes(".spec.") || filePath.includes("node_modules")) continue;

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const relPath = path.relative(rootDir, filePath);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comments
      if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

      for (const { regex, label } of DANGEROUS_PATTERNS) {
        if (regex.test(line)) {
          // Allow in test files
          if (relPath.includes(".test.") || relPath.includes(".spec.")) continue;
          // Allow workspace ID fallbacks (wsId ?? 1 is workspace, not actor)
          if (label.includes("actor") || label.includes("installedBy") || label.includes("loadedBy")) {
            findings.push({
              severity: "high",
              title: `Hardcoded principal fallback: ${label}`,
              file: relPath,
              line: i + 1,
              detail: `"${line.trim()}" — real principal identity required, not placeholder "1"`,
              attack: `Call endpoint without auth → actor attributed as "1" → phantom principal in audit trail`,
              expected: "Throw if actor is missing",
              actual: "Falls back to hardcoded ID 1",
            });
          }
        }
      }
    }
  }

  // Check governance middleware uses ctx.user.id
  const trpcPath = path.join(rootDir, "server/_core/trpc.ts");
  if (fs.existsSync(trpcPath)) {
    const content = fs.readFileSync(trpcPath, "utf-8");
    if (content.includes("String(ctx.user.id)")) {
      // Good — using real user ID
    } else if (content.includes("ctx.user.id")) {
      // Acceptable
    } else {
      findings.push({
        severity: "critical",
        title: "Governance middleware does not use ctx.user.id",
        file: "server/_core/trpc.ts",
        line: 0,
        detail: "requireGovernance must attribute actions to ctx.user.id",
      });
    }
  }

  const status = findings.some((f) => f.severity === "critical") ? "FAIL" : findings.length > 0 ? "WARN" : "PASS";

  return {
    probeId: "P07",
    probeName: "Principal Attribution",
    status,
    findings,
    summary: `${findings.length} hardcoded principal fallback(s) found across production code.`,
  };
}

function walkDir(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith(".")) {
      results.push(...walkDir(fullPath, pattern));
    } else if (entry.isFile() && pattern.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}
