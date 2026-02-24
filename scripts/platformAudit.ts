/**
 * Platform Audit Script
 *
 * Comprehensive platform health & compliance audit.
 * Checks: security headers, DB schema, governance coverage,
 * dependency health, file structure, and configuration.
 *
 * Usage:
 *   npx tsx scripts/platformAudit.ts [--format json|txt|both] [--strict]
 *
 * Output:
 *   audit-reports/platform-audit.json
 *   audit-reports/platform-audit.txt
 *
 * Exit code: 0 = passed, 1 = failed (violations found)
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// Types
// ============================================================================

interface AuditCheck {
  id: string;
  name: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  passed: boolean;
  message: string;
  details?: string;
}

interface AuditViolation {
  rule: string;
  name: string;
  severity: string;
  message: string;
  file?: string;
  line?: number;
}

interface AuditCoverageSection {
  name: string;
  checked: number;
  passed: number;
  coverage: number;
}

interface AuditReport {
  timestamp: string;
  passed: boolean;
  summary: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    score: number;
    severityCounts: Record<string, number>;
  };
  violations: AuditViolation[];
  coverage: {
    sections: AuditCoverageSection[];
    overallPercent: number;
  };
  checks: AuditCheck[];
}

// ============================================================================
// CLI Args
// ============================================================================

const args = process.argv.slice(2);
let format: "json" | "txt" | "both" = "json";
let strict = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--format" && args[i + 1]) {
    format = args[++i] as any;
  }
  if (args[i] === "--strict") {
    strict = true;
  }
}

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "audit-reports");

// ============================================================================
// Utility
// ============================================================================

function fileExists(p: string): boolean {
  return fs.existsSync(path.join(ROOT, p));
}

function readFile(p: string): string {
  const full = path.join(ROOT, p);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf-8") : "";
}

function globFiles(dir: string, ext: string): string[] {
  const results: string[] = [];
  const fullDir = path.join(ROOT, dir);
  if (!fs.existsSync(fullDir)) return results;

  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        results.push(path.relative(ROOT, full));
      }
    }
  }
  walk(fullDir);
  return results;
}

// ============================================================================
// Audit Checks
// ============================================================================

const checks: AuditCheck[] = [];

function check(id: string, name: string, category: string, severity: AuditCheck["severity"], test: () => { passed: boolean; message: string; details?: string }) {
  try {
    const result = test();
    checks.push({ id, name, category, severity, ...result });
  } catch (err: any) {
    checks.push({ id, name, category, severity, passed: false, message: `Check threw error: ${err.message}` });
  }
}

// ── Structure Checks ────────────────────────────────────────────────────

check("STR-001", "Package.json exists", "structure", "critical", () => ({
  passed: fileExists("package.json"),
  message: fileExists("package.json") ? "package.json found" : "package.json missing",
}));

check("STR-002", "TypeScript config exists", "structure", "critical", () => ({
  passed: fileExists("tsconfig.json"),
  message: fileExists("tsconfig.json") ? "tsconfig.json found" : "tsconfig.json missing",
}));

check("STR-003", "Drizzle schema exists", "structure", "critical", () => ({
  passed: fileExists("drizzle/schema.ts"),
  message: fileExists("drizzle/schema.ts") ? "Schema barrel found" : "drizzle/schema.ts missing",
}));

check("STR-004", "Server entry exists", "structure", "critical", () => ({
  passed: fileExists("server/_core/index.ts"),
  message: fileExists("server/_core/index.ts") ? "Server entry found" : "server/_core/index.ts missing",
}));

check("STR-005", "Client App.tsx exists", "structure", "high", () => ({
  passed: fileExists("client/src/App.tsx"),
  message: fileExists("client/src/App.tsx") ? "Client entry found" : "client/src/App.tsx missing",
}));

check("STR-006", "CLAUDE.md exists", "structure", "medium", () => ({
  passed: fileExists("CLAUDE.md"),
  message: fileExists("CLAUDE.md") ? "CLAUDE.md found" : "CLAUDE.md missing",
}));

// ── Security Checks ────────────────────────────────────────────────────

check("SEC-001", "Security headers configured", "security", "critical", () => {
  const content = readFile("server/_core/index.ts");
  const headers = ["X-Content-Type-Options", "X-Frame-Options", "Content-Security-Policy", "Referrer-Policy"];
  const found = headers.filter(h => content.includes(h));
  const missing = headers.filter(h => !content.includes(h));
  return {
    passed: missing.length === 0,
    message: missing.length === 0 ? `All ${headers.length} security headers present` : `Missing headers: ${missing.join(", ")}`,
    details: `Found: ${found.join(", ")}`,
  };
});

check("SEC-002", "CSRF protection enabled", "security", "critical", () => {
  const content = readFile("server/_core/index.ts");
  const has = content.includes("CSRF") || content.includes("csrf") || content.includes("Origin");
  return { passed: has, message: has ? "CSRF protection found" : "No CSRF protection detected" };
});

check("SEC-003", "Rate limiting configured", "security", "high", () => {
  const content = readFile("server/_core/index.ts");
  const has = content.includes("rate") || content.includes("Rate") || content.includes("429");
  return { passed: has, message: has ? "Rate limiting found" : "No rate limiting detected" };
});

check("SEC-004", "No hardcoded secrets in server code", "security", "critical", () => {
  const files = globFiles("server", ".ts");
  const violations: string[] = [];
  const secretPatterns = [/['"]sk-[a-zA-Z0-9]{20,}['"]/, /['"]AKIA[A-Z0-9]{16}['"]/, /password\s*=\s*['"][^'"]{8,}['"]/i];

  for (const f of files) {
    const content = readFile(f);
    for (const pat of secretPatterns) {
      if (pat.test(content)) {
        violations.push(f);
        break;
      }
    }
  }
  return {
    passed: violations.length === 0,
    message: violations.length === 0 ? "No hardcoded secrets found" : `Potential secrets in: ${violations.join(", ")}`,
  };
});

check("SEC-005", "x-powered-by disabled", "security", "medium", () => {
  const content = readFile("server/_core/index.ts");
  const has = content.includes('disable("x-powered-by")') || content.includes("x-powered-by");
  return { passed: has, message: has ? "x-powered-by disabled" : "x-powered-by header not disabled" };
});

check("SEC-006", "Encryption module exists", "security", "high", () => ({
  passed: fileExists("server/_core/encryption.ts"),
  message: fileExists("server/_core/encryption.ts") ? "Encryption module found" : "No encryption module",
}));

// ── Auth Checks ────────────────────────────────────────────────────────

check("AUTH-001", "Auth procedures defined", "auth", "critical", () => {
  const content = readFile("server/_core/trpc.ts");
  const procs = ["publicProcedure", "protectedProcedure", "adminProcedure"];
  const found = procs.filter(p => content.includes(p));
  return {
    passed: found.length === procs.length,
    message: `${found.length}/${procs.length} auth procedure levels defined`,
  };
});

check("AUTH-002", "OAuth routes registered", "auth", "high", () => {
  const content = readFile("server/_core/index.ts");
  const has = content.includes("registerOAuthRoutes") || content.includes("oauth");
  return { passed: has, message: has ? "OAuth routes registered" : "No OAuth routes found" };
});

// ── Governance Checks ──────────────────────────────────────────────────

check("GOV-001", "Governance engine exists", "governance", "critical", () => ({
  passed: fileExists("server/governance/governance-engine.ts"),
  message: fileExists("server/governance/governance-engine.ts") ? "Governance engine found" : "Governance engine missing",
}));

check("GOV-002", "Governance router exists", "governance", "critical", () => ({
  passed: fileExists("server/governance/router.ts"),
  message: fileExists("server/governance/router.ts") ? "Governance router found" : "Governance router missing",
}));

check("GOV-003", "Scorecard system exists", "governance", "high", () => {
  const exists = fileExists("server/governance/scorecard.ts") || fileExists("server/governance/runner.ts");
  return { passed: exists, message: exists ? "Scorecard system found" : "Scorecard system missing" };
});

check("GOV-004", "Artifact store exists", "governance", "high", () => ({
  passed: fileExists("server/governance/artifact-store.ts"),
  message: fileExists("server/governance/artifact-store.ts") ? "Artifact store found" : "Artifact store missing",
}));

check("GOV-005", "RBAC model exists", "governance", "high", () => ({
  passed: fileExists("server/governance/rbac-model.ts"),
  message: fileExists("server/governance/rbac-model.ts") ? "RBAC model found" : "RBAC model missing",
}));

check("GOV-006", "Drift detection exists", "governance", "medium", () => {
  const exists = fileExists("server/governance/drift-detector.ts");
  return { passed: exists, message: exists ? "Drift detection found" : "No drift detection" };
});

check("GOV-007", "Governed procedure middleware exists", "governance", "critical", () => {
  const content = readFile("server/_core/trpc.ts");
  const has = content.includes("governedProcedure");
  return { passed: has, message: has ? "Governed procedure middleware found" : "No governed procedure middleware" };
});

// ── Database Checks ────────────────────────────────────────────────────

check("DB-001", "Migration files exist", "database", "critical", () => {
  const migrations = globFiles("drizzle", ".sql");
  return {
    passed: migrations.length > 0,
    message: `${migrations.length} migration files found`,
  };
});

check("DB-002", "Drizzle journal exists", "database", "critical", () => ({
  passed: fileExists("drizzle/meta/_journal.json"),
  message: fileExists("drizzle/meta/_journal.json") ? "Migration journal found" : "Migration journal missing",
}));

check("DB-003", "Schema tables directory exists", "database", "high", () => {
  const tables = globFiles("drizzle/tables", ".ts");
  return {
    passed: tables.length > 0,
    message: `${tables.length} table definition files found`,
  };
});

// ── Dependency Checks ──────────────────────────────────────────────────

check("DEP-001", "No .env files committed", "dependencies", "critical", () => {
  const envFiles = [".env", ".env.local", ".env.production"];
  const found = envFiles.filter(f => fileExists(f));
  return {
    passed: found.length === 0,
    message: found.length === 0 ? "No .env files in repo" : `Found committed env files: ${found.join(", ")}`,
  };
});

check("DEP-002", ".gitignore exists", "dependencies", "medium", () => ({
  passed: fileExists(".gitignore"),
  message: fileExists(".gitignore") ? ".gitignore found" : ".gitignore missing",
}));

check("DEP-003", "Lock file exists", "dependencies", "high", () => {
  const has = fileExists("package-lock.json") || fileExists("pnpm-lock.yaml") || fileExists("yarn.lock");
  return { passed: has, message: has ? "Lock file found" : "No lock file found" };
});

// ── Frontend Checks ────────────────────────────────────────────────────

check("FE-001", "UI component library exists", "frontend", "medium", () => {
  const components = globFiles("client/src/components/ui", ".tsx");
  return {
    passed: components.length > 0,
    message: `${components.length} UI components found`,
  };
});

check("FE-002", "Page files exist", "frontend", "high", () => {
  const pages = globFiles("client/src/pages", ".tsx");
  return {
    passed: pages.length > 0,
    message: `${pages.length} page files found`,
  };
});

check("FE-003", "tRPC client configured", "frontend", "critical", () => ({
  passed: fileExists("client/src/lib/trpc.ts"),
  message: fileExists("client/src/lib/trpc.ts") ? "tRPC client configured" : "tRPC client missing",
}));

// ============================================================================
// Build Report
// ============================================================================

const failedChecks = checks.filter(c => !c.passed);
const violations: AuditViolation[] = failedChecks.map(c => ({
  rule: c.id,
  name: c.name,
  severity: c.severity,
  message: c.message,
  details: c.details,
}));

const severityCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
for (const v of violations) {
  severityCounts[v.severity] = (severityCounts[v.severity] || 0) + 1;
}

// Build coverage by category
const categories = [...new Set(checks.map(c => c.category))];
const coverageSections: AuditCoverageSection[] = categories.map(cat => {
  const catChecks = checks.filter(c => c.category === cat);
  const passed = catChecks.filter(c => c.passed).length;
  return {
    name: cat,
    checked: catChecks.length,
    passed,
    coverage: Math.round((passed / catChecks.length) * 100),
  };
});

const overallPercent = Math.round((checks.filter(c => c.passed).length / checks.length) * 100);

const hasCriticalFailures = severityCounts.critical > 0;
const passed = strict ? failedChecks.length === 0 : !hasCriticalFailures;

const report: AuditReport = {
  timestamp: new Date().toISOString(),
  passed,
  summary: {
    totalChecks: checks.length,
    passedChecks: checks.filter(c => c.passed).length,
    failedChecks: failedChecks.length,
    score: overallPercent,
    severityCounts,
  },
  violations,
  coverage: {
    sections: coverageSections,
    overallPercent,
  },
  checks,
};

// ============================================================================
// Write Output
// ============================================================================

if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

if (format === "json" || format === "both") {
  fs.writeFileSync(path.join(REPORT_DIR, "platform-audit.json"), JSON.stringify(report, null, 2));
}

if (format === "txt" || format === "both") {
  const lines: string[] = [];
  lines.push("=".repeat(70));
  lines.push("  PLATFORM AUDIT REPORT");
  lines.push(`  ${report.timestamp}`);
  lines.push("=".repeat(70));
  lines.push("");
  lines.push(`  Result: ${report.passed ? "PASSED" : "FAILED"}`);
  lines.push(`  Score:  ${report.summary.score}%`);
  lines.push(`  Checks: ${report.summary.passedChecks}/${report.summary.totalChecks} passed`);
  lines.push("");

  if (report.violations.length > 0) {
    lines.push("-".repeat(70));
    lines.push("  VIOLATIONS");
    lines.push("-".repeat(70));
    for (const v of report.violations) {
      lines.push(`  [${v.severity.toUpperCase()}] ${v.rule}: ${v.name}`);
      lines.push(`    ${v.message}`);
    }
    lines.push("");
  }

  lines.push("-".repeat(70));
  lines.push("  COVERAGE BY CATEGORY");
  lines.push("-".repeat(70));
  for (const s of report.coverage.sections) {
    lines.push(`  ${s.name.padEnd(20)} ${s.passed}/${s.checked} (${s.coverage}%)`);
  }
  lines.push("");
  lines.push("=".repeat(70));

  fs.writeFileSync(path.join(REPORT_DIR, "platform-audit.txt"), lines.join("\n"));
}

// Console output
console.log(`Platform Audit: ${report.passed ? "PASSED" : "FAILED"} — ${report.summary.score}% (${report.summary.passedChecks}/${report.summary.totalChecks})`);
if (report.violations.length > 0) {
  console.log(`Violations: ${report.violations.length} (critical: ${severityCounts.critical}, high: ${severityCounts.high})`);
}

// Exit code
process.exit(report.passed ? 0 : 1);
