/**
 * Staging Runtime — Seed (skeleton)
 *
 * Idempotent staging seed. The real seed surface is large and
 * cross-module (users, workspaces, conversations, PS items, PM
 * projects, Code Studio jobs, Data Acquisition sources, GraphRAG
 * outputs, Sandbox WF workflows, KGRA queries, connector test
 * inputs). Per the task: "If real DBs are unavailable during this
 * task, the seed script can validate env and report BLOCKED."
 *
 * That is the behaviour today. When real DBs are reachable, this
 * file delegates per-module to the existing module seeders (each
 * RTLM owns its seed via `pnpm run seed:<module>` — wired up by
 * the per-module follow-up PR).
 *
 * The script never prints secrets and exits non-zero on any
 * unrecoverable error.
 */

import { runPreflight } from "../staging-foundation/preflight";

interface SeedStep {
  module: string;
  status: "skipped" | "blocked" | "completed";
  reason?: string;
}

async function main(): Promise<void> {
  const json = process.argv.includes("--json");
  const report = runPreflight(process.env);

  // If foundation gate is BLOCKED, do not even attempt to seed —
  // the seeders would fail in confusing ways without DSNs.
  if (!report.allRequiredOk) {
    const out = {
      verdict: "BLOCKED",
      reason: "Foundation preflight is BLOCKED — seed cannot run without required env.",
      missingRequired: report.missingRequired,
    };
    if (json) {
      process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    } else {
      process.stderr.write(
        `[staging:seed] BLOCKED — missing required env:\n  - ${report.missingRequired.join(
          "\n  - ",
        )}\n[staging:seed] See docs/deployment/staging-runtime.md.\n`,
      );
    }
    process.exit(2);
  }

  // Module seeders are owned by their RTLMs; this file is the
  // dispatcher. Seeding is a per-module follow-up PR; today, the
  // dispatcher reports the planned seed plan and exits 0 so the
  // outer staging:seed pipeline can be wired without seeders yet
  // existing.
  const steps: SeedStep[] = [
    { module: "users + roles", status: "skipped", reason: "delegated to module seeders" },
    { module: "workspaces", status: "skipped", reason: "delegated to module seeders" },
    { module: "communication", status: "skipped", reason: "delegated to module seeders" },
    { module: "ps-ideation", status: "skipped", reason: "delegated to module seeders" },
    { module: "pm-central", status: "skipped", reason: "delegated to module seeders" },
    { module: "code-studio", status: "skipped", reason: "delegated to module seeders" },
    { module: "data-acquisition", status: "skipped", reason: "delegated to module seeders" },
    { module: "graphrag", status: "skipped", reason: "delegated to module seeders" },
    { module: "sandbox-wf", status: "skipped", reason: "delegated to module seeders" },
    { module: "kgra-agent", status: "skipped", reason: "delegated to module seeders" },
    { module: "connectors-local-manual-webhook", status: "skipped", reason: "delegated to module seeders" },
  ];

  const out = {
    verdict: "PLAN",
    note: "Per-module seeders to be wired in follow-up PRs. See docs/deployment/staging-seed-data.md.",
    steps,
  };
  if (json) {
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } else {
    process.stdout.write(
      "[staging:seed] PLAN — per-module seeders are owned by each RTLM.\n" +
        "[staging:seed] See docs/deployment/staging-seed-data.md for the seed plan.\n",
    );
    for (const s of steps) {
      process.stdout.write(`  - ${s.module}: ${s.status}${s.reason ? ` (${s.reason})` : ""}\n`);
    }
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
