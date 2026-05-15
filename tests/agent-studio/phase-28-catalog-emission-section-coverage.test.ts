/**
 * Phase 28 catalog §6 — emission shipment lockstep.
 *
 * Asserts the §6 emission shipment table references each PR / kind
 * that landed in the audit→bridge→batch-A sequence. When a new
 * batch-B wiring lands, this test forces the table to be updated.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const catalogPath = resolve(
  __dirname,
  "../../docs/implementation/agent-studio-phase-28-governance-acceptance-catalog.md",
);

const EXPECTED_SHIPMENTS = [
  // (PR ref, kind or shipment fragment)
  { pr: "#1002", fragment: "25 kinds" },
  { pr: "#1012", fragment: "audit" },
  { pr: "#1013", fragment: "recordFailureStateEvent" },
  { pr: "#1014", fragment: "neo4j_unavailable" },
  { pr: "#1015", fragment: "neo4j_projection_drift_detected" },
  { pr: "#1016", fragment: "retrieval_safety_filter_blocked_content" },
  { pr: "#1017", fragment: "tool_schema_changed" },
  { pr: "#1018", fragment: "text2cypher_rejected" },
  { pr: "#1019", fragment: "cypher_query_template_failed" },
  { pr: "#1020", fragment: "coverage guard" },
  { pr: "#1023", fragment: "graph_agent_answer_incomplete" },
  { pr: "#1025", fragment: "projection_sync_failed" },
  { pr: "#1026", fragment: "entity_resolution_conflict" },
];

describe("Phase 28 catalog §6 emission shipment lockstep", () => {
  const catalog = readFileSync(catalogPath, "utf8");

  it("has the §6 section header", () => {
    expect(catalog).toContain(
      "## 6. Phase 22 closed-taxonomy emission shipment",
    );
  });

  it.each(EXPECTED_SHIPMENTS)(
    "$pr is referenced with fragment '$fragment'",
    ({ pr, fragment }) => {
      // Both the PR number and the descriptive fragment must appear
      // anywhere in the catalog body (PR references aren't necessarily
      // on the same line as the fragment if a future edit splits rows).
      expect(catalog).toContain(pr);
      expect(catalog).toContain(fragment);
    },
  );

  it("notes 9 of 25 closed kinds have live emitters today", () => {
    expect(catalog).toContain("9 of 25 closed kinds have live emitters");
  });

  it("references the Phase 22 emission audit doc path", () => {
    expect(catalog).toContain(
      "docs/implementation/agent-studio-phase-22-failure-state-emission-audit.md",
    );
  });

  it("Forward-work table shows T-I.4 as shipped (not future)", () => {
    expect(catalog).toContain("shipped @ #1012");
  });
});
