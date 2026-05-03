/**
 * Staging Runtime Foundation — Preflight Reporter
 *
 * Single source of truth for "what does staging need" — both for the
 * legacy `run-staging-integration-tests.ts` runner and for any future
 * staging exercise (DB isolation, worker probes, connector probes,
 * UI smoke, workflow replay).
 *
 * Surfaces three pieces of state, deterministically, without ever
 * reaching out to external services:
 *
 *   1. **Required** infra (Phase 3 DB isolation, Phase 11 RBAC):
 *      DATABASE_URL, OPA_URL (real, not opa.example.com),
 *      ENCRYPTION_KEY, SECRETS_ENCRYPTION_KEY, COOKIE_SECRET,
 *      JWT_SECRET. Missing → BLOCKED (exit 2 in --gate mode).
 *
 *   2. **Component-scoped** infra (Phase 4/5 — workers, connectors):
 *      GRAPHRAG_WORKER_URL, DATA_ACQUISITION_WORKER_URL,
 *      EXTERNAL_ORCHESTRATOR_URL, REDIS_URL, S3 / GDrive / GitHub
 *      connector envs. Missing → cleanly skipped, NOT blocked.
 *      The runner reports them as "deferred" rather than failing.
 *
 *   3. **Mode** flags: TEST_MODE=staging-integration (controls
 *      tests/_helpers/test-modes.ts skipUnlessInfra → run flip).
 *
 * Output formats:
 *   - default: human-readable status + hints (stderr on BLOCKED).
 *   - --json:  machine-readable structured report.
 *   - --gate:  exit 2 if any required infra is missing, 0 otherwise.
 *
 * No side effects. Pure read of process.env. Safe to run anywhere
 * (local dev, CI, staging host).
 */

const REQUIRED_INFRA = [
  {
    key: "DATABASE_URL",
    label: "DATABASE_URL (mynewap1claude staging DSN)",
    hint: "Set DATABASE_URL to the staging mynewap1claude Postgres DSN.",
  },
  {
    key: "OPA_URL",
    label: "OPA_URL (real endpoint, not opa.example.com placeholder)",
    hint: "Set OPA_URL to the staging OPA endpoint. opa.example.com is rejected.",
    custom: (v: string | undefined): boolean =>
      typeof v === "string" && v.length > 0 && !v.includes("opa.example.com"),
  },
  {
    key: "ENCRYPTION_KEY",
    label: "ENCRYPTION_KEY",
    hint: "Set ENCRYPTION_KEY. See docs/deployment/staging-runtime-foundation.md for generator.",
  },
  {
    key: "SECRETS_ENCRYPTION_KEY",
    label: "SECRETS_ENCRYPTION_KEY",
    hint: "Set SECRETS_ENCRYPTION_KEY. See docs/deployment/staging-runtime-foundation.md.",
  },
  {
    key: "COOKIE_SECRET",
    label: "COOKIE_SECRET",
    hint: "Set COOKIE_SECRET. See docs/deployment/staging-runtime-foundation.md.",
  },
  {
    key: "JWT_SECRET",
    label: "JWT_SECRET",
    hint: "Set JWT_SECRET. See docs/deployment/staging-runtime-foundation.md.",
  },
] as const;

const OPTIONAL_INFRA = [
  {
    key: "GRAPHRAG_WORKER_URL",
    label: "GRAPHRAG_WORKER_URL (Phase 4)",
    component: "graphrag-worker",
  },
  {
    key: "DATA_ACQUISITION_WORKER_URL",
    label: "DATA_ACQUISITION_WORKER_URL (Phase 4)",
    component: "data-acquisition-worker",
  },
  {
    key: "EXTERNAL_ORCHESTRATOR_URL",
    label: "EXTERNAL_ORCHESTRATOR_URL (Phase 4)",
    component: "external-orchestrator",
  },
  {
    key: "REDIS_URL",
    label: "REDIS_URL (worker queue)",
    component: "worker-queue",
  },
  {
    key: "WORKER_QUEUE_URL",
    label: "WORKER_QUEUE_URL (worker queue alt)",
    component: "worker-queue",
  },
  {
    key: "S3_BUCKET",
    label: "S3 connector envs (Phase 5)",
    component: "s3-connector",
  },
  {
    key: "GDRIVE_CLIENT_ID",
    label: "GDrive connector envs (Phase 5)",
    component: "gdrive-connector",
  },
  {
    key: "GITHUB_APP_ID",
    label: "GitHub connector envs (Phase 5)",
    component: "github-connector",
  },
] as const;

interface InfraStatus {
  key: string;
  label: string;
  ok: boolean;
  hint?: string;
  component?: string;
}

interface PreflightReport {
  mode: "staging-integration" | "default";
  required: InfraStatus[];
  optional: InfraStatus[];
  allRequiredOk: boolean;
  missingRequired: string[];
  deferredComponents: string[];
}

export function runPreflight(env: NodeJS.ProcessEnv = process.env): PreflightReport {
  const required: InfraStatus[] = REQUIRED_INFRA.map((c) => {
    const v = env[c.key];
    const ok = "custom" in c && typeof c.custom === "function"
      ? c.custom(v)
      : typeof v === "string" && v.length > 0;
    return { key: c.key, label: c.label, ok, hint: c.hint };
  });

  const optional: InfraStatus[] = OPTIONAL_INFRA.map((c) => {
    const v = env[c.key];
    const ok = typeof v === "string" && v.length > 0;
    return { key: c.key, label: c.label, ok, component: c.component };
  });

  const missingRequired = required.filter((r) => !r.ok).map((r) => r.key);
  const deferredComponents = Array.from(
    new Set(optional.filter((o) => !o.ok).map((o) => o.component!).filter(Boolean)),
  );

  return {
    mode: env.TEST_MODE === "staging-integration" ? "staging-integration" : "default",
    required,
    optional,
    allRequiredOk: missingRequired.length === 0,
    missingRequired,
    deferredComponents,
  };
}

export function formatHuman(report: PreflightReport): string {
  const lines: string[] = [];
  lines.push(`Staging preflight — mode: ${report.mode}`);
  lines.push("");
  lines.push("Required infra:");
  for (const r of report.required) {
    lines.push(`  ${r.ok ? "[ok]" : "[--]"} ${r.label}`);
    if (!r.ok && r.hint) lines.push(`         ${r.hint}`);
  }
  lines.push("");
  lines.push("Optional infra (component-scoped; missing → deferred, not blocked):");
  for (const o of report.optional) {
    lines.push(`  ${o.ok ? "[ok]" : "[..]"} ${o.label}`);
  }
  lines.push("");
  if (report.allRequiredOk) {
    lines.push("Result: PASS — required infra present.");
    if (report.deferredComponents.length > 0) {
      lines.push(
        `Deferred components: ${report.deferredComponents.join(", ")} — those phase tests will skip cleanly.`,
      );
    }
  } else {
    lines.push("Result: BLOCKED — required infra missing:");
    for (const k of report.missingRequired) {
      lines.push(`  - ${k}`);
    }
    lines.push("");
    lines.push("This is a real gap, not a skip. Provision staging and re-run.");
    lines.push("See docs/deployment/staging-runtime-foundation.md.");
  }
  return lines.join("\n");
}

function parseArgs(argv: string[]): { json: boolean; gate: boolean } {
  return {
    json: argv.includes("--json"),
    gate: argv.includes("--gate"),
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const report = runPreflight();

  if (args.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    process.stdout.write(formatHuman(report) + "\n");
  }

  if (args.gate && !report.allRequiredOk) {
    process.exit(2);
  }
  process.exit(0);
}

const isMain =
  typeof require !== "undefined" && require.main === module
    ? true
    : import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  main();
}
