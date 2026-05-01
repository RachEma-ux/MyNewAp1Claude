#!/usr/bin/env tsx
/**
 * check:coordinator-wiring
 *
 * Validates that the Central Coordinator stays inside its lane:
 *   - imports only Module Gateway, Handoff Manager, Event Bus,
 *     and approved platform services (not module privates)
 *   - implements the four step kinds:
 *       gateway-call / handoff / event-publish / wait-for-event
 *   - implements compensation as either a real path or an explicit
 *     manual / stub marker
 *   - never required for a simple PS → PM Central handoff
 *
 * This complements `check-coordinator-boundaries.ts` which is a
 * stricter import-graph check; this script verifies the *positive*
 * surface (what the coordinator should expose) instead of just the
 * negative surface (what it shouldn't import).
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, relative } from "path";
import { resolveRepoRoot } from "../server/platform/modules/wiring-inventory";
import type { WiringFinding } from "../server/platform/modules/wiring-types";

function read(p: string): string {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

const ALLOWED_PREFIXES = [
  "../modules/module-gateway",
  "../handoff",
  "../events",
  "./types",
  "./store",
  "./compensation",
  "crypto",
];

const FORBIDDEN_PATTERNS = [
  /\/repository(\.ts)?["'`]/,
  /\/connection(\.ts)?["'`]/,
  /\/services\//,
  /\/db\//,
  /\.repository["'`]/,
];

const REQUIRED_STEP_KINDS = ["gateway-call", "handoff", "event-publish", "wait-for-event"];

async function main() {
  const repoRoot = resolveRepoRoot();
  const findings: WiringFinding[] = [];

  const coordDir = join(repoRoot, "server/platform/coordinator");
  if (!existsSync(coordDir)) {
    findings.push({
      module: "(platform)",
      lane: "coordinator",
      status: "missing",
      severity: "blocker",
      message: "Coordinator directory missing",
    });
  } else {
    // ---- 1. Walk every coordinator file ---------------------------
    const files = walk(coordDir);
    for (const f of files) {
      const src = read(f);
      const importLines =
        src.match(/^import[^;]*from\s*["'`]([^"'`]+)["'`]/gm) ?? [];
      for (const line of importLines) {
        const specMatch = /from\s*["'`]([^"'`]+)["'`]/.exec(line);
        if (!specMatch) continue;
        const spec = specMatch[1];
        const ok =
          spec.startsWith(".") ?
            ALLOWED_PREFIXES.some((p) => spec === p || spec.startsWith(p + "/")) ||
            spec.startsWith("./") :
            // Bare specifiers — either node built-in or @-aliased platform path.
            spec.startsWith("@/server/platform/") ||
            ["pg", "zod", "@trpc/server"].includes(spec) ||
            spec === "crypto" ||
            spec === "node:crypto";
        if (!ok) {
          findings.push({
            module: "(platform)",
            lane: "coordinator",
            status: "wired",
            severity: "high",
            message: `Coordinator file imports disallowed module '${spec}'`,
            hint: relative(repoRoot, f),
          });
        }
        for (const re of FORBIDDEN_PATTERNS) {
          if (re.test(line)) {
            findings.push({
              module: "(platform)",
              lane: "coordinator",
              status: "wired",
              severity: "blocker",
              message: `Coordinator imports private module path: ${line.trim()}`,
              hint: relative(repoRoot, f),
            });
          }
        }
      }
    }

    // ---- 2. Step kinds present -----------------------------------
    const runtimeSrc = read(join(coordDir, "runtime.ts"));
    for (const k of REQUIRED_STEP_KINDS) {
      if (!new RegExp(`["'\`]${k}["'\`]`).test(runtimeSrc)) {
        findings.push({
          module: "(platform)",
          lane: "coordinator",
          status: "missing",
          severity: "blocker",
          message: `Coordinator runtime missing step kind '${k}'`,
        });
      }
    }
    // Compensation — must be present (real or stub).
    if (!/compensation/i.test(runtimeSrc)) {
      findings.push({
        module: "(platform)",
        lane: "coordinator",
        status: "missing",
        severity: "high",
        message: "Coordinator does not handle compensation step (or stub)",
      });
    }
  }

  // ---- 3. Coordinator not used for PS → PM Central simple flow --
  // Find any coordinator step whose kind=gateway-call/handoff combo
  // looks like a single PS → PM Central transfer.
  // Heuristic: a workflow file that uses only one handoff step from PS
  // to pmCentral and nothing else => should be a direct handoff, not
  // a coordinator workflow.
  const psCoordinatorMisuse = findPsToPmCentralCoordinatorMisuse(repoRoot);
  if (psCoordinatorMisuse.length > 0) {
    for (const m of psCoordinatorMisuse) {
      findings.push({
        module: "ps",
        lane: "coordinator",
        status: "wired",
        severity: "medium",
        message: `Workflow appears to be a simple PS → PM Central transfer that should be a handoff, not a coordinator workflow`,
        hint: m,
      });
    }
  }

  // ---- 4. Print + exit ------------------------------------------
  console.log("=== check:coordinator-wiring ===");
  console.log(`\n${findings.length} finding(s):`);
  for (const f of findings) {
    console.log(`  [${f.severity}] ${f.module} ${f.lane}: ${f.message}`);
  }

  const blocking = findings.filter(
    (f) => f.severity === "blocker" || f.severity === "high",
  );
  if (blocking.length > 0) {
    console.error(`\n${blocking.length} blocking finding(s).`);
    process.exit(1);
  }
  console.log("\nOK — coordinator wiring within tolerance.");
  process.exit(0);
}

function walk(root: string): string[] {
  const out: string[] = [];
  function w(d: string) {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e === "node_modules" || e === "dist" || e === ".git") continue;
      const full = join(d, e);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) w(full);
      else if (s.isFile() && (e.endsWith(".ts") || e.endsWith(".tsx")) && !e.endsWith(".d.ts")) {
        if (/\.(test|spec)\.tsx?$/.test(e)) continue;
        out.push(full);
      }
    }
  }
  w(root);
  return out;
}

function findPsToPmCentralCoordinatorMisuse(repoRoot: string): string[] {
  const flagged: string[] = [];
  // Look at any caller of submitWorkflow and inspect its steps.
  const candidates = walkAll(join(repoRoot, "server"));
  for (const f of candidates) {
    const src = read(f);
    if (!src.includes("submitWorkflow")) continue;
    const re = /submitWorkflow\s*\(\s*\{([\s\S]*?)\}\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const body = m[1];
      const stepKinds = [...body.matchAll(/kind\s*:\s*["'`]([^"'`]+)["'`]/g)].map((x) => x[1]);
      const modules = [...body.matchAll(/module\s*:\s*["'`]([^"'`]+)["'`]/g)].map((x) => x[1]);
      // Single handoff PS → PM Central, no other steps.
      if (
        stepKinds.length === 1 &&
        stepKinds[0] === "handoff" &&
        modules.length === 1 &&
        /pmCentral|pm-central/i.test(modules[0])
      ) {
        flagged.push(relative(repoRoot, f));
      }
    }
  }
  return flagged;
}

function walkAll(root: string): string[] {
  const out: string[] = [];
  function w(d: string) {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e === "node_modules" || e === "dist" || e === ".git" || e === "build") continue;
      const full = join(d, e);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) w(full);
      else if (s.isFile() && (e.endsWith(".ts") || e.endsWith(".tsx")) && !e.endsWith(".d.ts")) {
        if (/\.(test|spec)\.tsx?$/.test(e)) continue;
        out.push(full);
      }
    }
  }
  w(root);
  return out;
}

main().catch((err) => {
  console.error("[FATAL] check:coordinator-wiring", err);
  process.exit(2);
});
