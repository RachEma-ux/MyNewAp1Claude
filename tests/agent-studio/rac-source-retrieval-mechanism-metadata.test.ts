/**
 * Phase A §T-A.12 — RAC source retrieval-mechanism metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  RAC_SOURCE_RETRIEVAL_MECHANISMS,
  RAC_SOURCE_RETRIEVAL_MECHANISM_METADATA,
  getRacSourceRetrievalMechanismMetadata,
} from "../../server/agent-studio/services/rac/sources/types.js";

describe("RAC_SOURCE_RETRIEVAL_MECHANISM_METADATA (T-A.12)", () => {
  it("has metadata for every closed-taxonomy mechanism", () => {
    for (const m of RAC_SOURCE_RETRIEVAL_MECHANISMS) {
      expect(RAC_SOURCE_RETRIEVAL_MECHANISM_METADATA[m]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(
      Object.keys(RAC_SOURCE_RETRIEVAL_MECHANISM_METADATA).length,
    ).toBe(RAC_SOURCE_RETRIEVAL_MECHANISMS.length);
  });

  it.each(RAC_SOURCE_RETRIEVAL_MECHANISMS)(
    "%s has non-empty label + description + boolean requiresEmbeddings + boolean callsExternal",
    (m) => {
      const md = RAC_SOURCE_RETRIEVAL_MECHANISM_METADATA[m];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.requiresEmbeddings).toBe("boolean");
      expect(typeof md.callsExternal).toBe("boolean");
    },
  );

  it.each(RAC_SOURCE_RETRIEVAL_MECHANISMS)(
    "getRacSourceRetrievalMechanismMetadata(%s) returns table entry",
    (m) => {
      expect(getRacSourceRetrievalMechanismMetadata(m)).toBe(
        RAC_SOURCE_RETRIEVAL_MECHANISM_METADATA[m],
      );
    },
  );

  it("vector is the only mechanism requiring embeddings", () => {
    const reqEmb = RAC_SOURCE_RETRIEVAL_MECHANISMS.filter(
      (m) => RAC_SOURCE_RETRIEVAL_MECHANISM_METADATA[m].requiresEmbeddings,
    );
    expect(reqEmb).toEqual(["vector"]);
  });

  it("external_api is the only mechanism that calls outside the platform", () => {
    const external = RAC_SOURCE_RETRIEVAL_MECHANISMS.filter(
      (m) => RAC_SOURCE_RETRIEVAL_MECHANISM_METADATA[m].callsExternal,
    );
    expect(external).toEqual(["external_api"]);
  });

  it("no mechanism is simultaneously embeddings-required AND external", () => {
    for (const m of RAC_SOURCE_RETRIEVAL_MECHANISMS) {
      const md = RAC_SOURCE_RETRIEVAL_MECHANISM_METADATA[m];
      expect(md.requiresEmbeddings && md.callsExternal).toBe(false);
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const m of RAC_SOURCE_RETRIEVAL_MECHANISMS) {
      labels.add(RAC_SOURCE_RETRIEVAL_MECHANISM_METADATA[m].label);
    }
    expect(labels.size).toBe(RAC_SOURCE_RETRIEVAL_MECHANISMS.length);
  });
});
