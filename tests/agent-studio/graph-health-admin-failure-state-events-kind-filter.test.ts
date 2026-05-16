/**
 * T-I.64 — UI consumer for the T-I.63 `kind` narrower on
 * `listRecentFailureStateEvents`.
 *
 * The T-I.59 stream is capped at 50 rows by T-I.60 — during an
 * incident where a single kind floods (e.g. `graph_query_timeout`),
 * operators investigating a quieter kind lose tail visibility. This
 * adds a `<select>` dropdown above the events card content; the
 * selection drives the `kind` arg on the existing useQuery.
 *
 * Source-scan asserts:
 *   1. The dropdown testid is present.
 *   2. A 25-kind option list constant exists and contains all closed
 *      taxonomy kinds (canonical names mirrored from contracts.ts).
 *   3. The dropdown options are rendered from that constant via
 *      `.map(...)` so option-list drift is structurally bounded.
 *   4. "All kinds" is the null-selection option.
 *   5. The useQuery receives `kind: kindFilter !== null ? [...] : undefined`.
 *   6. `kindFilter` is a `useState<string | null>(null)` (defaults to no filter).
 *   7. Selecting "" clears the filter back to null.
 *   8. A "Clear" button appears only when a kind is selected.
 *   9. The dropdown is rendered outside the loading/error/null-data
 *      conditional so the operator can change filter at any time.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const panelPath = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/GraphHealthAdminPanel.tsx",
);

// Canonical closed-taxonomy kinds, mirrored from
// `server/agent-studio/services/failure-states/contracts.ts`. If either
// list drifts the source-scan fails loudly.
const EXPECTED_KINDS = [
  "promotion_failed",
  "note_conflict",
  "entity_resolution_conflict",
  "neo4j_unavailable",
  "neo4j_degraded",
  "neo4j_query_timeout",
  "neo4j_projection_stale",
  "neo4j_projection_drift_detected",
  "projection_sync_failed",
  "graph_query_timeout",
  "backlink_refresh_failed",
  "runtime_reference_hidden_by_permission",
  "cag_reference_invalidated",
  "graph_skill_reference_invalidated",
  "tool_schema_changed",
  "search_index_stale",
  "query_cache_stale",
  "text2cypher_rejected",
  "cypher_query_template_failed",
  "retrieval_safety_filter_blocked_content",
  "graph_agent_answer_incomplete",
  "golden_question_failed",
  "graph_correction_rejected",
  "semantic_enrichment_rejected",
  "background_job_failed",
];

describe("T-I.64 — kind-filter dropdown on the failure-state events card", () => {
  const src = readFileSync(panelPath, "utf8");

  it("renders the kind-filter <select> with a stable testid", () => {
    expect(src).toContain(
      'data-testid="graph-health-failure-state-events-kind-filter"',
    );
  });

  it("declares the FAILURE_STATE_KIND_OPTIONS constant", () => {
    expect(src).toContain("const FAILURE_STATE_KIND_OPTIONS = [");
    expect(src).toContain("] as const");
  });

  it("the option list contains all 25 closed-taxonomy kinds", () => {
    for (const kind of EXPECTED_KINDS) {
      expect(src).toContain(`"${kind}"`);
    }
    expect(EXPECTED_KINDS.length).toBe(25);
  });

  it("options are rendered from the constant via .map(...)", () => {
    expect(
      /FAILURE_STATE_KIND_OPTIONS\.map\(\(k\)\s*=>[\s\S]{0,200}<option key=\{k\} value=\{k\}>/.test(
        src,
      ),
    ).toBe(true);
  });

  it('"All kinds" is the null-selection option', () => {
    expect(
      /<option value="">All kinds<\/option>/.test(src),
    ).toBe(true);
  });

  it("the useQuery wires `kind: kindFilter !== null ? [...] : undefined`", () => {
    expect(src).toContain(
      "kind: kindFilter !== null ? [kindFilter as never] : undefined",
    );
  });

  it("kindFilter is a useState<string | null> defaulting to null", () => {
    expect(src).toContain(
      "useState<string | null>(null)",
    );
    expect(src).toContain("setKindFilter");
  });

  it("selecting '' (the All-kinds option) clears the filter back to null", () => {
    expect(
      /e\.target\.value\s*===\s*""\s*\?\s*null\s*:\s*e\.target\.value/.test(
        src,
      ),
    ).toBe(true);
  });

  it("Clear button is gated on kindFilter !== null", () => {
    expect(
      /kindFilter\s*!==\s*null\s*\?\s*\([\s\S]{0,500}<button[\s\S]{0,300}graph-health-failure-state-events-kind-filter-clear/.test(
        src,
      ),
    ).toBe(true);
  });

  it("dropdown rendered outside the data-conditional branches", () => {
    // The dropdown testid must appear BEFORE the loading / error /
    // null-data ternary chain so the operator can interact with the
    // filter regardless of query state. Anchor: the SectionLabel
    // "Recent failure-state events".
    const sectionIdx = src.indexOf("Recent failure-state events");
    const filterIdx = src.indexOf(
      'data-testid="graph-health-failure-state-events-kind-filter"',
    );
    const loadingIdx = src.indexOf(
      "Loading recent failure-state events",
    );
    expect(sectionIdx).toBeGreaterThan(0);
    expect(filterIdx).toBeGreaterThan(sectionIdx);
    expect(loadingIdx).toBeGreaterThan(filterIdx);
  });
});
