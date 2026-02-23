/**
 * Probe: Freeze Block Enforcement
 *
 * Validates:
 * - System-wide freeze check runs in governance middleware
 * - Per-subject freeze check runs in requireGate
 * - Freeze denial throws TRPCError (not soft deny)
 * - Freeze is checked BEFORE scorecard (short-circuit)
 * - Freeze state storage mechanism exists
 */

import * as fs from "fs";
import * as path from "path";
import type { ProbeResult, Finding } from "../index";

export function probeFreezeBlock(rootDir: string): ProbeResult {
  const findings: Finding[] = [];

  // 1. Check trpc.ts middleware has freeze check
  const trpcPath = path.join(rootDir, "server/_core/trpc.ts");
  if (fs.existsSync(trpcPath)) {
    const content = fs.readFileSync(trpcPath, "utf-8");
    const lines = content.split("\n");

    // Find isFrozen(0) in requireGovernance
    const freezeLineIdx = lines.findIndex((l) => l.includes("isFrozen(0)"));
    const gateLineIdx = lines.findIndex((l) => l.includes("requireGate("));

    if (freezeLineIdx < 0) {
      findings.push({
        severity: "critical",
        title: "System freeze check missing from middleware",
        file: "server/_core/trpc.ts",
        line: 0,
        detail: "requireGovernance middleware must call isFrozen(0) before proceeding",
      });
    } else if (gateLineIdx >= 0 && freezeLineIdx > gateLineIdx) {
      findings.push({
        severity: "critical",
        title: "Freeze check runs AFTER requireGate",
        file: "server/_core/trpc.ts",
        line: freezeLineIdx + 1,
        detail: "isFrozen(0) must run BEFORE requireGate() for short-circuit denial",
      });
    }

    // Check that freeze denial throws TRPCError with CONFLICT
    if (!content.includes('code: "CONFLICT"') || !content.includes("FREEZE active")) {
      findings.push({
        severity: "high",
        title: "Freeze denial may not throw CONFLICT",
        file: "server/_core/trpc.ts",
        line: freezeLineIdx + 1,
        detail: 'Freeze denial must throw TRPCError with code: "CONFLICT"',
      });
    }
  } else {
    findings.push({
      severity: "critical",
      title: "trpc.ts missing",
      file: "server/_core/trpc.ts",
      line: 0,
      detail: "Core tRPC middleware file does not exist",
    });
  }

  // 2. Check requireGate.ts has per-subject freeze check
  const gatePath = path.join(rootDir, "server/governance/requireGate.ts");
  if (fs.existsSync(gatePath)) {
    const gateContent = fs.readFileSync(gatePath, "utf-8");
    if (!gateContent.includes("isFrozen(subject.id)")) {
      findings.push({
        severity: "critical",
        title: "Per-subject freeze check missing from requireGate",
        file: "server/governance/requireGate.ts",
        line: 0,
        detail: "requireGate must check isFrozen(subject.id) before running scorecard",
      });
    }
    if (!gateContent.includes("isFrozen(0)")) {
      findings.push({
        severity: "high",
        title: "System freeze not double-checked in requireGate",
        file: "server/governance/requireGate.ts",
        line: 0,
        detail: "requireGate should also check system-wide freeze as defense-in-depth",
      });
    }
  }

  // 3. Check freeze storage is persistent
  const driftPath = path.join(rootDir, "server/governance/scorecard/drift-detector.ts");
  if (fs.existsSync(driftPath)) {
    const driftContent = fs.readFileSync(driftPath, "utf-8");
    if (driftContent.includes("new Map<number, FrozenSubject>()")) {
      findings.push({
        severity: "high",
        title: "Freeze state is in-memory only (Map)",
        file: "server/governance/scorecard/drift-detector.ts",
        line: findLine(driftContent, "new Map<number, FrozenSubject>"),
        detail: "Freeze state stored in Map — lost on server restart. Must persist to DB for durability.",
        attack: "Trigger server restart → all freezes cleared → mutations proceed",
        expected: "Freeze survives restart",
        actual: "Empty Map on startup",
      });
    }
  }

  // 4. Verify freeze blocks ALL governed paths
  const trpcContent = fs.existsSync(trpcPath) ? fs.readFileSync(trpcPath, "utf-8") : "";
  if (!trpcContent.includes("governedProcedure") || !trpcContent.includes("governedAdminProcedure")) {
    findings.push({
      severity: "high",
      title: "Governed procedure exports incomplete",
      file: "server/_core/trpc.ts",
      line: 0,
      detail: "Both governedProcedure and governedAdminProcedure must be exported with freeze middleware",
    });
  }

  const status = findings.some((f) => f.severity === "critical") ? "FAIL" : findings.length > 0 ? "WARN" : "PASS";

  return {
    probeId: "P03",
    probeName: "Freeze Block Enforcement",
    status,
    findings,
    summary: `Freeze check: middleware=${!findings.some(f => f.title.includes("middleware"))}, requireGate=${!findings.some(f => f.title.includes("requireGate"))}, persistent=${!findings.some(f => f.title.includes("in-memory"))}`,
  };
}

function findLine(content: string, search: string): number {
  const idx = content.indexOf(search);
  if (idx < 0) return 0;
  return content.substring(0, idx).split("\n").length;
}
