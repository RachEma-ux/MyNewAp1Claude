#!/usr/bin/env tsx
/**
 * check:event-wiring
 *
 * Validates the event bus contract surface:
 *   - the EventEnvelope schema exposes the required fields
 *     (eventId, eventType, sourceModule, priority, workspaceId,
 *     actorId, correlationId, schemaVersion, payload, createdAt,
 *     idempotencyKey?)
 *   - the priority union has exactly: critical | high | normal | low
 *   - critical event handler failures are visible (criticalDeadLetter
 *     surfaced via getEventStats)
 *   - dead-letter behavior exists
 *   - idempotency uses `idempotencyKey ?? eventId`
 *   - every module that declares `events.consumes` has a runtime
 *     subscription registered (warn → follow-up if missing)
 *   - no event handler imports another module's private internals
 *
 * Operates on file sources only — no runtime side effects.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import {
  buildFullInventory,
  resolveRepoRoot,
} from "../server/platform/modules/wiring-inventory";
import type { WiringFinding } from "../server/platform/modules/wiring-types";

const PRIVATE_INDICATORS = [
  "/repository",
  "/connection",
  "/db",
  "/services/",
  "/executor",
];

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

async function main() {
  const repoRoot = resolveRepoRoot();
  const findings: WiringFinding[] = [];

  // ---- 1. Envelope schema invariants ------------------------------
  const envSrc = read(join(repoRoot, "server/platform/events/envelope.ts"));
  const requiredFields = [
    "eventId",
    "eventType",
    "sourceModule",
    "priority",
    "workspaceId",
    "actorId",
    "correlationId",
    "schemaVersion",
    "payload",
    "createdAt",
    "idempotencyKey",
  ];
  for (const f of requiredFields) {
    if (!new RegExp(`\\b${f}\\b`).test(envSrc)) {
      findings.push({
        module: "(platform)",
        lane: "event",
        status: "missing",
        severity: "blocker",
        message: `EventEnvelope missing required field '${f}'`,
        hint: "server/platform/events/envelope.ts",
      });
    }
  }
  // Priority union should have exactly 4 values.
  const priorityMatch = /EventPrioritySchema\s*=\s*z\.enum\(\s*\[([^\]]+)\]/.exec(envSrc);
  if (!priorityMatch) {
    findings.push({
      module: "(platform)",
      lane: "event",
      status: "missing",
      severity: "high",
      message: "EventPrioritySchema not found / not a z.enum",
    });
  } else {
    const values = [...priorityMatch[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
    const expected = ["critical", "high", "normal", "low"];
    for (const v of expected) {
      if (!values.includes(v)) {
        findings.push({
          module: "(platform)",
          lane: "event",
          status: "missing",
          severity: "blocker",
          message: `EventPriority missing required value '${v}'`,
        });
      }
    }
    for (const v of values) {
      if (!expected.includes(v)) {
        findings.push({
          module: "(platform)",
          lane: "event",
          status: "wired",
          severity: "medium",
          message: `EventPriority has unexpected value '${v}'`,
          hint: "Restrict to: critical | high | normal | low",
        });
      }
    }
  }

  // ---- 2. Bus contract: dead-letter, critical DL, idempotency ----
  const busSrc = read(join(repoRoot, "server/platform/events/bus.ts"));
  if (!/deadLetter\b/.test(busSrc)) {
    findings.push({
      module: "(platform)",
      lane: "event",
      status: "missing",
      severity: "blocker",
      message: "Event bus has no dead-letter mechanism",
    });
  }
  if (!/criticalDeadLetter/.test(busSrc)) {
    findings.push({
      module: "(platform)",
      lane: "event",
      status: "missing",
      severity: "high",
      message: "Event bus does not surface criticalDeadLetter — critical handler failures invisible",
    });
  }
  if (!/idempotencyKey\s*\?\?\s*[\w.]+\.eventId/.test(busSrc) && !/idempotencyKey\s*\?\?\s*env\.eventId/.test(busSrc)) {
    findings.push({
      module: "(platform)",
      lane: "event",
      status: "wired",
      severity: "medium",
      message: "Idempotency lookup does not use `idempotencyKey ?? eventId` pattern",
      hint: "server/platform/events/bus.ts dedupIdOf()",
    });
  }
  if (!/getEventStats/.test(busSrc)) {
    findings.push({
      module: "(platform)",
      lane: "event",
      status: "missing",
      severity: "high",
      message: "Event bus does not export getEventStats() — Digital HQ cannot snapshot",
    });
  }

  // ---- 3. Per-module subscription wiring -------------------------
  const inventory = buildFullInventory({ repoRoot });
  for (const inv of inventory) {
    if (inv.events.consumes.length === 0) continue;
    const missing = inv.events.consumes.filter((c) => !inv.events.subscribed.includes(c));
    if (missing.length > 0) {
      findings.push({
        module: inv.key,
        lane: "event",
        status: "declared-only",
        severity: "follow-up",
        message: `${missing.length} declared subscription(s) missing subscribeEvent(): ${missing.join(", ")}`,
        hint: `Wire in ${inv.folder}/boot.ts`,
      });
    }
  }

  // ---- 4. No event handler imports module private internals ------
  const eventFiles = walk(join(repoRoot, "server")).filter(
    (f) => /events?\.ts$/.test(f) || /event-handlers/.test(f),
  );
  for (const f of eventFiles) {
    const src = read(f);
    const importLines = src.match(/^import[^;]*from\s*["'`][^"'`]+["'`]/gm) ?? [];
    for (const line of importLines) {
      for (const ind of PRIVATE_INDICATORS) {
        if (line.includes(ind)) {
          findings.push({
            module: "(platform)",
            lane: "event",
            status: "wired",
            severity: "high",
            message: `Event handler file imports a private path: ${line.trim()}`,
            hint: relative(repoRoot, f),
          });
        }
      }
    }
  }

  // ---- 5. Print + exit --------------------------------------------
  console.log("=== check:event-wiring ===");
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
  console.log("\nOK — event wiring within tolerance.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[FATAL] check:event-wiring", err);
  process.exit(2);
});
