/* scripts/platformAudit.ts
 *
 * MyNewAp1Claude — Platform Audit Script (complete)
 *
 * What it does:
 * - Pulls Governance Action Registry (tRPC) and performs sanity + policy checks
 * - Optionally checks DB tables if DATABASE_URL is provided
 * - Optionally checks local YAML catalogs (capabilities + role presets)
 * - Writes JSON/TXT reports for CI and admin review
 *
 * Outputs:
 *   audit-reports/platform-audit.json
 *   audit-reports/platform-audit.txt
 *
 * Usage:
 *   # Node 18+ (has global fetch)
 *   node scripts/platformAudit.ts --format=both --design=standard --baseUrl=https://...trycloudflare.com
 *
 *   # Strict mode (fails on any violation)
 *   node scripts/platformAudit.ts --strict --format=json --baseUrl=https://...
 *
 * Env:
 *   AUDIT_BASE_URL   (optional alternative to --baseUrl)
 *   DATABASE_URL     (optional enables DB checks)
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { URL } from "node:url";

type Format = "json" | "txt" | "both";
type Design = "executive" | "standard" | "forensics";

type Severity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type CheckStatus = "PASS" | "WARN" | "FAIL";

type AuditViolation = {
  id: string;
  severity: Severity;
  message: string;
  details?: Record<string, unknown>;
};

type AuditCheck = {
  id: string;
  title: string;
  status: CheckStatus;
  severity: Severity;
  message: string;
  violations?: AuditViolation[];
  details?: Record<string, unknown>;
};

type AuditReport = {
  meta: {
    runId: string;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    strict: boolean;
    design: Design;
    format: Format;
    baseUrl?: string;
    dbChecked: boolean;
    repoRoot: string;
    outDir: string;
    sha256: {
      json?: string;
      txt?: string;
    };
    version: number;
  };
  summary: {
    status: "PASS" | "FAIL";
    score: number; // 0-100
    countsBySeverity: Record<Severity, number>;
    checks: {
      total: number;
      pass: number;
      warn: number;
      fail: number;
    };
    topViolations: AuditViolation[];
  };
  checks: AuditCheck[];
  artifacts: {
    jsonPath?: string;
    txtPath?: string;
  };
};

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (const a of argv.slice(2)) {
    if (!a.startsWith("--")) continue;
    const [k, v] = a.slice(2).split("=");
    if (typeof v === "undefined") args[k] = true;
    else args[k] = v;
  }

  const format = (args.format as Format) || "both";
  const strict = Boolean(args.strict);
  const design = (args.design as Design) || "standard";
  const baseUrl = (args.baseUrl as string | undefined) || (process.env.AUDIT_BASE_URL || undefined);
  const outDir = (args.outDir as string | undefined) || path.join(process.cwd(), "audit-reports");

  const validFormats: Format[] = ["json", "txt", "both"];
  const validDesigns: Design[] = ["executive", "standard", "forensics"];

  if (!validFormats.includes(format)) {
    throw new Error(`Invalid --format=${String(format)} (allowed: ${validFormats.join(", ")})`);
  }
  if (!validDesigns.includes(design)) {
    throw new Error(`Invalid --design=${String(design)} (allowed: ${validDesigns.join(", ")})`);
  }

  return { format, strict, design, baseUrl, outDir };
}

function sha256(buf: Buffer | string) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function severityWeight(s: Severity): number {
  switch (s) {
    case "INFO":
      return 0;
    case "LOW":
      return 5;
    case "MEDIUM":
      return 15;
    case "HIGH":
      return 30;
    case "CRITICAL":
      return 50;
  }
}

/** --- YAML loader (uses js-yaml which is an installed dependency). --- */
async function loadYamlIfAvailable<T = any>(
  filePath: string
): Promise<{ ok: boolean; value?: T; error?: string }> {
  try {
    const jsYaml = await import("js-yaml");
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = jsYaml.load(raw) as T;
    return { ok: true, value: parsed };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/** --- HTTP fetch helper (Node 18+ has global fetch) --- */
async function safeFetchJson(
  url: string,
  timeoutMs = 15_000
): Promise<{ ok: boolean; status?: number; value?: any; error?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
      } as any,
    });

    const text = await res.text();
    clearTimeout(t);

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, status: res.status, error: `Non-JSON response (status ${res.status})` };
    }

    if (!res.ok) {
      return { ok: false, status: res.status, value: data, error: `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, value: data };
  } catch (e: any) {
    clearTimeout(t);
    return {
      ok: false,
      error: e?.name === "AbortError" ? "Timeout" : e?.message || String(e),
    };
  }
}

/** --- DB check helper (optional) --- */
async function tryDbQuery(sql: string): Promise<{ ok: boolean; rows?: any[]; error?: string }> {
  const url = process.env.DATABASE_URL;
  if (!url) return { ok: false, error: "DATABASE_URL not set" };

  try {
    const pgModule = await import("pg");
    const pg = pgModule.default || pgModule;
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    const res = await client.query(sql);
    await client.end();
    return { ok: true, rows: res.rows || [] };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/** --- Governance action registry parsing (tRPC response shape) --- */
function extractActionsFromTrpc(trpcJson: any): any[] {
  // Expected shape (based on your paste):
  // { result: { data: { json: { actions: [...], total: N } } } }
  const actions = trpcJson?.result?.data?.json?.actions;
  if (Array.isArray(actions)) return actions;

  // Alternate
  const alt = trpcJson?.result?.data?.actions;
  if (Array.isArray(alt)) return alt;

  return [];
}

/** --- Report rendering --- */
function renderTxt(report: AuditReport): string {
  const { meta, summary, checks } = report;

  const lines: string[] = [];
  const banner = summary.status === "PASS" ? "PASS" : "FAIL";

  lines.push(`MyNewAp1Claude — Platform Audit (${banner})`);
  lines.push(`RunId: ${meta.runId}`);
  lines.push(`Started: ${meta.startedAt}`);
  lines.push(`Finished: ${meta.finishedAt}`);
  lines.push(`Duration: ${meta.durationMs}ms`);
  lines.push(`Design: ${meta.design} | Strict: ${meta.strict} | Format: ${meta.format}`);
  if (meta.baseUrl) lines.push(`BaseUrl: ${meta.baseUrl}`);
  lines.push(`RepoRoot: ${meta.repoRoot}`);
  lines.push(`DB Checked: ${meta.dbChecked ? "yes" : "no"}`);
  lines.push("");

  lines.push(`Score: ${summary.score}/100`);
  lines.push(
    `Counts: INFO=${summary.countsBySeverity.INFO} LOW=${summary.countsBySeverity.LOW} MEDIUM=${summary.countsBySeverity.MEDIUM} HIGH=${summary.countsBySeverity.HIGH} CRITICAL=${summary.countsBySeverity.CRITICAL}`
  );
  lines.push(
    `Checks: total=${summary.checks.total} pass=${summary.checks.pass} warn=${summary.checks.warn} fail=${summary.checks.fail}`
  );
  lines.push("");

  if (meta.design === "executive") {
    lines.push("Top issues:");
    if (summary.topViolations.length === 0) {
      lines.push("  (none)");
    } else {
      for (const v of summary.topViolations.slice(0, 10)) {
        lines.push(`  - [${v.severity}] ${v.id}: ${v.message}`);
      }
    }
    lines.push("");
    lines.push("Checks (compact):");
    for (const c of checks) {
      lines.push(`  - ${c.status} [${c.severity}] ${c.id}: ${c.title}`);
    }
    return lines.join("\n");
  }

  lines.push("Checks:");
  for (const c of checks) {
    lines.push(`- ${c.id}: ${c.title}`);
    lines.push(`  Status: ${c.status} | Severity: ${c.severity}`);
    lines.push(`  ${c.message}`);
    if (c.violations && c.violations.length) {
      lines.push(`  Violations (${c.violations.length}):`);
      for (const v of c.violations.slice(0, meta.design === "forensics" ? 200 : 50)) {
        lines.push(`    - [${v.severity}] ${v.id}: ${v.message}`);
      }
      const cap = meta.design === "forensics" ? 200 : 50;
      if (c.violations.length > cap) {
        lines.push(`    ... (${c.violations.length - cap} more)`);
      }
    }
    lines.push("");
  }

  if (meta.design === "forensics") {
    lines.push("Artifacts:");
    if (report.artifacts.jsonPath) lines.push(`- JSON: ${report.artifacts.jsonPath}`);
    if (report.artifacts.txtPath) lines.push(`- TXT: ${report.artifacts.txtPath}`);
  }

  return lines.join("\n");
}

function requiredFieldViolation(id: string, field: string, action: any): AuditViolation {
  return {
    id,
    severity: "MEDIUM",
    message: `Action missing required field '${field}'`,
    details: { actionKey: action?.actionKey, domain: action?.domain },
  };
}

async function main() {
  const startedAtMs = Date.now();
  const runId = crypto.randomUUID();

  const { format, strict, design, baseUrl, outDir } = parseArgs(process.argv);
  const repoRoot = process.cwd();

  ensureDir(outDir);

  const checks: AuditCheck[] = [];
  const allViolations: AuditViolation[] = [];

  function pushCheck(c: AuditCheck) {
    checks.push(c);
    if (c.violations?.length) allViolations.push(...c.violations);
  }

  /** CHECK 1: Capabilities catalog presence + parse */
  {
    const id = "CATALOG_CAPABILITIES";
    const file = path.join(repoRoot, "config", "capabilities.yaml");
    if (!fs.existsSync(file)) {
      pushCheck({
        id,
        title: "Capabilities catalog exists",
        status: "FAIL",
        severity: "HIGH",
        message: `Missing ${path.relative(repoRoot, file)} (required for consistent RBAC).`,
        violations: [
          { id: "capabilities.missing", severity: "HIGH", message: "config/capabilities.yaml not found" },
        ],
      });
    } else {
      const loaded = await loadYamlIfAvailable<any>(file);
      if (!loaded.ok) {
        pushCheck({
          id,
          title: "Capabilities catalog parses",
          status: "WARN",
          severity: "MEDIUM",
          message: `Found ${path.relative(repoRoot, file)} but could not parse via 'yaml' package: ${loaded.error}`,
          violations: [
            {
              id: "capabilities.parse_failed",
              severity: "MEDIUM",
              message: "Could not parse capabilities.yaml (install 'yaml' or ensure valid YAML)",
              details: { error: loaded.error },
            },
          ],
        });
      } else {
        const caps = loaded.value?.capabilities;
        const count = Array.isArray(caps) ? caps.length : 0;
        const bad = Array.isArray(caps)
          ? caps.filter((c: any) => !c?.key || typeof c.key !== "string")
          : [];
        const v: AuditViolation[] = [];
        if (count === 0) v.push({ id: "capabilities.empty", severity: "MEDIUM", message: "capabilities.yaml has no capabilities[]" });
        if (bad.length) {
          v.push({
            id: "capabilities.invalid_entries",
            severity: "MEDIUM",
            message: `capabilities.yaml contains ${bad.length} entries missing 'key'`,
          });
        }
        pushCheck({
          id,
          title: "Capabilities catalog exists + basic integrity",
          status: v.length ? "WARN" : "PASS",
          severity: v.length ? "MEDIUM" : "INFO",
          message: v.length ? "Capabilities catalog present but has integrity warnings." : `OK (${count} capabilities).`,
          violations: v.length ? v : undefined,
          details: { count },
        });
      }
    }
  }

  /** CHECK 2: Workspace role presets presence */
  {
    const id = "CATALOG_ROLE_PRESETS";
    const file = path.join(repoRoot, "config", "workspace_role_presets.yaml");
    if (!fs.existsSync(file)) {
      pushCheck({
        id,
        title: "Workspace role presets exists",
        status: "WARN",
        severity: "MEDIUM",
        message: `Missing ${path.relative(repoRoot, file)}. Recommended for consistent bootstrap.`,
        violations: [
          { id: "rolePresets.missing", severity: "MEDIUM", message: "config/workspace_role_presets.yaml not found" },
        ],
      });
    } else {
      pushCheck({
        id,
        title: "Workspace role presets exists",
        status: "PASS",
        severity: "INFO",
        message: `OK (${path.relative(repoRoot, file)} present).`,
      });
    }
  }

  /** CHECK 3: Governance action registry reachable */
  let actions: any[] = [];
  if (!baseUrl) {
    pushCheck({
      id: "GOV_ACTION_REGISTRY",
      title: "Governance action registry reachable",
      status: "WARN",
      severity: "MEDIUM",
      message: "No baseUrl provided (use --baseUrl or AUDIT_BASE_URL). Skipping HTTP governance checks.",
      violations: [{ id: "governance.baseUrl.missing", severity: "MEDIUM", message: "No baseUrl configured" }],
    });
  } else {
    const url = new URL("/api/trpc/governance.actionRegistry", baseUrl).toString();
    const res = await safeFetchJson(url);
    if (!res.ok) {
      pushCheck({
        id: "GOV_ACTION_REGISTRY",
        title: "Governance action registry reachable",
        status: "FAIL",
        severity: "HIGH",
        message: `Failed to fetch governance.actionRegistry from ${url}: ${res.error || "unknown error"}`,
        violations: [
          {
            id: "governance.actionRegistry.unreachable",
            severity: "HIGH",
            message: "Governance action registry endpoint unreachable",
            details: { url, error: res.error, status: res.status, body: res.value },
          },
        ],
      });
    } else {
      actions = extractActionsFromTrpc(res.value);
      const total = actions.length;
      pushCheck({
        id: "GOV_ACTION_REGISTRY",
        title: "Governance action registry reachable",
        status: total > 0 ? "PASS" : "WARN",
        severity: total > 0 ? "INFO" : "MEDIUM",
        message: total > 0 ? `OK (${total} actions).` : "Fetched registry but no actions found (unexpected).",
        violations: total > 0 ? undefined : [{ id: "governance.actionRegistry.empty", severity: "MEDIUM", message: "Registry returned 0 actions" }],
        details: { total },
      });
    }
  }

  /** CHECK 4: Required engine domains present in registry */
  if (actions.length) {
    const id = "GOV_REQUIRED_DOMAINS";
    const requiredDomains = ["pmt", "knowledge", "agents", "collaboration", "reporting"];
    const presentDomains = new Set(actions.map((a) => a.domain).filter(Boolean));
    const missing = requiredDomains.filter((d) => !presentDomains.has(d));

    const v: AuditViolation[] = missing.map((d) => ({
      id: `governance.domain.missing.${d}`,
      severity: "HIGH",
      message: `Missing governance domain '${d}' in action registry`,
    }));

    pushCheck({
      id,
      title: "Required engine domains registered in Governance",
      status: missing.length ? "FAIL" : "PASS",
      severity: missing.length ? "HIGH" : "INFO",
      message: missing.length ? `Missing required domains: ${missing.join(", ")}` : `OK (${requiredDomains.join(", ")})`,
      violations: missing.length ? v : undefined,
      details: { requiredDomains, missing, presentDomains: Array.from(presentDomains).sort() },
    });
  }

  /** CHECK 5: Heuristic consistency: agents execute should not be weaker than request */
  if (actions.length) {
    const id = "GOV_AGENT_EXECUTE_CONSISTENCY";
    const find = (key: string) => actions.find((a) => a.actionKey === key);

    const req = find("agents.run.request");
    const exe = find("agents.run.execute");

    const v: AuditViolation[] = [];
    if (req && exe) {
      if (req.approvalRequired === true && exe.approvalRequired === false) {
        v.push({
          id: "agents.execute.approval_mismatch",
          severity: "MEDIUM",
          message:
            "Registry: agents.run.request requires approval but agents.run.execute does not. Ensure execute endpoint enforces an approved approval record (or governance conditions).",
          details: { request: req, execute: exe },
        });
      }
      // If execute risk lower than request, warn (string compare is ok for R1..R5)
      if (String(exe.risk || "") < String(req.risk || "")) {
        v.push({
          id: "agents.execute.risk_lower_than_request",
          severity: "MEDIUM",
          message: "Registry: agents.run.execute risk appears lower than agents.run.request (unexpected).",
          details: { requestRisk: req.risk, executeRisk: exe.risk },
        });
      }
    } else {
      if (!req) v.push({ id: "agents.run.request.missing", severity: "HIGH", message: "Missing agents.run.request in registry" });
      if (!exe) v.push({ id: "agents.run.execute.missing", severity: "HIGH", message: "Missing agents.run.execute in registry" });
    }

    pushCheck({
      id,
      title: "Agents run request/execute registry consistency",
      status: v.some((x) => x.severity === "HIGH") ? "FAIL" : v.length ? "WARN" : "PASS",
      severity: v.some((x) => x.severity === "HIGH") ? "HIGH" : v.length ? "MEDIUM" : "INFO",
      message: v.length ? "See violations." : "OK.",
      violations: v.length ? v : undefined,
    });
  }

  /** CHECK 6: Optional DB — confirm workspace_modules exists */
  let dbChecked = false;
  {
    const id = "DB_WORKSPACE_MODULES";
    const res = await tryDbQuery(`select to_regclass('public.workspace_modules') as table_name;`);
    if (!res.ok) {
      pushCheck({
        id,
        title: "DB check: workspace_modules table exists",
        status: "WARN",
        severity: "MEDIUM",
        message: `DB not checked: ${res.error}`,
        violations: [
          {
            id: "db.unavailable",
            severity: "MEDIUM",
            message: "DATABASE_URL missing or DB unreachable",
            details: { error: res.error },
          },
        ],
      });
    } else {
      dbChecked = true;
      const tname = res.rows?.[0]?.table_name;
      if (!tname) {
        pushCheck({
          id,
          title: "DB check: workspace_modules table exists",
          status: "FAIL",
          severity: "HIGH",
          message: "workspace_modules table not found in DB.",
          violations: [{ id: "db.workspace_modules.missing", severity: "HIGH", message: "workspace_modules table missing" }],
        });
      } else {
        pushCheck({
          id,
          title: "DB check: workspace_modules table exists",
          status: "PASS",
          severity: "INFO",
          message: "OK (workspace_modules exists).",
          details: { table: tname },
        });
      }
    }
  }

  /** CHECK 7: Optional DB — can read workspaces */
  if (dbChecked) {
    const id = "DB_WORKSPACES_READ";
    const res = await tryDbQuery(`select count(*)::int as c from workspaces;`);
    if (!res.ok) {
      pushCheck({
        id,
        title: "DB check: can read workspaces",
        status: "WARN",
        severity: "MEDIUM",
        message: `Could not query workspaces: ${res.error}`,
        violations: [
          {
            id: "db.workspaces.query_failed",
            severity: "MEDIUM",
            message: "Failed to query workspaces",
            details: { error: res.error },
          },
        ],
      });
    } else {
      const c = res.rows?.[0]?.c ?? null;
      pushCheck({
        id,
        title: "DB check: can read workspaces",
        status: "PASS",
        severity: "INFO",
        message: `OK (workspaces count: ${c}).`,
        details: { count: c },
      });
    }
  }

  /** CHECK 8: Registry sanity — detect duplicates + missing capability + required fields */
  if (actions.length) {
    const id = "GOV_REGISTRY_SANITY";
    const seen = new Map<string, number>();
    const duplicates: string[] = [];
    const missingCapability: any[] = [];
    const v: AuditViolation[] = [];

    for (const a of actions) {
      const k = String(a.actionKey || "");
      if (!k) {
        v.push(requiredFieldViolation("governance.registry.missing_actionKey", "actionKey", a));
        continue;
      }

      const n = (seen.get(k) || 0) + 1;
      seen.set(k, n);
      if (n === 2) duplicates.push(k);

      if (!a.domain || typeof a.domain !== "string") {
        v.push(requiredFieldViolation("governance.registry.missing_domain", "domain", a));
      }
      if (!a.capability || typeof a.capability !== "string") {
        missingCapability.push({ actionKey: a.actionKey, domain: a.domain });
      }
      if (!a.risk || typeof a.risk !== "string") {
        v.push(requiredFieldViolation("governance.registry.missing_risk", "risk", a));
      }
      if (typeof a.approvalRequired !== "boolean") {
        v.push(requiredFieldViolation("governance.registry.missing_approvalRequired", "approvalRequired", a));
      }
      if (typeof a.evidenceRequired !== "boolean") {
        v.push(requiredFieldViolation("governance.registry.missing_evidenceRequired", "evidenceRequired", a));
      }
      if (!Array.isArray(a.evidenceTypes)) {
        v.push(requiredFieldViolation("governance.registry.missing_evidenceTypes", "evidenceTypes[]", a));
      }
    }

    if (duplicates.length) {
      v.push({
        id: "governance.registry.duplicate_actionKey",
        severity: "HIGH",
        message: `Duplicate actionKey(s): ${duplicates.slice(0, 20).join(", ")}${duplicates.length > 20 ? "..." : ""}`,
        details: { duplicatesCount: duplicates.length },
      });
    }

    if (missingCapability.length) {
      v.push({
        id: "governance.registry.missing_capability",
        severity: "MEDIUM",
        message: `Actions missing capability mapping: ${missingCapability.length}`,
        details: { sample: missingCapability.slice(0, 25) },
      });
    }

    pushCheck({
      id,
      title: "Governance registry sanity",
      status: v.some((x) => x.severity === "HIGH") ? "FAIL" : v.length ? "WARN" : "PASS",
      severity: v.some((x) => x.severity === "HIGH") ? "HIGH" : v.length ? "MEDIUM" : "INFO",
      message: v.length ? "Registry has issues (see violations)." : "OK.",
      violations: v.length ? v : undefined,
      details: { total: actions.length, unique: seen.size },
    });
  }

  /** CHECK 9: Registry policy heuristic — high risks should tend to have approvals/evidence */
  if (actions.length) {
    const id = "GOV_POLICY_HEURISTICS";
    const v: AuditViolation[] = [];

    const highish = actions.filter((a) => String(a.risk) === "R4" || String(a.risk) === "R5");
    const suspicious = highish.filter(
      (a) => a.approvalRequired !== true && a.evidenceRequired !== true
    );

    if (suspicious.length) {
      v.push({
        id: "governance.policy.r4_r5_without_controls",
        severity: "MEDIUM",
        message: `Found ${suspicious.length} R4/R5 actions with neither approvalRequired nor evidenceRequired. Verify these are safe exceptions.`,
        details: { sample: suspicious.slice(0, 30).map((a) => ({ actionKey: a.actionKey, domain: a.domain, risk: a.risk })) },
      });
    }

    pushCheck({
      id,
      title: "Governance policy heuristics (R4/R5 expectations)",
      status: v.length ? "WARN" : "PASS",
      severity: v.length ? "MEDIUM" : "INFO",
      message: v.length ? "Heuristic warnings detected (review exceptions)." : "OK.",
      violations: v.length ? v : undefined,
      details: { r4r5Count: highish.length, suspiciousCount: suspicious.length },
    });
  }

  /** Summary + scoring */
  const countsBySeverity: Record<Severity, number> = { INFO: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const v of allViolations) countsBySeverity[v.severity]++;

  const hasHighOrCritical = allViolations.some((v) => v.severity === "HIGH" || v.severity === "CRITICAL");
  const strictFail = strict && allViolations.length > 0;
  const fail = strictFail || hasHighOrCritical;

  const penalty = allViolations.reduce((acc, v) => acc + severityWeight(v.severity), 0);
  const score = clamp(100 - penalty, 0, 100);

  const passCount = checks.filter((c) => c.status === "PASS").length;
  const warnCount = checks.filter((c) => c.status === "WARN").length;
  const failCount = checks.filter((c) => c.status === "FAIL").length;

  const topViolations = [...allViolations]
    .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
    .slice(0, 10);

  const finishedAtMs = Date.now();

  const report: AuditReport = {
    meta: {
      runId,
      startedAt: new Date(startedAtMs).toISOString(),
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: finishedAtMs - startedAtMs,
      strict,
      design,
      format,
      baseUrl,
      dbChecked,
      repoRoot,
      outDir,
      sha256: {},
      version: 1,
    },
    summary: {
      status: fail ? "FAIL" : "PASS",
      score,
      countsBySeverity,
      checks: { total: checks.length, pass: passCount, warn: warnCount, fail: failCount },
      topViolations,
    },
    checks,
    artifacts: {},
  };

  const jsonPath = path.join(outDir, "platform-audit.json");
  const txtPath = path.join(outDir, "platform-audit.txt");

  // Write outputs
  if (format === "json" || format === "both") {
    const json = JSON.stringify(report, null, 2);
    fs.writeFileSync(jsonPath, json, "utf8");
    report.artifacts.jsonPath = jsonPath;
    report.meta.sha256.json = sha256(json);
  }

  if (format === "txt" || format === "both") {
    const txt = renderTxt(report);
    fs.writeFileSync(txtPath, txt, "utf8");
    report.artifacts.txtPath = txtPath;
    report.meta.sha256.txt = sha256(txt);
  }

  // Rewrite JSON so the final JSON includes sha256 + artifacts paths
  if (format === "json" || format === "both") {
    const finalJson = JSON.stringify(report, null, 2);
    fs.writeFileSync(jsonPath, finalJson, "utf8");
    report.meta.sha256.json = sha256(finalJson);
  }

  // CI-friendly console output
  const statusEmoji = report.summary.status === "PASS" ? "✅" : "❌";
  console.log(
    `${statusEmoji} Platform Audit ${report.summary.status} — score ${report.summary.score}/100 — checks: ${passCount} pass, ${warnCount} warn, ${failCount} fail — violations: HIGH=${countsBySeverity.HIGH}, CRITICAL=${countsBySeverity.CRITICAL}`
  );
  if (report.artifacts.jsonPath) console.log(`JSON: ${report.artifacts.jsonPath}`);
  if (report.artifacts.txtPath) console.log(`TXT: ${report.artifacts.txtPath}`);

  // Exit codes
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("❌ Platform Audit ERROR:", e?.stack || e);
  process.exit(1);
});
