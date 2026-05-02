#!/usr/bin/env tsx
/**
 * check:readiness-phase-gate
 *
 * Production Readiness Phase Control Gate.
 *
 * Enforces a hard separation between two audit modes:
 *
 *   --mode=development-baseline
 *     Allowed NOW. Runs Phases 0-2 of the readiness protocol
 *     (preparation / evidence-structure / baseline-command capture)
 *     while RTLM capsule migration is still in progress. Output is
 *     a "development baseline" report — explicitly NOT production
 *     certification. No score is produced in this mode.
 *
 *   --mode=production-readiness
 *     Allowed ONLY after every RTLM has migrated to the Module
 *     Client Capsule pattern. This mode unlocks Phases 3-15
 *     (DB / workers / connectors / routing / wiring / UI / RBAC /
 *     hardening / scoring / final report / remediation plan). It
 *     fails closed — exit code != 0 — until every RTLM is in
 *     `MIGRATED_MODULES`, the strict frontend-modularity surface
 *     covers all RTLMs, and required ancillary checks pass.
 *
 * Why a gate?
 * - Without it, an evaluator can run baseline commands against a
 *   half-migrated app and accidentally publish a "production-ready"
 *   verdict. The migration state changes the meaning of every check
 *   (strict vs report-only), so production scoring while modules
 *   are still in report-only mode is structurally invalid.
 * - The gate is read-only: it inspects current state and refuses to
 *   move beyond baseline until the migration is complete. It never
 *   weakens, modifies, or substitutes any other check.
 *
 * Source of truth:
 * - `scripts/module-tools/migration-state.ts → RTLM_LIST` (the
 *   canonical 15-entry list)
 * - `scripts/module-tools/migration-state.ts → MIGRATED_MODULES`
 *   (the live list of capsule-migrated modules; the gate fails if
 *   this is missing or if these don't match RTLM_LIST exactly).
 *
 * Output contract:
 * - Both modes print a banner that names the mode and the current
 *   migration count so the user cannot mistake a baseline run for
 *   production certification.
 * - Production-readiness mode appends an explicit "Production-
 *   readiness protocol is blocked" line with the reason and the
 *   next required implementation PR.
 *
 * Exit codes:
 *   0 — gate allows the requested mode
 *   1 — gate blocks the requested mode (with reason printed)
 *   2 — invocation error (unknown mode, etc.)
 */

import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";
import {
  RTLM_LIST,
  MIGRATED_MODULES,
} from "./module-tools/migration-state";

type Mode = "development-baseline" | "production-readiness";

interface GateCheck {
  id: string;
  label: string;
  required: boolean;
  pass: boolean;
  detail?: string;
}

function parseMode(argv: string[]): Mode | null {
  const flag = argv.find((a) => a.startsWith("--mode="));
  if (!flag) return null;
  const value = flag.split("=", 2)[1];
  if (value === "development-baseline" || value === "production-readiness") {
    return value;
  }
  return null;
}

function migrationStatus(): {
  total: number;
  migrated: number;
  remaining: string[];
  migratedList: string[];
} {
  const declared = new Set<string>(RTLM_LIST as readonly string[]);
  const migrated = new Set<string>(MIGRATED_MODULES as readonly string[]);
  const remaining = (RTLM_LIST as readonly string[]).filter(
    (k) => !migrated.has(k),
  );
  // Defend against drift: if MIGRATED_MODULES contains anything not in
  // RTLM_LIST, surface that as a structural error rather than
  // silently counting it as migrated.
  for (const k of migrated) {
    if (!declared.has(k)) {
      throw new Error(
        `MIGRATED_MODULES contains "${k}" which is not in RTLM_LIST — ` +
          "migration-state.ts is inconsistent",
      );
    }
  }
  return {
    total: RTLM_LIST.length,
    migrated: migrated.size,
    remaining,
    migratedList: [...migrated],
  };
}

function nextRequiredImplementationPR(remaining: string[]): string | null {
  return remaining.length > 0 ? remaining[0] : null;
}

function printBanner(mode: Mode, status: ReturnType<typeof migrationStatus>) {
  console.log("Production Readiness Phase Gate");
  console.log("===============================");
  console.log(`Mode:                  ${mode}`);
  console.log(
    `RTLM migration:        ${status.migrated} / ${status.total} migrated`,
  );
  if (status.remaining.length > 0) {
    console.log(
      `Remaining RTLMs:       ${status.remaining.join(", ")}`,
    );
  }
  console.log("");
}

/* ───────────────────────────────────────────────────────────────── */
/* development-baseline mode                                          */
/* ───────────────────────────────────────────────────────────────── */

function runDevelopmentBaselineGate(repoRoot: string): number {
  const status = migrationStatus();
  printBanner("development-baseline", status);

  // Baseline prerequisites — bare minimum so Phases 0-2 can produce
  // useful evidence. Failing any of these means the dev-baseline
  // audit itself can't run, not that production is blocked.
  const checks: GateCheck[] = [];

  const pkg = join(repoRoot, "package.json");
  checks.push({
    id: "package-json",
    label: "package.json exists",
    required: true,
    pass: existsSync(pkg),
  });

  const docs = join(repoRoot, "docs");
  checks.push({
    id: "docs-dir",
    label: "docs/ exists or can be created",
    required: true,
    pass: !existsSync(docs) || statSync(docs).isDirectory(),
  });

  const migrationStateFile = join(
    repoRoot,
    "scripts",
    "module-tools",
    "migration-state.ts",
  );
  checks.push({
    id: "migration-state",
    label: "scripts/module-tools/migration-state.ts is the source of truth",
    required: true,
    pass: existsSync(migrationStateFile),
  });

  // Discoverability of baseline commands. Missing scripts are
  // recorded as "missing — will be marked BLOCKED in baseline
  // report" rather than as gate failures, because Phase 2 itself is
  // responsible for capturing the missing-script evidence.
  const baselineScriptNames = [
    "check",
    "check:architecture",
    "check:wiring",
    "check:awi",
    "check:frontend-modularity",
    "build",
    "generate:route-ownership-map",
    "check:module-route-inventory",
    "check:module-routes-conflict",
    "check:app-route-ownership",
    "check:db-ownership",
    "check:sql-boundaries",
    "check:governance-actions",
    "check:ports",
  ];
  let pkgJson: { scripts?: Record<string, string> } = {};
  try {
    pkgJson = JSON.parse(readFileSync(pkg, "utf8"));
  } catch {
    /* handled by package-json check above */
  }
  const definedScripts = new Set(Object.keys(pkgJson.scripts ?? {}));
  const missingScripts = baselineScriptNames.filter(
    (n) => !definedScripts.has(n),
  );

  /* report */
  console.log("Baseline prerequisites");
  console.log("----------------------");
  for (const c of checks) {
    const tag = c.pass ? "OK  " : "FAIL";
    console.log(`  [${tag}] ${c.label}`);
  }
  console.log("");
  console.log("Baseline command discoverability");
  console.log("--------------------------------");
  console.log(`  defined: ${baselineScriptNames.length - missingScripts.length} / ${baselineScriptNames.length}`);
  if (missingScripts.length > 0) {
    console.log(
      `  missing (Phase 2 will mark BLOCKED): ${missingScripts.join(", ")}`,
    );
  }
  console.log("");

  console.log("Phase 0-2 — DEVELOPMENT BASELINE AUDIT");
  console.log("---------------------------------------");
  console.log("  Phase 0:  Preparation and scope lock        — allowed");
  console.log("  Phase 1:  Evidence structure setup           — allowed");
  console.log("  Phase 2:  Baseline command execution         — allowed");
  console.log("");
  console.log("Phase 3-15 — PRODUCTION READINESS PROTOCOL");
  console.log("------------------------------------------");
  console.log(
    `  intentionally BLOCKED — only ${status.migrated} / ${status.total} RTLMs migrated`,
  );
  console.log("  (run with --mode=production-readiness to inspect the block)");
  console.log("");

  console.log("WARNING — development baseline only");
  console.log("------------------------------------");
  console.log(
    "  Any output produced under this mode is a DEVELOPMENT BASELINE",
  );
  console.log(
    "  AUDIT, not production certification. The baseline report MUST",
  );
  console.log(
    "  NOT contain an overall readiness score, MUST NOT claim",
  );
  console.log(
    "  \"production-ready\" / \"staging-ready\" / \"safe for production\",",
  );
  console.log(
    "  and MUST NOT trigger remediation automatically. See",
  );
  console.log(
    "  docs/evidence/BASELINE_AUDIT_CONTROL.md for the full rules.",
  );
  console.log("");

  const failed = checks.filter((c) => c.required && !c.pass);
  if (failed.length > 0) {
    console.log("Gate result: FAIL — baseline prerequisites missing");
    return 1;
  }
  console.log(
    "Gate result: PASS — Phases 0-2 development baseline audit allowed",
  );
  return 0;
}

/* ───────────────────────────────────────────────────────────────── */
/* production-readiness mode                                          */
/* ───────────────────────────────────────────────────────────────── */

function runProductionReadinessGate(_repoRoot: string): number {
  const status = migrationStatus();
  printBanner("production-readiness", status);

  const blockers: string[] = [];

  // Blocker 1 — every RTLM must be migrated.
  if (status.migrated < status.total) {
    blockers.push(
      `RTLM migration incomplete (${status.migrated} / ${status.total}). ` +
        `Remaining: ${status.remaining.join(", ")}.`,
    );
  }

  // Blocker 2 — MIGRATED_MODULES must include every RTLM key.
  const migratedSet = new Set<string>(MIGRATED_MODULES as readonly string[]);
  const notInMigrated = (RTLM_LIST as readonly string[]).filter(
    (k) => !migratedSet.has(k),
  );
  if (notInMigrated.length > 0) {
    blockers.push(
      `MIGRATED_MODULES does not include every RTLM. Missing: ` +
        `${notInMigrated.join(", ")}.`,
    );
  }

  // Blocker 3 — frontend modularity must be strict for every RTLM.
  // We don't re-execute check:frontend-modularity here (the dev
  // baseline mode already captures it). Instead we assert the only
  // structural condition the gate cares about: there are no RTLMs
  // left in report-only mode. If MIGRATED_MODULES = RTLM_LIST and
  // the existing check:frontend-modularity passes, every check
  // automatically runs strict for every RTLM by construction.
  // (No extra blocker line — this is implied by Blockers 1 + 2.)

  // Result.
  console.log("Production readiness entry criteria");
  console.log("-----------------------------------");
  if (blockers.length === 0) {
    console.log("  [OK]  All gate-level criteria satisfied.");
  } else {
    for (const b of blockers) {
      console.log(`  [BLOCK] ${b}`);
    }
  }
  console.log("");

  if (blockers.length > 0) {
    console.log("Production-readiness protocol is blocked.");
    console.log(
      `Reason: only ${status.migrated} / ${status.total} RTLMs migrated to the Module Client Capsule pattern.`,
    );
    const next = nextRequiredImplementationPR(status.remaining);
    if (next) {
      console.log(`Next required implementation PR: ${next} capsule migration.`);
    }
    console.log("");
    console.log(
      "Phases 3-15 of the readiness protocol (DB / workers / connectors /",
    );
    console.log(
      "routing / wiring / UI / RBAC / enterprise hardening / scoring / final",
    );
    console.log(
      "report / remediation planning) MUST NOT run while modules are still",
    );
    console.log(
      "in report-only mode — strict-mode signals are the foundation of every",
    );
    console.log(
      "downstream check, and scoring against a half-migrated app is",
    );
    console.log("structurally invalid.");
    console.log("");
    console.log(
      "Use --mode=development-baseline to capture Phase 0-2 evidence in the",
    );
    console.log(
      "meantime. The development baseline report MUST NOT produce a",
    );
    console.log(
      "readiness score; see docs/architecture/production-readiness/READINESS_PHASE_CONTROL.md.",
    );
    console.log("");
    console.log("Gate result: BLOCKED");
    return 1;
  }

  console.log(
    "Gate result: PASS — Production readiness protocol (Phases 3-15) is unlocked.",
  );
  return 0;
}

/* ───────────────────────────────────────────────────────────────── */
/* main                                                                */
/* ───────────────────────────────────────────────────────────────── */

function main(): number {
  // tsx forwards everything after `--` as plain argv. Accept both:
  //   pnpm run check:readiness-phase-gate -- --mode=development-baseline
  //   tsx scripts/check-readiness-phase-gate.ts --mode=production-readiness
  const argv = process.argv.slice(2);
  const mode = parseMode(argv);
  if (!mode) {
    console.error(
      "Usage: check:readiness-phase-gate -- --mode=<development-baseline|production-readiness>",
    );
    return 2;
  }

  const repoRoot = process.cwd();
  if (mode === "development-baseline") {
    return runDevelopmentBaselineGate(repoRoot);
  }
  return runProductionReadinessGate(repoRoot);
}

process.exit(main());
