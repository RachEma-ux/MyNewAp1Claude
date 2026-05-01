/**
 * Module Wiring — Report writer
 *
 * Renders a `WiringReport` as Markdown. Used by:
 *   - `scripts/check-module-wiring.ts` to print to stdout
 *   - the docs generator to refresh
 *     `docs/architecture/modularity/MODULE_WIRING_REPORT.md`
 *
 * Pure function: takes a report, returns a string. No I/O here.
 */

import type {
  ModuleWiringInventory,
  WiringFinding,
  WiringReport,
  WiringSeverity,
  WiringStatus,
} from "./wiring-types";
import { isFollowUp } from "./wiring-types";

const STATUS_BADGE: Record<WiringStatus, string> = {
  wired: "WIRED",
  "declared-only": "DECL",
  missing: "MISS",
  "not-applicable": "n/a",
};

const SEVERITY_BADGE: Record<WiringSeverity, string> = {
  blocker: "BLOCK",
  high: "HIGH ",
  medium: "MED  ",
  low: "LOW  ",
  "follow-up": "F/UP ",
};

export function renderReportMarkdown(report: WiringReport): string {
  const lines: string[] = [];
  lines.push("# Module Wiring Report");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  if (report.commit) lines.push(`Commit: \`${report.commit}\``);
  lines.push("");
  lines.push("## Totals");
  lines.push("");
  lines.push(`- Modules tracked: **${report.totals.modules}**`);
  lines.push(`- Fully wired: **${report.totals.fullyWired}**`);
  lines.push(`- Declared-only: **${report.totals.declaredOnly}**`);
  lines.push(`- Blockers: **${report.totals.blockers}**`);
  lines.push(`- Follow-ups: **${report.totals.followUps}**`);
  lines.push("");

  lines.push("## Per-module status");
  lines.push("");
  lines.push("| Module | Manifest | Router | Runtime | DB | PublicAPI | Events | Handoffs | Routes | Gov | HQ |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const m of report.modules) {
    lines.push(
      [
        m.key,
        m.serverManifestExists ? "✓" : "✗",
        m.routerRegistered ? "✓" : "✗",
        STATUS_BADGE[m.runtime.status],
        STATUS_BADGE[m.database.status],
        STATUS_BADGE[m.publicApi.status],
        STATUS_BADGE[m.events.status],
        STATUS_BADGE[m.handoffs.status],
        STATUS_BADGE[m.routes.status],
        STATUS_BADGE[m.governanceActions.status],
        STATUS_BADGE[m.digitalHq.status],
      ].map((c) => `| ${c} `).join("") + "|",
    );
  }
  lines.push("");

  if (report.findings.length === 0) {
    lines.push("## Findings");
    lines.push("");
    lines.push("No findings. Every declared lane has a runtime registration.");
    lines.push("");
  } else {
    lines.push("## Findings");
    lines.push("");
    const blockers = report.findings.filter((f) => f.severity === "blocker");
    const highs = report.findings.filter((f) => f.severity === "high");
    const meds = report.findings.filter((f) => f.severity === "medium");
    const lows = report.findings.filter((f) => f.severity === "low");
    const fups = report.findings.filter(isFollowUpFinding);

    if (blockers.length) {
      lines.push("### BLOCKER");
      for (const f of blockers) lines.push(formatFinding(f));
      lines.push("");
    }
    if (highs.length) {
      lines.push("### HIGH");
      for (const f of highs) lines.push(formatFinding(f));
      lines.push("");
    }
    if (meds.length) {
      lines.push("### MEDIUM");
      for (const f of meds) lines.push(formatFinding(f));
      lines.push("");
    }
    if (lows.length) {
      lines.push("### LOW");
      for (const f of lows) lines.push(formatFinding(f));
      lines.push("");
    }
    if (fups.length) {
      lines.push("### FOLLOW-UP");
      for (const f of fups) lines.push(formatFinding(f));
      lines.push("");
    }
  }

  return lines.join("\n");
}

function formatFinding(f: WiringFinding): string {
  const tail = f.hint ? ` _(hint: ${f.hint})_` : "";
  return `- **${f.module}** [${f.lane}] — ${f.message}${tail}`;
}

function isFollowUpFinding(f: WiringFinding): boolean {
  return isFollowUp(f.severity);
}

/* ------------------------------------------------------------------ */
/*  Roll-up helper                                                    */
/* ------------------------------------------------------------------ */

export function rollUp(
  modules: ModuleWiringInventory[],
  findings: WiringFinding[],
): WiringReport["totals"] {
  let fullyWired = 0;
  let declaredOnly = 0;
  for (const m of modules) {
    const lanes = [
      m.runtime.status,
      m.database.status,
      m.publicApi.status,
      m.events.status,
      m.handoffs.status,
      m.routes.status,
      m.governanceActions.status,
      m.digitalHq.status,
    ];
    const realLanes = lanes.filter((s) => s !== "not-applicable");
    if (realLanes.length > 0 && realLanes.every((s) => s === "wired")) {
      fullyWired++;
    }
    if (lanes.some((s) => s === "declared-only")) {
      declaredOnly++;
    }
  }
  const blockers = findings.filter((f) => f.severity === "blocker" || f.severity === "high").length;
  const followUps = findings.filter(isFollowUpFinding).length;
  return {
    modules: modules.length,
    fullyWired,
    declaredOnly,
    blockers,
    followUps,
  };
}
