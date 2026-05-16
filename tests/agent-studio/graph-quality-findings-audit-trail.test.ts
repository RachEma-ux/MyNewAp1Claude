/**
 * Graph Quality Findings audit-trail expansion — θ-slice
 * (T-F.86 / T-F.4-θ).
 *
 * Adds per-row "View trail" affordance that toggles an inline
 * expansion row consuming the pre-existing
 * `getFindingAuditTrail` tRPC procedure. Only one row's trail is
 * open at a time; the trail query is gated (`enabled:
 * expandedFindingId !== null`) so the round-trip only happens when
 * an operator opens a row.
 *
 * Source-scan integrity test locks the gated query + the inline
 * expansion shape + per-section testid namespace.
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

describe("Graph Quality Findings audit-trail θ-slice (T-F.86 / T-F.4-θ)", () => {
  it("panel holds expandedFindingId state at the panel level (number | null)", () => {
    const src = readPanel();
    expect(src).toMatch(
      /const\s+\[expandedFindingId,\s*setExpandedFindingId\]\s*=\s*useState<number\s*\|\s*null>\(\s*null,?\s*\)/,
    );
  });

  it("trailQ uses getFindingAuditTrail with the `enabled` gate", () => {
    const src = readPanel();
    expect(src).toMatch(
      /trailQ\s*=\s*trpc\.agentStudio\.graphQuality\.getFindingAuditTrail\.useQuery/,
    );
    expect(src).toMatch(/enabled:\s*expandedFindingId\s*!==\s*null/);
    expect(src).toMatch(/findingId:\s*expandedFindingId\s*\?\?\s*0/);
  });

  it("per-row toggle button uses per-id testid and toggles label View/Hide trail", () => {
    const src = readPanel();
    expect(src).toMatch(
      /data-testid=\{`graph-quality-finding-trail-toggle-\$\{f\.id\}`\}/,
    );
    expect(src).toMatch(/isExpanded\s*\?\s*"Hide trail"\s*:\s*"View trail"/);
  });

  it("expansion row uses a 6-col colSpan to span the full table width", () => {
    const src = readPanel();
    expect(src).toMatch(
      /isExpanded\s*\?\s*\([\s\S]{0,400}colSpan=\{6\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`graph-quality-finding-trail-row-\$\{f\.id\}`\}/,
    );
  });

  it("FindingTrailView renders 3 sections — finding / proposal / audit events", () => {
    const src = readPanel();
    expect(src).toMatch(/function\s+FindingTrailView\s*\(/);
    expect(src).toMatch(/const\s+\{\s*finding,\s*proposal,\s*auditEvents\s*\}/);
    // Per-section testid namespace.
    expect(src).toMatch(
      /data-testid=\{`graph-quality-finding-trail-details-\$\{findingId\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`graph-quality-finding-trail-proposal-\$\{findingId\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`graph-quality-finding-trail-audit-\$\{findingId\}`\}/,
    );
  });

  it("FindingTrailView handles loading + error + unavailable + empty-proposal + empty-audit states", () => {
    const src = readPanel();
    expect(src).toMatch(
      /data-testid=\{`graph-quality-finding-trail-loading-\$\{findingId\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`graph-quality-finding-trail-error-\$\{findingId\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`graph-quality-finding-trail-unavailable-\$\{findingId\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`graph-quality-finding-trail-proposal-empty-\$\{findingId\}`\}/,
    );
    expect(src).toMatch(
      /data-testid=\{`graph-quality-finding-trail-audit-empty-\$\{findingId\}`\}/,
    );
  });

  it("Fragment is imported from react to enable adjacent <tr> + expansion-<tr> pairs", () => {
    const src = readPanel();
    expect(src).toMatch(/import\s+\{\s*Fragment,\s*useState\s*\}\s+from\s+"react"/);
    expect(src).toMatch(/<Fragment key=\{f\.id\}>/);
  });
});
