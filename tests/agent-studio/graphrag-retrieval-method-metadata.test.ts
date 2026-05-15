/**
 * Phase 12 §T-A.6 — graphrag retrieval-method metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  GRAPHRAG_RETRIEVAL_METHODS,
  GRAPHRAG_RETRIEVAL_METHOD_METADATA,
  getGraphragRetrievalMethodMetadata,
} from "../../server/agent-studio/services/rac/planner-mode.js";

describe("GRAPHRAG_RETRIEVAL_METHOD_METADATA (T-A.6)", () => {
  it("has metadata for every closed-taxonomy method", () => {
    for (const m of GRAPHRAG_RETRIEVAL_METHODS) {
      expect(GRAPHRAG_RETRIEVAL_METHOD_METADATA[m]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(GRAPHRAG_RETRIEVAL_METHOD_METADATA).length).toBe(
      GRAPHRAG_RETRIEVAL_METHODS.length,
    );
  });

  it.each(GRAPHRAG_RETRIEVAL_METHODS)(
    "%s has non-empty label + description + valid costClass + boolean invokesLlm",
    (m) => {
      const md = GRAPHRAG_RETRIEVAL_METHOD_METADATA[m];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(["low", "medium", "high"]).toContain(md.costClass);
      expect(typeof md.invokesLlm).toBe("boolean");
    },
  );

  it.each(GRAPHRAG_RETRIEVAL_METHODS)(
    "getGraphragRetrievalMethodMetadata(%s) returns table entry",
    (m) => {
      expect(getGraphragRetrievalMethodMetadata(m)).toBe(
        GRAPHRAG_RETRIEVAL_METHOD_METADATA[m],
      );
    },
  );

  it("only text2cypher invokes the LLM", () => {
    for (const m of GRAPHRAG_RETRIEVAL_METHODS) {
      const expected = m === "text2cypher";
      expect(GRAPHRAG_RETRIEVAL_METHOD_METADATA[m].invokesLlm).toBe(expected);
    }
  });

  it("local is low-cost; text2cypher and algorithm are high-cost", () => {
    expect(GRAPHRAG_RETRIEVAL_METHOD_METADATA.local.costClass).toBe("low");
    expect(GRAPHRAG_RETRIEVAL_METHOD_METADATA.text2cypher.costClass).toBe(
      "high",
    );
    expect(GRAPHRAG_RETRIEVAL_METHOD_METADATA.algorithm.costClass).toBe(
      "high",
    );
  });

  it("every costClass has at least one method assigned", () => {
    const used = new Set<string>();
    for (const m of GRAPHRAG_RETRIEVAL_METHODS) {
      used.add(GRAPHRAG_RETRIEVAL_METHOD_METADATA[m].costClass);
    }
    expect(used.has("low")).toBe(true);
    expect(used.has("medium")).toBe(true);
    expect(used.has("high")).toBe(true);
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const m of GRAPHRAG_RETRIEVAL_METHODS) {
      labels.add(GRAPHRAG_RETRIEVAL_METHOD_METADATA[m].label);
    }
    expect(labels.size).toBe(GRAPHRAG_RETRIEVAL_METHODS.length);
  });
});
