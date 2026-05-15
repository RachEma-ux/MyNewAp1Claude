/**
 * Phase E §T-E.1 — publish-target-type metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  PUBLISH_TARGET_TYPES,
  PUBLISH_TARGET_TYPE_METADATA,
  getPublishTargetTypeMetadata,
} from "../../server/agent-studio/services/publish-targets/index.js";

describe("PUBLISH_TARGET_TYPE_METADATA (T-E.1)", () => {
  it("has metadata for every closed-taxonomy target type", () => {
    for (const t of PUBLISH_TARGET_TYPES) {
      expect(PUBLISH_TARGET_TYPE_METADATA[t]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(PUBLISH_TARGET_TYPE_METADATA).length).toBe(
      PUBLISH_TARGET_TYPES.length,
    );
  });

  it.each(PUBLISH_TARGET_TYPES)(
    "%s has non-empty label + description + booleans",
    (t) => {
      const md = PUBLISH_TARGET_TYPE_METADATA[t];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.internalDestination).toBe("boolean");
      expect(typeof md.requiresProviderConnection).toBe("boolean");
    },
  );

  it.each(PUBLISH_TARGET_TYPES)(
    "getPublishTargetTypeMetadata(%s) returns table entry",
    (t) => {
      expect(getPublishTargetTypeMetadata(t)).toBe(
        PUBLISH_TARGET_TYPE_METADATA[t],
      );
    },
  );

  it("external_kb is the only non-internal destination", () => {
    expect(PUBLISH_TARGET_TYPE_METADATA.external_kb.internalDestination).toBe(
      false,
    );
    expect(PUBLISH_TARGET_TYPE_METADATA.staging_env.internalDestination).toBe(
      true,
    );
    expect(PUBLISH_TARGET_TYPE_METADATA.remote_vault.internalDestination).toBe(
      true,
    );
  });

  it("staging_env does not require a provider connection; remote_vault and external_kb do", () => {
    expect(
      PUBLISH_TARGET_TYPE_METADATA.staging_env.requiresProviderConnection,
    ).toBe(false);
    expect(
      PUBLISH_TARGET_TYPE_METADATA.remote_vault.requiresProviderConnection,
    ).toBe(true);
    expect(
      PUBLISH_TARGET_TYPE_METADATA.external_kb.requiresProviderConnection,
    ).toBe(true);
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const t of PUBLISH_TARGET_TYPES) {
      labels.add(PUBLISH_TARGET_TYPE_METADATA[t].label);
    }
    expect(labels.size).toBe(PUBLISH_TARGET_TYPES.length);
  });
});
