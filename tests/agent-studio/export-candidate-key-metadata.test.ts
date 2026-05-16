/**
 * Phase E §T-E.5 — Export candidate-key metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  AGENT_STUDIO_EXPORT_CANDIDATE_KEYS,
  AGENT_STUDIO_EXPORT_CANDIDATE_KEY_METADATA,
  getAgentStudioExportCandidateKeyMetadata,
} from "../../server/agent-studio/shared/export-candidate.js";

const VALID_CATEGORIES = [
  "identity",
  "lifecycle",
  "binding",
  "provenance",
] as const;

const EXPECTED_CLOSED_TAXONOMY_VALUE_KEYS = new Set([
  "lifecycleState",
  "readiness",
  "governance",
  "racReadiness",
  "exportStatus",
  "sourceModule",
]);

describe("AGENT_STUDIO_EXPORT_CANDIDATE_KEY_METADATA (T-E.5)", () => {
  it("has metadata for every closed-taxonomy key", () => {
    for (const k of AGENT_STUDIO_EXPORT_CANDIDATE_KEYS) {
      expect(AGENT_STUDIO_EXPORT_CANDIDATE_KEY_METADATA[k]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(
      Object.keys(AGENT_STUDIO_EXPORT_CANDIDATE_KEY_METADATA).length,
    ).toBe(AGENT_STUDIO_EXPORT_CANDIDATE_KEYS.length);
  });

  it.each(AGENT_STUDIO_EXPORT_CANDIDATE_KEYS)(
    "%s has non-empty label + description + valid category + boolean isClosedTaxonomyValue",
    (k) => {
      const md = AGENT_STUDIO_EXPORT_CANDIDATE_KEY_METADATA[k];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(VALID_CATEGORIES).toContain(md.category);
      expect(typeof md.isClosedTaxonomyValue).toBe("boolean");
    },
  );

  it.each(AGENT_STUDIO_EXPORT_CANDIDATE_KEYS)(
    "getAgentStudioExportCandidateKeyMetadata(%s) returns table entry",
    (k) => {
      expect(getAgentStudioExportCandidateKeyMetadata(k)).toBe(
        AGENT_STUDIO_EXPORT_CANDIDATE_KEY_METADATA[k],
      );
    },
  );

  it("identity-category keys are exactly workspaceId/agentId/versionId/name", () => {
    const identity = new Set(
      AGENT_STUDIO_EXPORT_CANDIDATE_KEYS.filter(
        (k) =>
          AGENT_STUDIO_EXPORT_CANDIDATE_KEY_METADATA[k].category === "identity",
      ),
    );
    expect(identity).toEqual(
      new Set(["workspaceId", "agentId", "versionId", "name"]),
    );
  });

  it("lifecycle-category keys are exactly lifecycleState/readiness/governance/racReadiness/exportStatus", () => {
    const lifecycle = new Set(
      AGENT_STUDIO_EXPORT_CANDIDATE_KEYS.filter(
        (k) =>
          AGENT_STUDIO_EXPORT_CANDIDATE_KEY_METADATA[k].category === "lifecycle",
      ),
    );
    expect(lifecycle).toEqual(
      new Set([
        "lifecycleState",
        "readiness",
        "governance",
        "racReadiness",
        "exportStatus",
      ]),
    );
  });

  it("binding-category keys are exactly binding/capabilities", () => {
    const binding = new Set(
      AGENT_STUDIO_EXPORT_CANDIDATE_KEYS.filter(
        (k) =>
          AGENT_STUDIO_EXPORT_CANDIDATE_KEY_METADATA[k].category === "binding",
      ),
    );
    expect(binding).toEqual(new Set(["binding", "capabilities"]));
  });

  it("provenance-category keys are exactly sourceModule/sourceRefId/activeSourceVersionId", () => {
    const provenance = new Set(
      AGENT_STUDIO_EXPORT_CANDIDATE_KEYS.filter(
        (k) =>
          AGENT_STUDIO_EXPORT_CANDIDATE_KEY_METADATA[k].category ===
          "provenance",
      ),
    );
    expect(provenance).toEqual(
      new Set(["sourceModule", "sourceRefId", "activeSourceVersionId"]),
    );
  });

  it("isClosedTaxonomyValue is true exactly for the documented closed-enum-valued keys", () => {
    const actual = new Set(
      AGENT_STUDIO_EXPORT_CANDIDATE_KEYS.filter(
        (k) =>
          AGENT_STUDIO_EXPORT_CANDIDATE_KEY_METADATA[k].isClosedTaxonomyValue,
      ),
    );
    expect(actual).toEqual(EXPECTED_CLOSED_TAXONOMY_VALUE_KEYS);
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const k of AGENT_STUDIO_EXPORT_CANDIDATE_KEYS) {
      labels.add(AGENT_STUDIO_EXPORT_CANDIDATE_KEY_METADATA[k].label);
    }
    expect(labels.size).toBe(AGENT_STUDIO_EXPORT_CANDIDATE_KEYS.length);
  });
});
