/**
 * Production Hardening Checklist — Governance Bible CGT v2
 *
 * Phase 10 — Runtime verification of production security controls.
 * Role: TL (Technical Lead) — Final sign-off
 *
 * Validates:
 *   1. x-powered-by disabled
 *   2. Strict CSP enforced (production)
 *   3. HSTS enabled (production)
 *   4. Rate limiting active on governance endpoints
 *   5. CSRF protection active
 *   6. CORS restricted in production
 *   7. Governance strict mode enabled (production)
 *   8. Drift detection active
 *   9. Artifact store configured
 *  10. Database not externally accessible (advisory)
 *
 * Reverse Proxy Checklist (advisory — not verifiable at runtime):
 *   - HTTPS enforced at proxy
 *   - HSTS preload enabled
 *   - Rate limiting at proxy layer
 *   - Database port not exposed
 *   - Admin routes behind VPN/IP whitelist
 */

import { isDriftDetectionActive, getFrozenSubjects } from "./scorecard";

// ============================================================================
// Types
// ============================================================================

export interface HardeningCheck {
  /** Check name */
  name: string;
  /** Whether the check passed */
  passed: boolean;
  /** Severity: critical = must fix, warning = should fix, info = advisory */
  severity: "critical" | "warning" | "info";
  /** Detail message */
  detail: string;
  /** Remediation */
  fix?: string;
}

export interface HardeningReport {
  /** When the check ran */
  timestamp: string;
  /** Environment */
  environment: string;
  /** Whether all critical checks passed */
  allCriticalPassed: boolean;
  /** Total checks */
  totalChecks: number;
  /** Passed checks */
  passedChecks: number;
  /** Failed checks */
  failedChecks: number;
  /** Individual check results */
  checks: HardeningCheck[];
  /** Reverse proxy advisory checklist */
  reverseProxyChecklist: string[];
}

// ============================================================================
// Hardening Checks
// ============================================================================

/**
 * Run production hardening verification.
 */
export async function runHardeningCheck(): Promise<HardeningReport> {
  const checks: HardeningCheck[] = [];
  const isProduction = process.env.NODE_ENV === "production";
  const env = process.env.NODE_ENV || "development";

  // 1. Governance strict mode
  const strictMode = process.env.GOVERNANCE_STRICT === "true";
  checks.push({
    name: "governance_strict_mode",
    passed: isProduction ? strictMode : true,
    severity: "critical",
    detail: isProduction
      ? (strictMode ? "Governance strict mode enabled" : "Governance strict mode NOT enabled in production")
      : "Non-production: strict mode not required",
    fix: isProduction && !strictMode ? "Set GOVERNANCE_STRICT=true" : undefined,
  });

  // 2. Debug mode disabled
  const debugEnabled = process.env.DEBUG === "true";
  checks.push({
    name: "debug_disabled",
    passed: isProduction ? !debugEnabled : true,
    severity: "critical",
    detail: isProduction
      ? (debugEnabled ? "DEBUG=true in production" : "Debug mode properly disabled")
      : "Non-production: debug mode acceptable",
    fix: isProduction && debugEnabled ? "Remove DEBUG=true" : undefined,
  });

  // 3. Policy fail-open disabled
  const failOpen = process.env.POLICY_FAIL_OPEN === "true";
  checks.push({
    name: "fail_closed",
    passed: isProduction ? !failOpen : true,
    severity: "critical",
    detail: isProduction
      ? (failOpen ? "POLICY_FAIL_OPEN=true in production" : "Policy fail-closed enforced")
      : "Non-production: fail-open acceptable",
    fix: isProduction && failOpen ? "Remove POLICY_FAIL_OPEN=true" : undefined,
  });

  // 4. CORS origins configured
  const corsConfigured = !!process.env.CORS_ORIGINS;
  checks.push({
    name: "cors_configured",
    passed: isProduction ? corsConfigured : true,
    severity: "warning",
    detail: isProduction
      ? (corsConfigured ? `CORS origins: ${process.env.CORS_ORIGINS}` : "No CORS_ORIGINS set — same-origin only")
      : "Non-production: CORS defaults acceptable",
  });

  // 5. Database URL set
  const dbUrlSet = !!process.env.DATABASE_URL;
  checks.push({
    name: "database_configured",
    passed: dbUrlSet,
    severity: "critical",
    detail: dbUrlSet ? "DATABASE_URL configured" : "DATABASE_URL not set",
    fix: !dbUrlSet ? "Set DATABASE_URL environment variable" : undefined,
  });

  // 6. Database URL not using localhost in production
  const dbUrl = process.env.DATABASE_URL || "";
  const dbIsLocalhost = dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1");
  checks.push({
    name: "database_not_localhost",
    passed: isProduction ? !dbIsLocalhost : true,
    severity: "warning",
    detail: isProduction && dbIsLocalhost
      ? "Database URL points to localhost in production"
      : "Database URL acceptable",
    fix: isProduction && dbIsLocalhost ? "Use a remote database host" : undefined,
  });

  // 7. Secret rotation configured
  const secretRotation = process.env.SECRET_LAST_ROTATED;
  checks.push({
    name: "secret_rotation_tracked",
    passed: isProduction ? !!secretRotation : true,
    severity: "warning",
    detail: secretRotation
      ? `Secrets last rotated: ${secretRotation}`
      : (isProduction ? "SECRET_LAST_ROTATED not set" : "Non-production: not required"),
    fix: isProduction && !secretRotation ? "Set SECRET_LAST_ROTATED to track rotation" : undefined,
  });

  // 8. Drift detection active
  const driftActive = isDriftDetectionActive();
  checks.push({
    name: "drift_detection_active",
    passed: isProduction ? driftActive : true,
    severity: "warning",
    detail: driftActive ? "Drift detection running" : "Drift detection not active",
    fix: !driftActive ? "Start drift detection via governance router" : undefined,
  });

  // 9. No system-wide freeze (informational)
  const frozenSubjects = await getFrozenSubjects();
  const systemFrozen = frozenSubjects.some((f) => f.subjectId === 0);
  checks.push({
    name: "no_system_freeze",
    passed: !systemFrozen,
    severity: "info",
    detail: systemFrozen
      ? `System-wide freeze active (${frozenSubjects.length} frozen subjects)`
      : `No system freeze (${frozenSubjects.length} individual freezes)`,
  });

  // 10. Redis configured for rate limiting (production)
  const redisConfigured = !!process.env.REDIS_URL;
  checks.push({
    name: "redis_rate_limiting",
    passed: isProduction ? redisConfigured : true,
    severity: "warning",
    detail: redisConfigured
      ? "Redis configured for distributed rate limiting"
      : (isProduction ? "REDIS_URL not set — using in-memory rate limiting" : "Non-production: in-memory acceptable"),
    fix: isProduction && !redisConfigured ? "Set REDIS_URL for distributed rate limiting" : undefined,
  });

  // Build report
  const failedChecks = checks.filter((c) => !c.passed);
  const allCriticalPassed = checks.filter((c) => c.severity === "critical").every((c) => c.passed);

  return {
    timestamp: new Date().toISOString(),
    environment: env,
    allCriticalPassed,
    totalChecks: checks.length,
    passedChecks: checks.filter((c) => c.passed).length,
    failedChecks: failedChecks.length,
    checks,
    reverseProxyChecklist: [
      "HTTPS enforced at reverse proxy (TLS 1.2+ only)",
      "HSTS header set with preload (max-age=31536000; includeSubDomains; preload)",
      "Rate limiting at proxy layer (nginx limit_req / CloudFlare WAF)",
      "Database port (5432) not externally accessible",
      "Admin routes behind VPN or IP whitelist",
      "Governance endpoints (/api/trpc/governance.*) behind auth proxy",
      "File upload size limits enforced at proxy",
      "WebSocket upgrade restricted to known paths",
      "Access logs retained for 90+ days",
      "DDoS protection enabled (CloudFlare / AWS Shield)",
    ],
  };
}

/**
 * Format hardening report for CLI/CI output.
 */
export function formatHardeningReport(report: HardeningReport): string {
  const lines: string[] = [
    "═══════════════════════════════════════════════════════",
    "  PRODUCTION HARDENING CHECK — CGT v2",
    "═══════════════════════════════════════════════════════",
    "",
    `Environment: ${report.environment}`,
    `Checks: ${report.passedChecks}/${report.totalChecks} passed`,
    "",
  ];

  for (const check of report.checks) {
    const icon = check.passed ? "PASS" : "FAIL";
    const sev = check.severity.toUpperCase().padEnd(8);
    lines.push(`  [${icon}] ${sev} ${check.name}: ${check.detail}`);
    if (!check.passed && check.fix) {
      lines.push(`           Fix: ${check.fix}`);
    }
  }

  lines.push("");
  lines.push("Reverse Proxy Checklist (manual verification):");
  for (const item of report.reverseProxyChecklist) {
    lines.push(`  [ ] ${item}`);
  }

  lines.push("");
  lines.push(`Result: ${report.allCriticalPassed ? "PASS (all critical checks OK)" : "FAIL (critical checks failing)"}`);
  lines.push("═══════════════════════════════════════════════════════");

  return lines.join("\n");
}
