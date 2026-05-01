#!/usr/bin/env tsx
/**
 * check:handoff-wiring
 *
 * Validates the handoff manager contract surface:
 *   - Handoff record carries actorId, workspaceId, correlationId,
 *     governanceReceipt? and the 8 statuses
 *     (draft / submitted / accepted / rejected / in_progress /
 *      completed / failed / cancelled)
 *   - submit/accept/reject/complete transitions are valid
 *   - every declared handoff acceptor exists for some module
 *   - the receiving module owns target record creation (acceptors
 *     register on the *receiving* module key)
 *   - no acceptor imports another module's private internals
 *   - the simple `PS → PM Central` handoff is represented as a
 *     handoff (not as a coordinator workflow alone)
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import {
  buildFullInventory,
  resolveRepoRoot,
} from "../server/platform/modules/wiring-inventory";
import type { WiringFinding } from "../server/platform/modules/wiring-types";

function read(p: string): string {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function isTestFile(name: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(name);
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
      if (
        e === "node_modules" || e === "dist" || e === ".git" || e === "build" || e === ".vite" || e === "coverage"
      ) continue;
      const full = join(d, e);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) w(full);
      else if (s.isFile() && (e.endsWith(".ts") || e.endsWith(".tsx")) && !e.endsWith(".d.ts")) {
        if (isTestFile(e)) continue;
        out.push(full);
      }
    }
  }
  w(root);
  return out;
}

const REQUIRED_STATUSES = [
  "draft",
  "submitted",
  "accepted",
  "rejected",
  "in_progress",
  "completed",
  "failed",
  "cancelled",
];

const REQUIRED_FIELDS = [
  "handoffId",
  "fromModule",
  "toModule",
  "type",
  "payload",
  "actorId",
  "workspaceId",
  "correlationId",
  "status",
  "createdAt",
  "updatedAt",
];

const PRIVATE_INDICATORS = [
  "/repository",
  "/connection",
  "/db",
  "/services/",
];

async function main() {
  const repoRoot = resolveRepoRoot();
  const findings: WiringFinding[] = [];

  // ---- 1. Type contract ------------------------------------------
  const typesSrc = read(join(repoRoot, "server/platform/handoff/types.ts"));
  for (const s of REQUIRED_STATUSES) {
    if (!new RegExp(`["'\`]${s}["'\`]`).test(typesSrc)) {
      findings.push({
        module: "(platform)",
        lane: "handoff",
        status: "missing",
        severity: "blocker",
        message: `HandoffStatus missing required value '${s}'`,
        hint: "server/platform/handoff/types.ts",
      });
    }
  }
  for (const f of REQUIRED_FIELDS) {
    if (!new RegExp(`\\b${f}\\b`).test(typesSrc)) {
      findings.push({
        module: "(platform)",
        lane: "handoff",
        status: "missing",
        severity: "blocker",
        message: `Handoff record missing field '${f}'`,
      });
    }
  }
  if (!/governanceReceipt\??\s*:/.test(typesSrc)) {
    findings.push({
      module: "(platform)",
      lane: "handoff",
      status: "missing",
      severity: "high",
      message: "Handoff record has no governanceReceipt? field — receipts cannot ride along",
    });
  }

  // ---- 2. Manager API: submit / transition / list ----------------
  const managerSrc = read(join(repoRoot, "server/platform/handoff/handoff-manager.ts"));
  for (const fn of ["submitHandoff", "transitionHandoff", "registerHandoffAcceptor", "listHandoffs"]) {
    if (!new RegExp(`(export\\s+(async\\s+)?function|export\\s+const)\\s+${fn}\\b`).test(managerSrc)) {
      findings.push({
        module: "(platform)",
        lane: "handoff",
        status: "missing",
        severity: "blocker",
        message: `Handoff manager missing export '${fn}'`,
      });
    }
  }
  // submit must guard fromModule !== toModule.
  if (!/fromModule\s*===\s*\w+\.toModule|input\.fromModule\s*===\s*input\.toModule/.test(managerSrc)) {
    findings.push({
      module: "(platform)",
      lane: "handoff",
      status: "wired",
      severity: "medium",
      message: "submitHandoff does not guard fromModule !== toModule",
    });
  }
  // transitionHandoff must mark completedAt for terminal states.
  if (!/completedAt\s*=\s*new Date\(\)\.toISOString\(\)/.test(managerSrc)) {
    findings.push({
      module: "(platform)",
      lane: "handoff",
      status: "wired",
      severity: "medium",
      message: "transitionHandoff does not record completedAt for terminal transitions",
    });
  }

  // ---- 3. Per-module wiring (declared accepts vs registered) ----
  const inventory = buildFullInventory({ repoRoot });
  const allRegistered: Array<{ module: string; type: string }> = [];

  // Collect every registerHandoffAcceptor call in the tree.
  const files = walk(join(repoRoot, "server"));
  for (const f of files) {
    const src = read(f);
    if (!src.includes("registerHandoffAcceptor")) continue;
    const re = /registerHandoffAcceptor\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*["'`]([^"'`]+)["'`]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      allRegistered.push({ module: m[1], type: m[2] });
    }
  }

  for (const inv of inventory) {
    if (inv.handoffs.accepts.length === 0) continue;
    const reg = new Set(
      allRegistered.filter((r) => r.module === inv.key).map((r) => r.type),
    );
    const missing = inv.handoffs.accepts.filter((a) => !reg.has(a));
    if (missing.length > 0) {
      findings.push({
        module: inv.key,
        lane: "handoff",
        status: "declared-only",
        severity: "follow-up",
        message: `${missing.length} declared acceptor(s) lack registerHandoffAcceptor: ${missing.join(", ")}`,
        hint: `Wire in ${inv.folder}/boot.ts`,
      });
    }
  }

  // Each registered acceptor must correspond to a known module.
  const knownKeys = new Set(inventory.map((i) => i.key));
  for (const r of allRegistered) {
    if (!knownKeys.has(r.module)) {
      findings.push({
        module: r.module,
        lane: "handoff",
        status: "wired",
        severity: "high",
        message: `Acceptor registered for unknown module key '${r.module}' (type=${r.type})`,
      });
    }
  }

  // ---- 4. PS → PM Central handoff is represented ----------------
  const psManifest = read(join(repoRoot, "server/ps/manifest.ts"));
  if (psManifest && !/ps\.pmCentral|ps\.pm-central|pmCentral/.test(psManifest)) {
    findings.push({
      module: "ps",
      lane: "handoff",
      status: "declared-only",
      severity: "follow-up",
      message: "PS manifest does not declare a pmCentral handoff produces — required by lane rules",
      hint: "PS → PM Central is handoff-only (not coordinator-driven)",
    });
  }

  // ---- 5. No acceptor file imports private cross-module paths ---
  const acceptorFiles = files.filter((f) => /handoffs?\.ts$|handoff-acceptor/.test(f));
  for (const f of acceptorFiles) {
    const src = read(f);
    const imports = src.match(/^import[^;]*from\s*["'`][^"'`]+["'`]/gm) ?? [];
    for (const line of imports) {
      for (const ind of PRIVATE_INDICATORS) {
        if (line.includes(ind)) {
          findings.push({
            module: "(platform)",
            lane: "handoff",
            status: "wired",
            severity: "high",
            message: `Handoff file imports private path: ${line.trim()}`,
            hint: relative(repoRoot, f),
          });
        }
      }
    }
  }

  // ---- 6. Print + exit -------------------------------------------
  console.log("=== check:handoff-wiring ===");
  console.log(`\nDiscovered ${allRegistered.length} registerHandoffAcceptor() call(s).`);
  for (const r of allRegistered) {
    console.log(`  ${r.module}::${r.type}`);
  }
  if (allRegistered.length === 0) {
    console.log("  (none — handoff acceptors declared but not yet wired in boot)");
  }

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
  console.log("\nOK — handoff wiring within tolerance.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[FATAL] check:handoff-wiring", err);
  process.exit(2);
});
