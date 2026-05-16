/**
 * Graph Quality Findings drill-in filters — γ-slice (T-F.84 / T-F.4-γ).
 *
 * Extends T-F.83's findings list with two server-side filter axes:
 *   - severity (low / medium / high / critical)
 *   - status (open / triaged / applied / dismissed)
 *
 * Mirrors the lens-browser T-F.72/T-F.73 visibility/typeKey filter
 * shape but the filters are server-side (round-tripped through
 * `listFindings`) because the LIMIT cap would silently filter to
 * zero rows under client-side narrowing.
 *
 * Source-scan integrity test locks the filter union types + the
 * round-tripped tRPC input + the per-mode testid + the Clear-all
 * empty-state recovery.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function readPanel(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/components/GraphQualityFindingsPanel.tsx",
    ),
    "utf8",
  );
}

describe("Graph Quality Findings drill-in filters γ-slice (T-F.84 / T-F.4-γ)", () => {
  it("severity + status filters use closed-taxonomy unions sourced from the server enums", () => {
    const src = readPanel();
    expect(src).toMatch(
      /SEVERITY_VALUES\s*=\s*\["low",\s*"medium",\s*"high",\s*"critical"\]\s+as\s+const/,
    );
    expect(src).toMatch(
      /STATUS_VALUES\s*=\s*\["open",\s*"triaged",\s*"applied",\s*"dismissed"\]\s+as\s+const/,
    );
    // Filter unions allow null (the "all" mode).
    expect(src).toMatch(
      /SeverityFilter\s*=\s*\(typeof\s+SEVERITY_VALUES\)\[number\]\s*\|\s*null/,
    );
    expect(src).toMatch(
      /StatusFilter\s*=\s*\(typeof\s+STATUS_VALUES\)\[number\]\s*\|\s*null/,
    );
  });

  it("filters are round-tripped through listFindings tRPC (server-side narrowing)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /listFindings\.useQuery\(\s*\{\s*limit:\s*FINDINGS_LIST_LIMIT,\s*\.\.\.\(severityFilter\s*\?\s*\{\s*severity:\s*severityFilter\s*\}\s*:\s*\{\}\)/,
    );
    expect(src).toMatch(
      /\.\.\.\(statusFilter\s*\?\s*\{\s*status:\s*statusFilter\s*\}\s*:\s*\{\}\)/,
    );
  });

  it("each filter group renders one button per mode + the 'all' reset + per-mode testid", () => {
    const src = readPanel();
    expect(src).toMatch(/data-testid="graph-quality-severity-filter-group"/);
    expect(src).toMatch(/data-testid="graph-quality-status-filter-group"/);
    expect(src).toMatch(
      /data-testid=\{`graph-quality-severity-filter-\$\{mode\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`graph-quality-status-filter-\$\{mode\}`\}/,
    );
    // The button rows iterate ["all", ...VALUES] so each axis has 5 buttons.
    expect(src).toMatch(/\["all",\s*\.\.\.SEVERITY_VALUES\]\s+as\s+const/);
    expect(src).toMatch(/\["all",\s*\.\.\.STATUS_VALUES\]\s+as\s+const/);
  });

  it("hasAnyFilter is the OR of both axes — drives Clear-all visibility + header copy", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+hasAnyFilter\s*=\s*severityFilter\s*!==\s*null\s*\|\|\s*statusFilter\s*!==\s*null/,
    );
    expect(src).toMatch(
      /hasAnyFilter[\s\S]{0,500}first \$\{FINDINGS_LIST_LIMIT\} matching filters/,
    );
  });

  it("top-level Clear-all button is gated on hasAnyFilter", () => {
    const src = readPanel();
    expect(src).toMatch(
      /hasAnyFilter\s*\?\s*\([\s\S]{0,300}data-testid="graph-quality-clear-all-filters"[\s\S]{0,200}onClick=\{clearAllFilters\}/,
    );
  });

  it("empty-state row mentions filters when hasAnyFilter is true + offers Clear-all recovery", () => {
    const src = readPanel();
    expect(src).toContain("No findings match the active filters.");
    expect(src).toMatch(/data-testid="graph-quality-empty-state-clear-all"/);
  });

  it("clearAllFilters helper resets both filter setters", () => {
    const src = readPanel();
    expect(src).toMatch(
      /function\s+clearAllFilters[\s\S]{0,200}setSeverityFilter\(null\)[\s\S]{0,80}setStatusFilter\(null\)/,
    );
  });
});
