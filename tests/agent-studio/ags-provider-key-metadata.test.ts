/**
 * Phase S §T-S.20 — AGS provider-key metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  AGS_PROVIDER_KEYS,
  AGS_PROVIDER_KEY_METADATA,
  getAgsProviderKeyMetadata,
} from "../../server/agent-studio/shared/constants.js";

describe("AGS_PROVIDER_KEY_METADATA (T-S.20)", () => {
  it("has metadata for every closed-taxonomy provider key", () => {
    for (const k of AGS_PROVIDER_KEYS) {
      expect(AGS_PROVIDER_KEY_METADATA[k]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(AGS_PROVIDER_KEY_METADATA).length).toBe(
      AGS_PROVIDER_KEYS.length,
    );
  });

  it.each(AGS_PROVIDER_KEYS)(
    "%s has non-empty label + description + valid hostingMode + boolean requiresApiKey",
    (k) => {
      const md = AGS_PROVIDER_KEY_METADATA[k];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(["local", "cloud", "aggregator"]).toContain(md.hostingMode);
      expect(typeof md.requiresApiKey).toBe("boolean");
    },
  );

  it.each(AGS_PROVIDER_KEYS)(
    "getAgsProviderKeyMetadata(%s) returns table entry",
    (k) => {
      expect(getAgsProviderKeyMetadata(k)).toBe(AGS_PROVIDER_KEY_METADATA[k]);
    },
  );

  it("ollama + lmstudio are the only `local` providers; they do not require an API key", () => {
    const localKeys = AGS_PROVIDER_KEYS.filter(
      (k) => AGS_PROVIDER_KEY_METADATA[k].hostingMode === "local",
    );
    expect(new Set(localKeys)).toEqual(new Set(["ollama", "lmstudio"]));
    for (const k of localKeys) {
      expect(AGS_PROVIDER_KEY_METADATA[k].requiresApiKey).toBe(false);
    }
  });

  it("openrouter + github_models + atomic_chat are the only `aggregator` providers", () => {
    const aggregators = AGS_PROVIDER_KEYS.filter(
      (k) => AGS_PROVIDER_KEY_METADATA[k].hostingMode === "aggregator",
    );
    expect(new Set(aggregators)).toEqual(
      new Set(["openrouter", "github_models", "atomic_chat"]),
    );
  });

  it("every non-local provider requires an API key", () => {
    for (const k of AGS_PROVIDER_KEYS) {
      const md = AGS_PROVIDER_KEY_METADATA[k];
      if (md.hostingMode !== "local") {
        expect(md.requiresApiKey).toBe(true);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const k of AGS_PROVIDER_KEYS) {
      labels.add(AGS_PROVIDER_KEY_METADATA[k].label);
    }
    expect(labels.size).toBe(AGS_PROVIDER_KEYS.length);
  });
});
