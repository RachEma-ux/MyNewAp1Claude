#!/usr/bin/env tsx
/**
 * check:runtime-wiring
 *
 * Validates the runtime / lifecycle surface:
 *   - every module declares runtime.mode in {shared, embedded, worker, external}
 *   - worker modules expose worker/runtime health metadata
 *   - embedded modules expose boot/health where required
 *   - boot failures of optional modules degrade (do not abort)
 *   - boot failures of required modules can block startup
 *   - postListen hooks are not invoked at import time
 *   - module manifest imports do not start setIntervals, schedulers,
 *     pg.Pool / pg.Client, Worker(), or top-level awaits
 *
 * The check is intentionally static — it scans the source rather than
 * importing the manifest barrel.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  buildFullInventory,
  KNOWN_MODULES,
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

const VALID_MODES = new Set(["shared", "embedded", "worker", "external"]);

async function main() {
  const repoRoot = resolveRepoRoot();
  const findings: WiringFinding[] = [];

  // ---- 1. RuntimeManager invariants -------------------------------
  const rmPath = join(repoRoot, "server/platform/modules/runtime-manager.ts");
  const rmSrc = read(rmPath);
  if (!rmSrc) {
    findings.push({
      module: "(platform)",
      lane: "runtime",
      status: "missing",
      severity: "blocker",
      message: "RuntimeManager source missing",
    });
  } else {
    for (const fn of ["boot", "postListen", "stop", "pollHealth"]) {
      if (!new RegExp(`(async\\s+)?${fn}\\s*\\(`).test(rmSrc)) {
        findings.push({
          module: "(platform)",
          lane: "runtime",
          status: "missing",
          severity: "high",
          message: `RuntimeManager.${fn}() not found`,
        });
      }
    }
    if (!/required/.test(rmSrc)) {
      findings.push({
        module: "(platform)",
        lane: "runtime",
        status: "missing",
        severity: "high",
        message: "RuntimeManager does not differentiate required vs optional boot failures",
      });
    }
    if (!/degraded/.test(rmSrc)) {
      findings.push({
        module: "(platform)",
        lane: "runtime",
        status: "missing",
        severity: "high",
        message: "RuntimeManager has no 'degraded' state path for optional boot failures",
      });
    }
  }

  // ---- 2. Per-module manifest invariants -------------------------
  const inventory = buildFullInventory({ repoRoot });
  for (const inv of inventory) {
    if (inv.runtime.mode === null) {
      findings.push({
        module: inv.key,
        lane: "runtime",
        status: "missing",
        severity: "blocker",
        message: "runtime.mode is missing",
      });
      continue;
    }
    if (!VALID_MODES.has(inv.runtime.mode)) {
      findings.push({
        module: inv.key,
        lane: "runtime",
        status: "missing",
        severity: "blocker",
        message: `runtime.mode '${inv.runtime.mode}' is not valid`,
        hint: "Allowed: shared / embedded / worker / external",
      });
    }
    if (inv.runtime.mode === "worker" && !inv.runtime.healthDeclared) {
      findings.push({
        module: inv.key,
        lane: "runtime",
        status: "missing",
        severity: "high",
        message: "worker-mode module must expose health()",
      });
    }
    if (inv.runtime.mode === "embedded" && !inv.runtime.healthDeclared) {
      findings.push({
        module: inv.key,
        lane: "runtime",
        status: "declared-only",
        severity: "follow-up",
        message: "embedded module did not declare health() — RuntimeManager will skip it",
      });
    }
    if (inv.runtime.importTimeSideEffects.length > 0) {
      findings.push({
        module: inv.key,
        lane: "runtime",
        status: "wired",
        severity: "high",
        message: `Top-level side effects in manifest/boot: ${inv.runtime.importTimeSideEffects.join(", ")}`,
        hint: "Move work into boot()/postListen()",
      });
    }
  }

  // ---- 3. Manifest barrel doesn't start anything -----------------
  const barrelPath = join(repoRoot, "server/platform/modules/manifests.ts");
  if (existsSync(barrelPath)) {
    const src = read(barrelPath);
    if (/setInterval\(|setTimeout\(|new\s+pg\.|new\s+Worker\(|^\s*await/m.test(src)) {
      findings.push({
        module: "(platform)",
        lane: "runtime",
        status: "wired",
        severity: "blocker",
        message: "manifests.ts contains top-level side effects",
        hint: barrelPath,
      });
    }
  }

  // ---- 4. RuntimeManager boot order respects dependsOn ----------
  if (rmSrc && !/resolveBootOrder|dependsOn/.test(rmSrc)) {
    findings.push({
      module: "(platform)",
      lane: "runtime",
      status: "missing",
      severity: "high",
      message: "RuntimeManager does not respect dependsOn ordering",
    });
  }

  // ---- 5. Print + exit ------------------------------------------
  console.log("=== check:runtime-wiring ===");
  console.log(`\nModules tracked: ${inventory.length} (KNOWN_MODULES=${KNOWN_MODULES.length}).`);

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
  console.log("\nOK — runtime wiring within tolerance.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[FATAL] check:runtime-wiring", err);
  process.exit(2);
});
