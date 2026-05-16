/**
 * Phase S §T-S.22 — AGS required-publish-field metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  AGS_REQUIRED_PUBLISH_FIELDS,
  AGS_REQUIRED_PUBLISH_FIELD_METADATA,
  getAgsRequiredPublishFieldMetadata,
} from "../../server/agent-studio/shared/constants.js";

const VALID_CATEGORIES = [
  "identifier",
  "ownership",
  "behavior",
  "contract",
] as const;

describe("AGS_REQUIRED_PUBLISH_FIELD_METADATA (T-S.22)", () => {
  it("has metadata for every closed-taxonomy required field", () => {
    for (const f of AGS_REQUIRED_PUBLISH_FIELDS) {
      expect(AGS_REQUIRED_PUBLISH_FIELD_METADATA[f]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(AGS_REQUIRED_PUBLISH_FIELD_METADATA).length).toBe(
      AGS_REQUIRED_PUBLISH_FIELDS.length,
    );
  });

  it.each(AGS_REQUIRED_PUBLISH_FIELDS)(
    "%s has non-empty label + description + valid category + boolean requiresFreeFormProse",
    (f) => {
      const md = AGS_REQUIRED_PUBLISH_FIELD_METADATA[f];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(VALID_CATEGORIES).toContain(md.category);
      expect(typeof md.requiresFreeFormProse).toBe("boolean");
    },
  );

  it.each(AGS_REQUIRED_PUBLISH_FIELDS)(
    "getAgsRequiredPublishFieldMetadata(%s) returns table entry",
    (f) => {
      expect(getAgsRequiredPublishFieldMetadata(f)).toBe(
        AGS_REQUIRED_PUBLISH_FIELD_METADATA[f],
      );
    },
  );

  it("identifier-category fields are exactly name + internalKey", () => {
    const identifiers = new Set(
      AGS_REQUIRED_PUBLISH_FIELDS.filter(
        (f) =>
          AGS_REQUIRED_PUBLISH_FIELD_METADATA[f].category === "identifier",
      ),
    );
    expect(identifiers).toEqual(new Set(["name", "internalKey"]));
  });

  it("ownership-category fields are exactly ownerId + agentClass", () => {
    const ownership = new Set(
      AGS_REQUIRED_PUBLISH_FIELDS.filter(
        (f) =>
          AGS_REQUIRED_PUBLISH_FIELD_METADATA[f].category === "ownership",
      ),
    );
    expect(ownership).toEqual(new Set(["ownerId", "agentClass"]));
  });

  it("behavior-category fields are exactly mission + scope + systemInstructions", () => {
    const behavior = new Set(
      AGS_REQUIRED_PUBLISH_FIELDS.filter(
        (f) => AGS_REQUIRED_PUBLISH_FIELD_METADATA[f].category === "behavior",
      ),
    );
    expect(behavior).toEqual(
      new Set(["mission", "scope", "systemInstructions"]),
    );
  });

  it("contract-category fields are exactly outputContract", () => {
    const contract = new Set(
      AGS_REQUIRED_PUBLISH_FIELDS.filter(
        (f) => AGS_REQUIRED_PUBLISH_FIELD_METADATA[f].category === "contract",
      ),
    );
    expect(contract).toEqual(new Set(["outputContract"]));
  });

  it("requiresFreeFormProse is true iff category === behavior", () => {
    for (const f of AGS_REQUIRED_PUBLISH_FIELDS) {
      const md = AGS_REQUIRED_PUBLISH_FIELD_METADATA[f];
      expect(md.requiresFreeFormProse).toBe(md.category === "behavior");
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const f of AGS_REQUIRED_PUBLISH_FIELDS) {
      labels.add(AGS_REQUIRED_PUBLISH_FIELD_METADATA[f].label);
    }
    expect(labels.size).toBe(AGS_REQUIRED_PUBLISH_FIELDS.length);
  });
});
