/**
 * Phase G §T-G.38 — Allowed-procedure-namespace metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  ALLOWED_PROCEDURE_NAMESPACES,
  ALLOWED_PROCEDURE_NAMESPACE_METADATA,
  getAllowedProcedureNamespaceMetadata,
} from "../../server/agent-studio/services/graph/retrieval/text2cypher-validator.js";

const VALID_BUCKETS = ["neo4j", "apoc", "gds"] as const;

describe("ALLOWED_PROCEDURE_NAMESPACE_METADATA (T-G.38)", () => {
  it("has metadata for every closed-taxonomy namespace", () => {
    for (const ns of ALLOWED_PROCEDURE_NAMESPACES) {
      expect(ALLOWED_PROCEDURE_NAMESPACE_METADATA[ns]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(ALLOWED_PROCEDURE_NAMESPACE_METADATA).length).toBe(
      ALLOWED_PROCEDURE_NAMESPACES.length,
    );
  });

  it.each(ALLOWED_PROCEDURE_NAMESPACES)(
    "%s has non-empty label + description + valid providerBucket + boolean expectsGraphProjection",
    (ns) => {
      const md = ALLOWED_PROCEDURE_NAMESPACE_METADATA[ns];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(VALID_BUCKETS).toContain(md.providerBucket);
      expect(typeof md.expectsGraphProjection).toBe("boolean");
    },
  );

  it.each(ALLOWED_PROCEDURE_NAMESPACES)(
    "getAllowedProcedureNamespaceMetadata(%s) returns table entry",
    (ns) => {
      expect(getAllowedProcedureNamespaceMetadata(ns)).toBe(
        ALLOWED_PROCEDURE_NAMESPACE_METADATA[ns],
      );
    },
  );

  it("db.schema. is the only `neo4j` provider bucket", () => {
    const neo4j = ALLOWED_PROCEDURE_NAMESPACES.filter(
      (ns) =>
        ALLOWED_PROCEDURE_NAMESPACE_METADATA[ns].providerBucket === "neo4j",
    );
    expect(neo4j).toEqual(["db.schema."]);
  });

  it("apoc.path. + apoc.coll. are exactly the `apoc` provider bucket", () => {
    const apoc = new Set(
      ALLOWED_PROCEDURE_NAMESPACES.filter(
        (ns) =>
          ALLOWED_PROCEDURE_NAMESPACE_METADATA[ns].providerBucket === "apoc",
      ),
    );
    expect(apoc).toEqual(new Set(["apoc.path.", "apoc.coll."]));
  });

  it("the 4 gds.* namespaces are exactly the `gds` provider bucket", () => {
    const gds = new Set(
      ALLOWED_PROCEDURE_NAMESPACES.filter(
        (ns) =>
          ALLOWED_PROCEDURE_NAMESPACE_METADATA[ns].providerBucket === "gds",
      ),
    );
    expect(gds).toEqual(
      new Set([
        "gds.shortestPath",
        "gds.betweenness",
        "gds.degree",
        "gds.pageRank",
      ]),
    );
  });

  it("expectsGraphProjection is true iff providerBucket === gds", () => {
    for (const ns of ALLOWED_PROCEDURE_NAMESPACES) {
      const md = ALLOWED_PROCEDURE_NAMESPACE_METADATA[ns];
      expect(md.expectsGraphProjection).toBe(md.providerBucket === "gds");
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const ns of ALLOWED_PROCEDURE_NAMESPACES) {
      labels.add(ALLOWED_PROCEDURE_NAMESPACE_METADATA[ns].label);
    }
    expect(labels.size).toBe(ALLOWED_PROCEDURE_NAMESPACES.length);
  });
});
