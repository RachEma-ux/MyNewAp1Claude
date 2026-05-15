/**
 * Phase 12 §T-A.8 — RAC source-type metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  RAC_SOURCE_TYPES,
  RAC_SOURCE_RETRIEVAL_MECHANISMS,
  RAC_SOURCE_TYPE_METADATA,
  getRacSourceTypeMetadata,
} from "../../server/agent-studio/services/rac/sources/types.js";

describe("RAC_SOURCE_TYPE_METADATA (T-A.8)", () => {
  it("has metadata for every closed-taxonomy source type", () => {
    for (const s of RAC_SOURCE_TYPES) {
      expect(RAC_SOURCE_TYPE_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(RAC_SOURCE_TYPE_METADATA).length).toBe(
      RAC_SOURCE_TYPES.length,
    );
  });

  it.each(RAC_SOURCE_TYPES)(
    "%s has non-empty label + description + valid mechanism + boolean requiresEmbeddings",
    (s) => {
      const md = RAC_SOURCE_TYPE_METADATA[s];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(RAC_SOURCE_RETRIEVAL_MECHANISMS).toContain(md.retrievalMechanism);
      expect(typeof md.requiresEmbeddings).toBe("boolean");
    },
  );

  it.each(RAC_SOURCE_TYPES)(
    "getRacSourceTypeMetadata(%s) returns table entry",
    (s) => {
      expect(getRacSourceTypeMetadata(s)).toBe(RAC_SOURCE_TYPE_METADATA[s]);
    },
  );

  it("vector and knowledge_unit require embeddings; others do not", () => {
    expect(RAC_SOURCE_TYPE_METADATA.vector_index.requiresEmbeddings).toBe(
      true,
    );
    expect(RAC_SOURCE_TYPE_METADATA.knowledge_unit.requiresEmbeddings).toBe(
      true,
    );
    expect(RAC_SOURCE_TYPE_METADATA.cag_pack.requiresEmbeddings).toBe(false);
    expect(RAC_SOURCE_TYPE_METADATA.document_collection.requiresEmbeddings).toBe(
      false,
    );
    expect(RAC_SOURCE_TYPE_METADATA.graph_index.requiresEmbeddings).toBe(
      false,
    );
    expect(RAC_SOURCE_TYPE_METADATA.external_connector.requiresEmbeddings).toBe(
      false,
    );
    expect(RAC_SOURCE_TYPE_METADATA.tool_knowledge.requiresEmbeddings).toBe(
      false,
    );
  });

  it("graph_index has retrievalMechanism=graph", () => {
    expect(RAC_SOURCE_TYPE_METADATA.graph_index.retrievalMechanism).toBe(
      "graph",
    );
  });

  it("cag_pack has retrievalMechanism=precompiled", () => {
    expect(RAC_SOURCE_TYPE_METADATA.cag_pack.retrievalMechanism).toBe(
      "precompiled",
    );
  });

  it("every requiresEmbeddings=true source uses the vector mechanism", () => {
    for (const s of RAC_SOURCE_TYPES) {
      const md = RAC_SOURCE_TYPE_METADATA[s];
      if (md.requiresEmbeddings) {
        expect(md.retrievalMechanism).toBe("vector");
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const s of RAC_SOURCE_TYPES) {
      labels.add(RAC_SOURCE_TYPE_METADATA[s].label);
    }
    expect(labels.size).toBe(RAC_SOURCE_TYPES.length);
  });
});
