/**
 * T-I.67 — Time-window filter on the events card.
 *
 * Third axis of the events-card drill-in (after kind in T-I.64/65
 * and sourceKind in T-I.66). Operator-friendly preset buttons (1h /
 * 24h / 7d) that drive the server's existing `createdSince` filter
 * on `listErrorEvents` (already a pass-through on T-I.59's
 * `listRecentFailureStateEvents`). No new server-side surface.
 *
 * Source-scan asserts:
 *   1. New state `createdSinceWindowMs: useState<number | null>(null)`.
 *   2. useQuery passes `createdSince: createdSinceWindowMs !== null ?
 *      new Date(Date.now() - createdSinceWindowMs) : undefined` so
 *      the window slides with each refetch (not frozen at mount).
 *   3. Container has a stable testid.
 *   4. Three preset buttons (1h, 24h, 7d) each with per-label testid.
 *   5. Buttons rendered from an inline array via .map(...).
 *   6. Active button gets a `bg-muted` highlight.
 *   7. Toggle semantics — clicking the active window clears the filter.
 *   8. "All time" clear button renders only when a window is active.
 *   9. Filter row sits above the source-kind chip + below the kind dropdown.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const panelPath = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/GraphHealthAdminPanel.tsx",
);

describe("T-I.67 — time-window filter on the events card", () => {
  const src = readFileSync(panelPath, "utf8");

  it("declares createdSinceWindowMs as useState<number | null>(null)", () => {
    expect(src).toContain("setCreatedSinceWindowMs");
    expect(
      /createdSinceWindowMs[\s\S]{0,250}useState<\s*\n?\s*number \| null\s*>\(\s*\n?\s*null/.test(
        src,
      ),
    ).toBe(true);
  });

  it("useQuery threads createdSince derived from now − window", () => {
    expect(
      /createdSince:\s*\n?\s*createdSinceWindowMs\s*!==\s*null\s*\n?\s*\?\s*new Date\(Date\.now\(\)\s*-\s*createdSinceWindowMs\)/.test(
        src,
      ),
    ).toBe(true);
  });

  it("the window arg defaults to undefined when no window is active", () => {
    // Inside the same useQuery: `: undefined,` after the new Date(...).
    expect(
      /new Date\(Date\.now\(\)\s*-\s*createdSinceWindowMs\)\s*\n?\s*:\s*undefined/.test(
        src,
      ),
    ).toBe(true);
  });

  it("renders the time-window filter container with a stable testid", () => {
    expect(src).toContain(
      'data-testid="graph-health-failure-state-events-time-window-filter"',
    );
  });

  it("renders three preset buttons with per-label testids", () => {
    // Testids are template-literal driven (`${opt.label}`) rather
    // than per-button hardcoded strings, so we assert the template
    // form once + verify the inline preset array carries all 3
    // labels (the next test).
    expect(src).toContain(
      "data-testid={`graph-health-failure-state-events-time-window-${opt.label}`}",
    );
  });

  it("buttons are rendered from an inline preset array via .map(...)", () => {
    expect(
      /\[\s*\{\s*label:\s*"1h"[\s\S]{0,400}label:\s*"24h"[\s\S]{0,400}label:\s*"7d"[\s\S]{0,400}\]\s*as const[\s\S]{0,200}\.map\(\(opt\)/.test(
        src,
      ),
    ).toBe(true);
  });

  it("active button gets bg-muted highlight (visual filter feedback)", () => {
    expect(
      /createdSinceWindowMs\s*===\s*opt\.ms\s*\?\s*"bg-muted"\s*:\s*"bg-background"/.test(
        src,
      ),
    ).toBe(true);
  });

  it("toggle semantics — clicking the active window clears the filter", () => {
    expect(
      /setCreatedSinceWindowMs\(\s*createdSinceWindowMs\s*===\s*opt\.ms\s*\?\s*null\s*:\s*opt\.ms/.test(
        src,
      ),
    ).toBe(true);
  });

  it('"All time" clear renders only when a window is active', () => {
    expect(src).toContain(
      'data-testid="graph-health-failure-state-events-time-window-clear"',
    );
    expect(
      /createdSinceWindowMs\s*!==\s*null\s*\?\s*\([\s\S]{0,500}All time/.test(
        src,
      ),
    ).toBe(true);
  });

  it("filter row sits below the kind dropdown and above the sourceKind chip", () => {
    const kindIdx = src.indexOf(
      'data-testid="graph-health-failure-state-events-kind-filter"',
    );
    const timeIdx = src.indexOf(
      'data-testid="graph-health-failure-state-events-time-window-filter"',
    );
    const sourceChipIdx = src.indexOf(
      'data-testid="graph-health-failure-state-events-source-kind-filter-chip"',
    );
    expect(kindIdx).toBeGreaterThan(0);
    expect(timeIdx).toBeGreaterThan(kindIdx);
    expect(sourceChipIdx).toBeGreaterThan(timeIdx);
  });

  it("composes with kind + sourceKind — all 3 filters thread through the same useQuery", () => {
    const queryStart = src.indexOf(
      "trpc.agentStudio.workspaceObservability.listRecentFailureStateEvents.useQuery",
    );
    expect(queryStart).toBeGreaterThan(0);
    const queryWindow = src.slice(queryStart, queryStart + 1000);
    expect(queryWindow).toContain("kind: kindFilter !== null");
    expect(queryWindow).toContain("sourceKind: sourceKindFilter ?? undefined");
    expect(queryWindow).toContain("createdSince:");
  });
});
