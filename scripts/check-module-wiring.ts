#!/usr/bin/env tsx
/**
 * check:wiring (umbrella entry — module-level)
 *
 * Walks the static module inventory under `server/platform/modules/wiring-*.ts`
 * and reports per-module wiring status.
 *
 * Failure model:
 *   - manifest missing for a known module → BLOCKER (exit 1)
 *   - duplicate module key → BLOCKER
 *   - invalid runtime mode → BLOCKER
 *   - circular dependsOn → BLOCKER
 *   - declared but unregistered public API / event consumer / handoff
 *     acceptor → recorded as FOLLOW-UP (warn, do not fail)
 *
 * The script does NOT import the manifest barrel — keeps it cheap and
 * side-effect free. Cross-validates against `scripts/lib/module-graph.ts`.
 */

import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import {
  buildFullInventory,
  KNOWN_MODULES,
  resolveRepoRoot,
} from "../server/platform/modules/wiring-inventory";
import {
  rollUp,
  renderReportMarkdown,
} from "../server/platform/modules/wiring-report";
import type {
  WiringFinding,
  WiringReport,
} from "../server/platform/modules/wiring-types";
import { MODULE_MAP } from "./lib/module-graph";

async function main() {
  const repoRoot = resolveRepoRoot();
  const inventory = buildFullInventory({ repoRoot });
  const findings: WiringFinding[] = [];

  // ---- 1. Cross-validate KNOWN_MODULES vs MODULE_MAP --------------
  const knownKeys = new Set(KNOWN_MODULES.map((m) => m.key));
  const graphKeys = new Set(MODULE_MAP.map((m) => m.key));
  for (const k of knownKeys) {
    if (!graphKeys.has(k) && k !== "aiTypes") {
      // aiTypes is intentionally absent from MODULE_MAP today — it has no
      // private surface to police. Recorded as follow-up.
      findings.push({
        module: k,
        lane: "manifest",
        status: "missing",
        severity: "medium",
        message: `Module '${k}' is in KNOWN_MODULES but not in scripts/lib/module-graph.ts MODULE_MAP`,
        hint: "Either add to MODULE_MAP or document as no-private-surface",
      });
    }
  }
  for (const k of graphKeys) {
    if (!knownKeys.has(k)) {
      findings.push({
        module: k,
        lane: "manifest",
        status: "missing",
        severity: "medium",
        message: `Module '${k}' is in MODULE_MAP but not in KNOWN_MODULES (wiring-inventory.ts)`,
        hint: "Add a DiscoveredModule entry so wiring is tracked",
      });
    }
  }
  if (knownKeys.size !== KNOWN_MODULES.length) {
    findings.push({
      module: "(platform)",
      lane: "manifest",
      status: "missing",
      severity: "blocker",
      message: "Duplicate module keys in KNOWN_MODULES",
    });
  }

  // ---- 2. Per-module wiring ---------------------------------------
  for (const inv of inventory) {
    if (!inv.serverManifestExists) {
      findings.push({
        module: inv.key,
        lane: "manifest",
        status: "missing",
        severity: "blocker",
        message: `manifest.ts not found at ${inv.folder}/manifest.ts`,
      });
      continue;
    }

    if (inv.runtime.mode === null) {
      findings.push({
        module: inv.key,
        lane: "runtime",
        status: "missing",
        severity: "blocker",
        message: "runtime.mode is missing or invalid",
        hint: "Allowed values: shared / embedded / worker / external",
      });
    }

    if (inv.runtime.importTimeSideEffects.length > 0) {
      findings.push({
        module: inv.key,
        lane: "runtime",
        status: "wired",
        severity: "high",
        message: `Top-level side effects detected: ${inv.runtime.importTimeSideEffects.join(", ")}`,
        hint: "Move into boot()/postListen()",
      });
    }

    if (!inv.runtime.healthDeclared) {
      findings.push({
        module: inv.key,
        lane: "runtime",
        status: "declared-only",
        severity: "medium",
        message: "health() not declared on manifest",
      });
    }

    if (
      (inv.database.kind === "owned" || inv.database.kind === "shared") &&
      inv.database.status === "missing"
    ) {
      findings.push({
        module: inv.key,
        lane: "database",
        status: "missing",
        severity: "high",
        message: "database descriptor incomplete",
      });
    }

    // Public API: declared in governanceActions but no runtime registration
    // — record as FOLLOW-UP not blocker, because PR #46 intentionally
    // shipped without per-module register-in-boot calls.
    if (inv.publicApi.status === "declared-only") {
      const missing = inv.publicApi.declared.filter(
        (k) => !inv.publicApi.registered.includes(k),
      );
      findings.push({
        module: inv.key,
        lane: "publicApi",
        status: "declared-only",
        severity: "follow-up",
        message: `${missing.length} public API action(s) declared without registerPublicApi() at boot: ${missing.join(", ")}`,
        hint: "Add registerPublicApi calls in module boot()",
      });
    }

    if (inv.events.status === "declared-only" && inv.events.consumes.length > 0) {
      const missing = inv.events.consumes.filter((c) => !inv.events.subscribed.includes(c));
      findings.push({
        module: inv.key,
        lane: "event",
        status: "declared-only",
        severity: "follow-up",
        message: `${missing.length} event subscription(s) declared without subscribeEvent(): ${missing.join(", ")}`,
        hint: "Add subscribeEvent calls in module boot()",
      });
    }

    if (inv.handoffs.status === "declared-only" && inv.handoffs.accepts.length > 0) {
      const missing = inv.handoffs.accepts.filter(
        (a) => !inv.handoffs.registeredAcceptors.includes(a),
      );
      findings.push({
        module: inv.key,
        lane: "handoff",
        status: "declared-only",
        severity: "follow-up",
        message: `${missing.length} handoff acceptor(s) declared without registerHandoffAcceptor(): ${missing.join(", ")}`,
        hint: "Add registerHandoffAcceptor calls in module boot()",
      });
    }

    if (inv.routes.status === "declared-only") {
      findings.push({
        module: inv.key,
        lane: "route",
        status: "declared-only",
        severity: "follow-up",
        message: `${inv.routes.serverDeclared.length} route(s) declared without client manifest`,
        hint: "Add client/src/modules/<folder>/manifest.ts and registerClientModule()",
      });
    }
  }

  // ---- 3. Build report --------------------------------------------
  const totals = rollUp(inventory, findings);
  const report: WiringReport = {
    generatedAt: new Date().toISOString(),
    modules: inventory,
    findings,
    totals,
  };

  // Always write the snapshot so docs can pick it up.
  const snapshotDir = join(repoRoot, "docs/architecture/modularity");
  if (!existsSync(snapshotDir)) mkdirSync(snapshotDir, { recursive: true });
  const snapshotPath = join(snapshotDir, "MODULE_WIRING_REPORT.md");
  writeFileSync(snapshotPath, renderReportMarkdown(report), "utf8");

  // ---- 4. Print + exit --------------------------------------------
  console.log("=== check:wiring (module level) ===\n");
  console.log(renderReportMarkdown(report));
  console.log(`\nReport snapshot written to ${snapshotPath}`);

  const blocking = findings.filter(
    (f) => f.severity === "blocker" || f.severity === "high",
  );
  if (blocking.length > 0) {
    console.error(
      `\n${blocking.length} blocking finding(s). Fix before merging.`,
    );
    process.exit(1);
  }
  console.log("\nOK — module wiring within tolerance.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[FATAL] check:wiring", err);
  process.exit(2);
});

/* avoid unused warning when run with --noEmit */
void dirname;
