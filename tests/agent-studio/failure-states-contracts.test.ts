/**
 * Phase 22 Failure-State Closed Taxonomy — T-I.3.
 *
 * Tests the 25-failure-state closed taxonomy + category /severity /
 * recoverable metadata.
 */

import { describe, it, expect } from "vitest";
import {
  FAILURE_STATES,
  FAILURE_STATE_CATEGORIES,
  FAILURE_STATE_SEVERITIES,
  FAILURE_STATE_METADATA,
  isFailureState,
  listFailureStatesByCategory,
  listFailureStatesBySeverity,
  listOperatorActionRequiredFailureStates,
} from "../../server/agent-studio/services/failure-states/public-api";

describe("Closed failure-state taxonomy", () => {
  it("contains exactly 25 roadmap-named states", () => {
    expect(FAILURE_STATES).toHaveLength(25);
  });

  it("isFailureState narrows correctly", () => {
    expect(isFailureState("promotion_failed")).toBe(true);
    expect(isFailureState("background_job_failed")).toBe(true);
    expect(isFailureState("custom_state")).toBe(false);
    expect(isFailureState(42)).toBe(false);
  });

  it("ids are unique", () => {
    expect(new Set(FAILURE_STATES).size).toBe(FAILURE_STATES.length);
  });

  it("every state has metadata", () => {
    for (const s of FAILURE_STATES) {
      expect(FAILURE_STATE_METADATA[s]).toBeDefined();
    }
  });

  it("every metadata.category is in the closed taxonomy", () => {
    for (const s of FAILURE_STATES) {
      const cat = FAILURE_STATE_METADATA[s].category;
      expect(FAILURE_STATE_CATEGORIES).toContain(cat);
    }
  });

  it("every metadata.defaultSeverity is in the closed taxonomy", () => {
    for (const s of FAILURE_STATES) {
      const sev = FAILURE_STATE_METADATA[s].defaultSeverity;
      expect(FAILURE_STATE_SEVERITIES).toContain(sev);
    }
  });

  it("every metadata.description is non-empty", () => {
    for (const s of FAILURE_STATES) {
      expect(FAILURE_STATE_METADATA[s].description.length).toBeGreaterThan(
        20,
      );
    }
  });
});

describe("Closed sub-taxonomies", () => {
  it("5 categories", () => {
    expect([...FAILURE_STATE_CATEGORIES]).toEqual([
      "infrastructure",
      "governance",
      "retrieval",
      "agent",
      "runtime",
    ]);
  });

  it("3 severities", () => {
    expect([...FAILURE_STATE_SEVERITIES]).toEqual([
      "info",
      "warning",
      "critical",
    ]);
  });
});

describe("Category-based filtering", () => {
  it("infrastructure includes neo4j-class states", () => {
    const inf = listFailureStatesByCategory("infrastructure");
    expect(inf).toContain("neo4j_unavailable");
    expect(inf).toContain("neo4j_degraded");
    expect(inf).toContain("projection_sync_failed");
  });

  it("governance includes promotion / approval states", () => {
    const gov = listFailureStatesByCategory("governance");
    expect(gov).toContain("promotion_failed");
    expect(gov).toContain("graph_correction_rejected");
    expect(gov).toContain("cag_reference_invalidated");
  });

  it("retrieval includes search / cypher / text2cypher states", () => {
    const ret = listFailureStatesByCategory("retrieval");
    expect(ret).toContain("text2cypher_rejected");
    expect(ret).toContain("cypher_query_template_failed");
    expect(ret).toContain("query_cache_stale");
  });

  it("agent includes graph_agent_* + golden_question states", () => {
    const ag = listFailureStatesByCategory("agent");
    expect(ag).toContain("graph_agent_answer_incomplete");
    expect(ag).toContain("golden_question_failed");
  });

  it("runtime includes note_conflict + background_job_failed", () => {
    const rt = listFailureStatesByCategory("runtime");
    expect(rt).toContain("note_conflict");
    expect(rt).toContain("background_job_failed");
  });

  it("category partition is exhaustive (every state in exactly one category)", () => {
    const seen = new Set<string>();
    for (const cat of FAILURE_STATE_CATEGORIES) {
      for (const s of listFailureStatesByCategory(cat)) {
        expect(seen.has(s)).toBe(false);
        seen.add(s);
      }
    }
    expect(seen.size).toBe(FAILURE_STATES.length);
  });
});

describe("Severity-based filtering", () => {
  it("critical states include neo4j_unavailable + promotion_failed", () => {
    const crit = listFailureStatesBySeverity("critical");
    expect(crit).toContain("neo4j_unavailable");
    expect(crit).toContain("promotion_failed");
  });

  it("info states include stale / redaction signals", () => {
    const inf = listFailureStatesBySeverity("info");
    expect(inf).toContain("neo4j_projection_stale");
    expect(inf).toContain("runtime_reference_hidden_by_permission");
  });

  it("severity partition is exhaustive", () => {
    const seen = new Set<string>();
    for (const sev of FAILURE_STATE_SEVERITIES) {
      for (const s of listFailureStatesBySeverity(sev)) seen.add(s);
    }
    expect(seen.size).toBe(FAILURE_STATES.length);
  });
});

describe("Operator-action-required surface", () => {
  it("includes states the system cannot auto-recover", () => {
    const req = listOperatorActionRequiredFailureStates();
    expect(req).toContain("promotion_failed");
    expect(req).toContain("neo4j_unavailable");
    expect(req).toContain("projection_sync_failed");
    expect(req).toContain("cag_reference_invalidated");
    expect(req).toContain("graph_skill_reference_invalidated");
    expect(req).toContain("tool_schema_changed");
    expect(req).toContain("cypher_query_template_failed");
    expect(req).toContain("retrieval_safety_filter_blocked_content");
    expect(req).toContain("golden_question_failed");
    expect(req).toContain("neo4j_projection_drift_detected");
  });

  it("does NOT include recoverable states", () => {
    const req = listOperatorActionRequiredFailureStates();
    expect(req).not.toContain("note_conflict");
    expect(req).not.toContain("neo4j_degraded");
    expect(req).not.toContain("query_cache_stale");
    expect(req).not.toContain("background_job_failed");
  });

  it("at least 9 states require operator action (coverage floor for the dashboard surface)", () => {
    expect(
      listOperatorActionRequiredFailureStates().length,
    ).toBeGreaterThanOrEqual(9);
  });
});
