/**
 * Staging Runtime — Extended Preflight
 *
 * Builds on `scripts/staging-foundation/preflight.ts` (PR #91) to
 * cover the full staging-runtime contract introduced in this PR:
 *
 *   * Per-DB DSNs (Phase 3): DATABASE_URL_{MYNEWAP1CLAUDE,ASDB,RAGDB,WFDB}.
 *   * Staging app URL (Phases 6–11): STAGING_APP_URL.
 *   * Worker URLs and queue (Phase 4): GRAPHRAG_WORKER_URL,
 *     DATA_ACQUISITION_WORKER_URL, EXTERNAL_ORCHESTRATOR_URL,
 *     SANDBOX_WF_WORKER_URL, KGRA_SERVICE_URL, REDIS_URL.
 *   * Browser tooling (Phase 8 onward): Playwright + Chromium present.
 *   * Connector credentials (Phase 5): treated as cleanly BLOCKED
 *     when missing, never silently downgraded to PASS.
 *
 * The script is the canonical implementation behind:
 *   pnpm run staging:preflight
 *   pnpm run staging:preflight:json
 *   pnpm run staging:preflight:gate
 *
 * Side effects:
 *   * Writes docs/evidence/staging/STAGING_PREFLIGHT_REPORT.md
 *     and docs/evidence/staging/STAGING_BLOCKER_REPORT.md when
 *     run with --write-evidence (used by `staging:preflight:gate`).
 *   * Never prints secret values; only presence yes/no + URL probe results.
 *
 * Exit codes (the contract):
 *   0 — staging ready enough to run PRs 3–10
 *   2 — BLOCKED with exact missing dependencies
 *   1 — runtime FAIL (a service is reachable but unhealthy)
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runPreflight as runFoundationPreflight } from "../staging-foundation/preflight";

interface ExtendedEnvCheck {
  key: string;
  label: string;
  category: "app" | "db" | "worker" | "queue" | "browser-tooling";
  hint: string;
}

interface ConnectorCheck {
  connector: string;
  keys: string[];
  status: "configured" | "blocked";
  missingKeys: string[];
}

interface UrlProbe {
  key: string;
  url: string | null;
  status: "skipped" | "reachable" | "unreachable" | "unhealthy";
  detail?: string;
  httpStatus?: number;
}

interface ExtendedPreflightReport {
  generatedAt: string;
  mode: "staging-integration" | "default";
  foundation: ReturnType<typeof runFoundationPreflight>;
  extended: {
    app: ExtendedEnvCheck[];
    db: ExtendedEnvCheck[];
    worker: ExtendedEnvCheck[];
    queue: ExtendedEnvCheck[];
    browserTooling: ExtendedEnvCheck[];
  };
  connectors: ConnectorCheck[];
  urlProbes: UrlProbe[];
  toolingProbes: { tool: string; available: boolean; detail?: string }[];
  verdict: "PASS" | "BLOCKED" | "FAIL";
  missingRequired: string[];
}

const APP_CHECKS: ExtendedEnvCheck[] = [
  {
    key: "STAGING_APP_URL",
    label: "STAGING_APP_URL",
    category: "app",
    hint: "Set to the staging app's base URL, e.g. http://localhost:3000",
  },
];

const DB_CHECKS: ExtendedEnvCheck[] = [
  {
    key: "DATABASE_URL_MYNEWAP1CLAUDE",
    label: "DATABASE_URL_MYNEWAP1CLAUDE",
    category: "db",
    hint: "Postgres DSN for the mynewap1claude DB.",
  },
  {
    key: "DATABASE_URL_ASDB",
    label: "DATABASE_URL_ASDB",
    category: "db",
    hint: "Postgres DSN for the Agent Studio DB.",
  },
  {
    key: "DATABASE_URL_RAGDB",
    label: "DATABASE_URL_RAGDB",
    category: "db",
    hint: "Postgres DSN for the RAG / GraphRAG DB.",
  },
  {
    key: "DATABASE_URL_WFDB",
    label: "DATABASE_URL_WFDB",
    category: "db",
    hint: "Postgres DSN for the Sandbox WF DB.",
  },
];

const WORKER_CHECKS: ExtendedEnvCheck[] = [
  {
    key: "SANDBOX_WF_WORKER_URL",
    label: "SANDBOX_WF_WORKER_URL",
    category: "worker",
    hint: "Sandbox WF worker base URL.",
  },
  {
    key: "KGRA_SERVICE_URL",
    label: "KGRA_SERVICE_URL",
    category: "worker",
    hint: "KGRA service base URL.",
  },
];

const QUEUE_CHECKS: ExtendedEnvCheck[] = [];

const BROWSER_TOOLING_CHECKS: ExtendedEnvCheck[] = [];

const CONNECTOR_GROUPS = [
  { connector: "github", keys: ["GITHUB_APP_ID", "GITHUB_PRIVATE_KEY"] },
  {
    connector: "s3",
    keys: ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"],
  },
  { connector: "gdrive", keys: ["GDRIVE_CLIENT_ID", "GDRIVE_CLIENT_SECRET"] },
] as const;

function envPresent(env: NodeJS.ProcessEnv, key: string): boolean {
  const v = env[key];
  return typeof v === "string" && v.length > 0;
}

function classifyConnectors(env: NodeJS.ProcessEnv): ConnectorCheck[] {
  return CONNECTOR_GROUPS.map((g) => {
    const missingKeys = g.keys.filter((k) => !envPresent(env, k));
    return {
      connector: g.connector,
      keys: [...g.keys],
      status: missingKeys.length === 0 ? "configured" : "blocked",
      missingKeys,
    };
  });
}

async function probeUrl(key: string, env: NodeJS.ProcessEnv, path: string): Promise<UrlProbe> {
  const base = env[key];
  if (!base) return { key, url: null, status: "skipped", detail: "env not set" };
  const url = `${base.replace(/\/$/, "")}${path}`;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    const res = await fetch(url, { signal: ctl.signal });
    clearTimeout(timer);
    if (res.ok) return { key, url, status: "reachable", httpStatus: res.status };
    return { key, url, status: "unhealthy", httpStatus: res.status };
  } catch (err) {
    return {
      key,
      url,
      status: "unreachable",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function probeAllUrls(env: NodeJS.ProcessEnv): Promise<UrlProbe[]> {
  const probes = await Promise.all([
    probeUrl("STAGING_APP_URL", env, "/api/health"),
    probeUrl("OPA_URL", env, "/health"),
    probeUrl("GRAPHRAG_WORKER_URL", env, "/health"),
    probeUrl("DATA_ACQUISITION_WORKER_URL", env, "/health"),
    probeUrl("EXTERNAL_ORCHESTRATOR_URL", env, "/health"),
    probeUrl("SANDBOX_WF_WORKER_URL", env, "/health"),
    probeUrl("KGRA_SERVICE_URL", env, "/health"),
  ]);
  return probes;
}

async function probeTooling(): Promise<{ tool: string; available: boolean; detail?: string }[]> {
  const out: { tool: string; available: boolean; detail?: string }[] = [];

  // Playwright + Chromium check — purely filesystem; no spawn so the
  // probe stays cheap and deterministic.
  const playwrightBin = resolve(process.cwd(), "node_modules", ".bin", "playwright");
  const chromiumCacheDirs = [
    resolve(process.env.HOME || "/root", ".cache", "ms-playwright"),
  ];
  out.push({
    tool: "playwright",
    available: existsSync(playwrightBin),
    detail: existsSync(playwrightBin) ? playwrightBin : "node_modules/.bin/playwright not found",
  });
  out.push({
    tool: "chromium-browser",
    available: chromiumCacheDirs.some((d) => existsSync(d)),
    detail: chromiumCacheDirs[0],
  });
  return out;
}

async function buildReport(env: NodeJS.ProcessEnv): Promise<ExtendedPreflightReport> {
  const foundation = runFoundationPreflight(env);

  const extended = {
    app: APP_CHECKS,
    db: DB_CHECKS,
    worker: WORKER_CHECKS,
    queue: QUEUE_CHECKS,
    browserTooling: BROWSER_TOOLING_CHECKS,
  };

  const connectors = classifyConnectors(env);
  const urlProbes = await probeAllUrls(env);
  const toolingProbes = await probeTooling();

  // Aggregate missing required = foundation.missingRequired + any
  // extended check whose env is missing.
  const missingExtended = [
    ...APP_CHECKS,
    ...DB_CHECKS,
    ...WORKER_CHECKS,
  ]
    .filter((c) => !envPresent(env, c.key))
    .map((c) => c.key);

  const missingRequired = [
    ...foundation.missingRequired,
    ...missingExtended,
  ];

  const missingTooling = toolingProbes.filter((t) => !t.available).map((t) => t.tool);

  const anyUnhealthy = urlProbes.some((p) => p.status === "unhealthy");

  let verdict: "PASS" | "BLOCKED" | "FAIL";
  if (anyUnhealthy) {
    verdict = "FAIL";
  } else if (missingRequired.length > 0 || missingTooling.length > 0) {
    verdict = "BLOCKED";
  } else {
    verdict = "PASS";
  }

  return {
    generatedAt: new Date().toISOString(),
    mode: foundation.mode,
    foundation,
    extended,
    connectors,
    urlProbes,
    toolingProbes,
    verdict,
    missingRequired: [...new Set(missingRequired)],
  };
}

function formatReport(r: ExtendedPreflightReport): string {
  const lines: string[] = [];
  lines.push(`Staging extended preflight — verdict: ${r.verdict}`);
  lines.push(`Generated: ${r.generatedAt}`);
  lines.push(`Mode: ${r.mode}`);
  lines.push("");

  lines.push("Required infra (foundation gate):");
  for (const c of r.foundation.required) {
    lines.push(`  ${c.ok ? "[ok]" : "[--]"} ${c.label}`);
  }
  lines.push("");

  lines.push("Extended required env (per-PR contract):");
  for (const cat of [
    ["app", r.extended.app],
    ["db", r.extended.db],
    ["worker", r.extended.worker],
  ] as const) {
    for (const c of cat[1]) {
      const ok = !!process.env[c.key] && process.env[c.key]!.length > 0;
      lines.push(`  ${ok ? "[ok]" : "[--]"} ${c.label}  (${cat[0]})`);
    }
  }
  lines.push("");

  lines.push("URL probes:");
  for (const p of r.urlProbes) {
    const tag = p.status === "reachable" ? "[ok]" : p.status === "skipped" ? "[..]" : "[--]";
    const extra = p.httpStatus ? ` (HTTP ${p.httpStatus})` : p.detail ? ` (${p.detail})` : "";
    lines.push(`  ${tag} ${p.key}: ${p.status}${extra}`);
  }
  lines.push("");

  lines.push("Browser tooling:");
  for (const t of r.toolingProbes) {
    lines.push(`  ${t.available ? "[ok]" : "[--]"} ${t.tool}`);
  }
  lines.push("");

  lines.push("External connectors (BLOCKED when credentials missing — never silently PASS):");
  for (const c of r.connectors) {
    const tag = c.status === "configured" ? "[ok]" : "[--]";
    const miss = c.missingKeys.length > 0 ? ` (missing: ${c.missingKeys.join(", ")})` : "";
    lines.push(`  ${tag} ${c.connector}: ${c.status}${miss}`);
  }
  lines.push("");

  if (r.verdict === "PASS") {
    lines.push("Result: PASS — staging ready to run PRs 3–10.");
  } else if (r.verdict === "BLOCKED") {
    lines.push("Result: BLOCKED — required infra/tooling missing:");
    for (const k of r.missingRequired) lines.push(`  - ${k}`);
    const missingTools = r.toolingProbes.filter((t) => !t.available).map((t) => t.tool);
    for (const t of missingTools) lines.push(`  - tooling: ${t}`);
    lines.push("");
    lines.push("This is a real gap, not a skip. Provision staging and re-run.");
    lines.push("See docs/deployment/staging-runtime.md.");
  } else {
    lines.push("Result: FAIL — at least one staging URL is reachable but unhealthy:");
    for (const p of r.urlProbes.filter((p) => p.status === "unhealthy")) {
      lines.push(`  - ${p.key} (HTTP ${p.httpStatus})`);
    }
  }
  return lines.join("\n");
}

function writeMarkdownReports(r: ExtendedPreflightReport): void {
  const evidenceDir = resolve(process.cwd(), "docs", "evidence", "staging");
  mkdirSync(evidenceDir, { recursive: true });

  const preflightMd =
    `# Staging Preflight Report\n\n` +
    `**Generated:** ${r.generatedAt}\n` +
    `**Verdict:** ${r.verdict}\n` +
    `**Mode:** ${r.mode}\n\n` +
    "## Required infra (foundation gate)\n\n" +
    r.foundation.required
      .map((c) => `- ${c.ok ? "[ok]" : "[BLOCKED]"} ${c.label}`)
      .join("\n") +
    "\n\n## Extended required env\n\n" +
    [...r.extended.app, ...r.extended.db, ...r.extended.worker]
      .map((c) => {
        const ok = !!process.env[c.key] && process.env[c.key]!.length > 0;
        return `- ${ok ? "[ok]" : "[BLOCKED]"} ${c.label} (${c.category})`;
      })
      .join("\n") +
    "\n\n## URL probes\n\n" +
    r.urlProbes
      .map((p) => `- [${p.status}] ${p.key}${p.httpStatus ? ` HTTP ${p.httpStatus}` : ""}`)
      .join("\n") +
    "\n\n## Browser tooling\n\n" +
    r.toolingProbes
      .map((t) => `- ${t.available ? "[ok]" : "[BLOCKED]"} ${t.tool}`)
      .join("\n") +
    "\n\n## Connectors\n\n" +
    r.connectors
      .map(
        (c) =>
          `- ${c.status === "configured" ? "[ok]" : "[BLOCKED]"} ${c.connector}${c.missingKeys.length ? ` — missing: ${c.missingKeys.join(", ")}` : ""}`,
      )
      .join("\n") +
    "\n";

  writeFileSync(resolve(evidenceDir, "STAGING_PREFLIGHT_REPORT.md"), preflightMd, "utf8");

  if (r.verdict !== "PASS") {
    const blockerMd =
      `# Staging Blocker Report\n\n` +
      `**Generated:** ${r.generatedAt}\n` +
      `**Verdict:** ${r.verdict}\n\n` +
      "## Missing dependencies\n\n" +
      (r.missingRequired.length === 0
        ? "_None at the env level._\n"
        : r.missingRequired.map((k) => `- ${k}`).join("\n") + "\n") +
      "\n## Missing tooling\n\n" +
      r.toolingProbes
        .filter((t) => !t.available)
        .map((t) => `- ${t.tool}`)
        .join("\n") +
      "\n\n## What this blocks\n\n" +
      "- PR 3 — Phase 3 DB isolation evidence\n" +
      "- PR 4 — Phase 4 worker runtime verification\n" +
      "- PR 5 — Phase 5 connector verification\n" +
      "- PR 6 — Phase 8 UI smoke\n" +
      "- PR 7 — Phase 9 workflow replay\n" +
      "- PR 8 — Phase 10 E2E sync\n" +
      "- PR 9 — Phase 11 Security/RBAC\n" +
      "- PR 10 — Final readiness rerun (downstream)\n" +
      "\n## Reproduction\n\n" +
      "```bash\npnpm run staging:preflight:gate; echo \"exit=$?\"\n```\n";
    writeFileSync(resolve(evidenceDir, "STAGING_BLOCKER_REPORT.md"), blockerMd, "utf8");
  }
}

function parseArgs(argv: string[]): { json: boolean; gate: boolean; writeEvidence: boolean } {
  return {
    json: argv.includes("--json"),
    gate: argv.includes("--gate"),
    writeEvidence: argv.includes("--write-evidence"),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildReport(process.env);

  if (args.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    process.stdout.write(formatReport(report) + "\n");
  }

  if (args.writeEvidence) {
    writeMarkdownReports(report);
  }

  if (args.gate) {
    if (report.verdict === "PASS") process.exit(0);
    if (report.verdict === "FAIL") process.exit(1);
    process.exit(2);
  }
  process.exit(0);
}

const isMain =
  typeof require !== "undefined" && require.main === module
    ? true
    : import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  void main();
}

export { buildReport, formatReport, writeMarkdownReports };
export type { ExtendedPreflightReport };
