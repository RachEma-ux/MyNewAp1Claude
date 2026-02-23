/**
 * Probe: Mutation Governance Coverage
 *
 * For each mutation entrypoint:
 * - Verify it uses governedProcedure or governedAdminProcedure
 * - Flag any protectedProcedure/publicProcedure mutations as ungoverned
 * - Compute coverage percentage and fail if below threshold
 */

import * as fs from "fs";
import * as path from "path";
import type { ProbeResult, Finding } from "../index";
import { scanMutations, type CoverageEntry } from "../loadCoverageMap";

// Coverage threshold must only increase. Decreasing requires architectural review.
const COVERAGE_THRESHOLD = 30; // Required % — must match scripts/governance/coverage-map.ts

export function probeMutationGovernance(rootDir: string, entries?: CoverageEntry[]): ProbeResult {
  const findings: Finding[] = [];
  const mutations = entries && entries.length > 0 ? entries : scanMutations(rootDir);

  const governed = mutations.filter((m) => m.requiresGovernance);
  const ungoverned = mutations.filter((m) => !m.requiresGovernance);
  const coverage = mutations.length > 0 ? Math.round((governed.length / mutations.length) * 100) : 0;

  // Flag all ungoverned mutations
  for (const m of ungoverned) {
    // Allow public logout
    if (m.procedureName === "logout" && m.procedureType === "publicProcedure") continue;
    // Allow cache clears (low-risk)
    if (m.procedureName === "clearCache") continue;

    findings.push({
      severity: "high",
      title: `Ungoverned mutation: ${m.procedureName}`,
      file: m.file,
      line: m.line,
      detail: `Uses ${m.procedureType} instead of governedProcedure — bypasses freeze check, scorecard, audit`,
      attack: `POST /api/trpc/${extractEndpointName(m.file, m.procedureName)} with any valid auth token`,
      expected: "CONFLICT (409) or governance gate evaluation",
      actual: "200 OK — mutation proceeds with only auth check",
    });
  }

  // Coverage threshold check
  if (coverage < COVERAGE_THRESHOLD) {
    findings.push({
      severity: "critical",
      title: `Governance coverage ${coverage}% is below ${COVERAGE_THRESHOLD}% threshold`,
      file: "scripts/governance-validation",
      line: 0,
      detail: `${governed.length}/${mutations.length} mutations governed. ${ungoverned.length} mutations bypass governance entirely.`,
    });
  }

  const status = findings.some((f) => f.severity === "critical") ? "FAIL" : findings.length > 0 ? "WARN" : "PASS";

  return {
    probeId: "P02",
    probeName: "Mutation Governance Coverage",
    status,
    findings,
    summary: `${governed.length}/${mutations.length} mutations governed (${coverage}%). Threshold: ${COVERAGE_THRESHOLD}%. ${ungoverned.length} ungoverned.`,
  };
}

function isHighRiskRouter(file: string): boolean {
  const highRisk = [
    "providers/router", "secrets", "keyRotation", "deploy",
    "policies", "provider-connections", "catalog-manage", "catalog-import",
    "agents-promotions", "agents-control-plane",
  ];
  return highRisk.some((r) => file.includes(r));
}

function extractEndpointName(file: string, name: string): string {
  const router = path.basename(file, ".ts").replace("-router", "").replace("router", "");
  return `${router}.${name}`;
}
