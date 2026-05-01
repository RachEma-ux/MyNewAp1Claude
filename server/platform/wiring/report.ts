/**
 * Application Wiring Inventory — Markdown report writer
 *
 * Used by `scripts/check-wiring-inventory.ts` to refresh
 * `docs/architecture/modularity/MODULE_WIRING_REPORT.md` (the per-PR
 * snapshot the team reviews) without burying the new AWI areas in the
 * legacy report from `server/platform/modules/wiring-report.ts`.
 *
 * Pure formatter — no IO inside this file. The check script writes
 * the resulting string to disk.
 */
import type {
  ModuleWiringInventory,
  WiringInventorySummary,
  WiringMatrix,
} from "./types";

export interface RenderedReport {
  markdown: string;
  totals: WiringInventorySummary;
}

export function renderApplicationWiringReport(matrix: WiringMatrix): RenderedReport {
  const lines: string[] = [];
  lines.push("# Application Wiring Inventory");
  lines.push("");
  lines.push(`Generated: ${matrix.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  const s = matrix.summary;
  lines.push(`- Modules: **${s.moduleCount}**`);
  lines.push(`- Fully wired: **${s.fullyWiredCount}**`);
  lines.push(`- Mostly wired: **${s.mostlyWiredCount}**`);
  lines.push(`- Partially wired: **${s.partialCount}**`);
  lines.push(`- Declared only: **${s.declaredOnlyCount}**`);
  lines.push(`- Blocked: **${s.blockedCount}**`);
  lines.push(`- Average readiness score: **${s.averageReadinessScore}**`);
  lines.push(`- Blockers: **${s.blockers}**`);
  lines.push(`- Warnings: **${s.warnings}**`);
  lines.push(`- Missing required wires: **${s.missingRequiredWires}**`);
  lines.push("");

  lines.push("## Module readiness");
  lines.push("");
  lines.push("| Module | Readiness | Status | Blockers | Warnings |");
  lines.push("|---|---:|---|---:|---:|");
  for (const mod of matrix.modules) {
    lines.push(
      `| ${mod.moduleName} (${mod.moduleKey}) | ${mod.readinessScore} | ${mod.readinessStatus} | ${mod.blockers.length} | ${mod.warnings.length} |`,
    );
  }
  lines.push("");

  lines.push("## Wiring matrix");
  lines.push("");
  lines.push("Status legend: ✅ wired · 🟡 partial · ⚪ declared-only · 🚫 missing/broken/blocked · — not-applicable");
  lines.push("");
  const headers = ["Module", ...matrix.columns];
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`|${headers.map(() => "---").join("|")}|`);
  for (const mod of matrix.modules) {
    const cells = [mod.moduleKey];
    for (const col of matrix.columns) {
      const a = mod.areas.find((x) => x.area === col);
      cells.push(symbolFor(a?.status));
    }
    lines.push(`| ${cells.join(" | ")} |`);
  }
  lines.push("");

  const allBlockers = matrix.modules.flatMap((m) =>
    m.blockers.map((b) => ({ moduleKey: m.moduleKey, blocker: b })),
  );
  if (allBlockers.length > 0) {
    lines.push("## Blockers");
    lines.push("");
    for (const b of allBlockers) {
      lines.push(`- \`${b.moduleKey}\` — ${b.blocker}`);
    }
    lines.push("");
  }

  const allWarnings = matrix.modules.flatMap((m) =>
    m.warnings.map((w) => ({ moduleKey: m.moduleKey, warning: w })),
  );
  if (allWarnings.length > 0) {
    lines.push("## Warnings");
    lines.push("");
    for (const w of allWarnings) {
      lines.push(`- \`${w.moduleKey}\` — ${w.warning}`);
    }
    lines.push("");
  }

  return { markdown: lines.join("\n") + "\n", totals: s };
}

function symbolFor(status: ModuleWiringInventory["areas"][number]["status"] | undefined): string {
  switch (status) {
    case "wired":
      return "✅";
    case "partial":
      return "🟡";
    case "declared-only":
      return "⚪";
    case "missing":
    case "broken":
    case "blocked":
      return "🚫";
    case "not-applicable":
    case undefined:
      return "—";
  }
}
