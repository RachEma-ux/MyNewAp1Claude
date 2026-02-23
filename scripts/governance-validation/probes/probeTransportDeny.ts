/**
 * Probe: Transport-Level Deny
 *
 * Validates:
 * - All denials use TRPCError (not payload-level flags)
 * - Denial code is "CONFLICT" (409) for governance, "UNAUTHORIZED" (401) or "FORBIDDEN" (403) for auth
 * - No {success:false} with 200 pattern in governance paths
 */

import * as fs from "fs";
import * as path from "path";
import type { ProbeResult, Finding } from "../index";

export function probeTransportDeny(rootDir: string): ProbeResult {
  const findings: Finding[] = [];

  // 1. Check trpc.ts uses TRPCError
  const trpcPath = path.join(rootDir, "server/_core/trpc.ts");
  if (fs.existsSync(trpcPath)) {
    const content = fs.readFileSync(trpcPath, "utf-8");

    // Verify TRPCError is imported
    if (!content.includes("TRPCError")) {
      findings.push({
        severity: "critical",
        title: "TRPCError not imported in trpc.ts",
        file: "server/_core/trpc.ts",
        line: 0,
        detail: "Must use TRPCError for protocol-level denial",
      });
    }

    // Verify governance denial uses CONFLICT
    if (!content.includes('code: "CONFLICT"')) {
      findings.push({
        severity: "critical",
        title: "Governance denial does not use CONFLICT code",
        file: "server/_core/trpc.ts",
        line: 0,
        detail: 'Governance denials must throw TRPCError with code: "CONFLICT" (HTTP 409)',
      });
    }
  }

  // 2. Check requireGate.ts returns httpStatus 409
  const gatePath = path.join(rootDir, "server/governance/requireGate.ts");
  if (fs.existsSync(gatePath)) {
    const gateContent = fs.readFileSync(gatePath, "utf-8");
    if (!gateContent.includes("httpStatus: 409")) {
      findings.push({
        severity: "high",
        title: "requireGate does not return httpStatus 409 on deny",
        file: "server/governance/requireGate.ts",
        line: 0,
        detail: "Gate denial must set httpStatus to 409 (Conflict)",
      });
    }
  }

  // 3. Scan governance-related files for soft deny patterns
  const govDir = path.join(rootDir, "server/governance");
  if (fs.existsSync(govDir)) {
    const files = walkDir(govDir, /\.ts$/);
    for (const filePath of files) {
      if (filePath.includes(".test.")) continue;
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        // Check for { success: false } returns (soft deny)
        if (lines[i].includes("success: false") && !lines[i].includes("//")) {
          findings.push({
            severity: "medium",
            title: "Potential soft deny pattern",
            file: path.relative(rootDir, filePath),
            line: i + 1,
            detail: '{ success: false } may be a soft deny — must use TRPCError for governance denials',
          });
        }
      }
    }
  }

  const status = findings.some((f) => f.severity === "critical") ? "FAIL" : findings.length > 0 ? "WARN" : "PASS";

  return {
    probeId: "P04",
    probeName: "Transport-Level Deny",
    status,
    findings,
    summary: `TRPCError-based denial: ${findings.filter(f => f.severity === "critical").length === 0 ? "verified" : "BROKEN"}. Soft deny patterns: ${findings.filter(f => f.title.includes("soft deny")).length}`,
  };
}

function walkDir(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      results.push(...walkDir(fullPath, pattern));
    } else if (entry.isFile() && pattern.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}
