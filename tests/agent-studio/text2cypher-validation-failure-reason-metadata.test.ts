/**
 * Phase G §T-G.37 — Text2Cypher validation failure-reason metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  TEXT2CYPHER_VALIDATION_FAILURE_REASONS,
  TEXT2CYPHER_VALIDATION_FAILURE_REASON_METADATA,
  getText2CypherValidationFailureReasonMetadata,
} from "../../server/agent-studio/services/graph/retrieval/text2cypher-validator.js";

const VALID_CATEGORIES = ["structural", "security", "policy"] as const;

describe("TEXT2CYPHER_VALIDATION_FAILURE_REASON_METADATA (T-G.37)", () => {
  it("has metadata for every closed-taxonomy reason", () => {
    for (const r of TEXT2CYPHER_VALIDATION_FAILURE_REASONS) {
      expect(TEXT2CYPHER_VALIDATION_FAILURE_REASON_METADATA[r]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(
      Object.keys(TEXT2CYPHER_VALIDATION_FAILURE_REASON_METADATA).length,
    ).toBe(TEXT2CYPHER_VALIDATION_FAILURE_REASONS.length);
  });

  it.each(TEXT2CYPHER_VALIDATION_FAILURE_REASONS)(
    "%s has non-empty label + description + valid category + boolean isHardSecurityViolation",
    (r) => {
      const md = TEXT2CYPHER_VALIDATION_FAILURE_REASON_METADATA[r];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(VALID_CATEGORIES).toContain(md.category);
      expect(typeof md.isHardSecurityViolation).toBe("boolean");
    },
  );

  it.each(TEXT2CYPHER_VALIDATION_FAILURE_REASONS)(
    "getText2CypherValidationFailureReasonMetadata(%s) returns table entry",
    (r) => {
      expect(getText2CypherValidationFailureReasonMetadata(r)).toBe(
        TEXT2CYPHER_VALIDATION_FAILURE_REASON_METADATA[r],
      );
    },
  );

  it("empty_query is the only structural failure", () => {
    const structural = TEXT2CYPHER_VALIDATION_FAILURE_REASONS.filter(
      (r) =>
        TEXT2CYPHER_VALIDATION_FAILURE_REASON_METADATA[r].category ===
        "structural",
    );
    expect(structural).toEqual(["empty_query"]);
  });

  it("forbidden_token + forbidden_procedure are the only security failures", () => {
    const security = new Set(
      TEXT2CYPHER_VALIDATION_FAILURE_REASONS.filter(
        (r) =>
          TEXT2CYPHER_VALIDATION_FAILURE_REASON_METADATA[r].category ===
          "security",
      ),
    );
    expect(security).toEqual(new Set(["forbidden_token", "forbidden_procedure"]));
  });

  it("disallowed_procedure is the only policy failure", () => {
    const policy = TEXT2CYPHER_VALIDATION_FAILURE_REASONS.filter(
      (r) =>
        TEXT2CYPHER_VALIDATION_FAILURE_REASON_METADATA[r].category === "policy",
    );
    expect(policy).toEqual(["disallowed_procedure"]);
  });

  it("isHardSecurityViolation is true iff category === security", () => {
    for (const r of TEXT2CYPHER_VALIDATION_FAILURE_REASONS) {
      const md = TEXT2CYPHER_VALIDATION_FAILURE_REASON_METADATA[r];
      expect(md.isHardSecurityViolation).toBe(md.category === "security");
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const r of TEXT2CYPHER_VALIDATION_FAILURE_REASONS) {
      labels.add(TEXT2CYPHER_VALIDATION_FAILURE_REASON_METADATA[r].label);
    }
    expect(labels.size).toBe(TEXT2CYPHER_VALIDATION_FAILURE_REASONS.length);
  });
});
