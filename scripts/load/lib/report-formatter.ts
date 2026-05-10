/**
 * Phase 12 (Roadmap V3) — runtime load certification: report formatter.
 *
 * Renders a `LoadReport` (from `slo-checker.ts`) as markdown
 * suitable for pasting into a release runbook, filing as a Gate 7
 * certification artifact, or appending to an audit log entry.
 */

import type { LoadReport, SloVerdict } from "./types";

function verdictBadge(v: SloVerdict): string {
  if (v === "PASS") return "✅ PASS";
  if (v === "FAIL") return "❌ FAIL";
  return "⚠️ UNKNOWN";
}

export function formatLoadReport(report: LoadReport): string {
  const lines: string[] = [];
  lines.push("# Runtime Load Certification Report");
  lines.push("");
  lines.push(`**Environment:** ${report.input.environment}`);
  lines.push(`**Captured:** ${report.input.timestamp}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Overall: ${report.summary.overallPass ? "✅ **PASS**" : "❌ **NOT PASS**"}`);
  lines.push(`- PASS: ${report.summary.pass} / ${report.summary.totalSlos}`);
  lines.push(`- FAIL: ${report.summary.fail}`);
  lines.push(`- UNKNOWN: ${report.summary.unknown}`);
  lines.push("");
  if (report.summary.unknown > 0) {
    lines.push(
      "> ⚠️ UNKNOWN entries indicate the load harness didn't capture the relevant " +
        "metric. Gate 7 certification requires every SLO to PASS — UNKNOWNs are " +
        "treated as missing data, not implicit pass. Re-run the harness with the " +
        "missing capture configured.",
    );
    lines.push("");
  }
  lines.push("## Per-SLO Assessment");
  lines.push("");
  lines.push("| SLO | Metric | Target | Observed | Verdict | Reason |");
  lines.push("|---|---|---|---|---|---|");
  for (const a of report.assessments) {
    const reason = a.reason ?? "";
    lines.push(
      `| ${a.sloId} | ${a.metric} | ${a.target} | ${a.observed} | ${verdictBadge(a.verdict)} | ${reason} |`,
    );
  }
  lines.push("");
  lines.push("## Source");
  lines.push("");
  lines.push(
    "SLO definitions: `docs/operations/agent-studio-runtime-slo.md` (version 1.0.0, Phase 11c).",
  );
  lines.push(
    "Checker source: `scripts/load/lib/slo-checker.ts` (Phase 12).",
  );
  lines.push(
    "Roadmap closure: Gate 7 (Observability + Load Baseline). All four phases must close — 11a + 11c + 11b + 12.",
  );
  return lines.join("\n");
}
