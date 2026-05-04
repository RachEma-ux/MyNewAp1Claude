/**
 * Phase 10 — provider config classifier unit tests.
 *
 * Pure function; no DB. Covers all four legacy shapes (A/B/C/D) plus
 * edge cases:
 *
 *   - Empty / null jsonb
 *   - Shape A: raw apiKey (with empty-string treated as missing)
 *   - Shape B: apiKeyEnvVar (env var name preserved as hint, not the secret)
 *   - Shape C local provider: ollama / llama.cpp / local
 *   - Shape C cloud no credential: openai/anthropic without apiKey or env var
 *   - Mask: apiKey -> "<redacted>", non-secret keys preserved
 *   - Mask: legacy `apiKeyEnvVar` is NOT redacted (it's the env var NAME,
 *     not a secret value); the migration moves it to `legacyEnvVarHint`
 *     during the binding insert, separately from masking.
 */

import { describe, it, expect } from "vitest";
import {
  classifyProviderConfig,
  maskProviderConfig,
  SECRET_DENYLIST,
} from "../../scripts/agent-studio/classify-provider-config";

describe("classifyProviderConfig — shape detection", () => {
  it("returns kind=empty for null / undefined / {}", () => {
    expect(classifyProviderConfig(null).kind).toBe("empty");
    expect(classifyProviderConfig(undefined).kind).toBe("empty");
    expect(classifyProviderConfig({}).kind).toBe("empty");
    const r = classifyProviderConfig({});
    expect(r.produceBindingRow).toBe(false);
    expect(r.resultingStatus).toBeNull();
    expect(r.resultingStatusReason).toBeNull();
  });

  it("Shape A — raw apiKey -> legacy_unresolved + legacy_raw_api_key", () => {
    const r = classifyProviderConfig({
      providerSlug: "openai",
      providerType: "openai",
      apiKey: "sk-leak-bait",
      model: "gpt-4o-mini",
    });
    expect(r.kind).toBe("raw_api_key");
    expect(r.produceBindingRow).toBe(true);
    expect(r.resultingStatus).toBe("legacy_unresolved");
    expect(r.resultingStatusReason).toBe("legacy_raw_api_key");
    expect(r.envVarHint).toBeNull();
  });

  it("Shape A — empty-string apiKey is treated as missing", () => {
    const r = classifyProviderConfig({
      providerType: "ollama",
      apiKey: "",
      model: "llama3.1:8b",
    });
    // No apiKey, no env var, providerType=ollama -> local_provider
    expect(r.kind).toBe("local_provider");
  });

  it("Shape B — apiKeyEnvVar -> legacy_unresolved + legacy_env_var with hint preserved", () => {
    const r = classifyProviderConfig({
      providerSlug: "openai",
      providerType: "openai",
      apiKeyEnvVar: "OPENAI_API_KEY",
      model: "gpt-4o-mini",
    });
    expect(r.kind).toBe("env_var");
    expect(r.envVarHint).toBe("OPENAI_API_KEY");
    expect(r.resultingStatus).toBe("legacy_unresolved");
    expect(r.resultingStatusReason).toBe("legacy_env_var");
  });

  it("Shape C — local provider (ollama) -> binding_v1 with no statusReason", () => {
    const r = classifyProviderConfig({
      providerType: "ollama",
      model: "llama3.1:8b",
      baseUrl: "http://localhost:11434",
    });
    expect(r.kind).toBe("local_provider");
    expect(r.resultingStatus).toBe("binding_v1");
    expect(r.resultingStatusReason).toBeNull();
  });

  it("Shape C — local provider (llama.cpp variants) all classify as local_provider", () => {
    for (const t of ["llama.cpp", "llamacpp", "local", "Ollama", "OLLAMA"]) {
      const r = classifyProviderConfig({ providerType: t });
      expect(r.kind, `providerType=${t}`).toBe("local_provider");
    }
  });

  it("Shape C — cloud provider without credential -> legacy_no_credential", () => {
    const r = classifyProviderConfig({
      providerType: "openai",
      model: "gpt-4o-mini",
    });
    expect(r.kind).toBe("cloud_no_credential");
    expect(r.resultingStatus).toBe("legacy_unresolved");
    expect(r.resultingStatusReason).toBe("legacy_no_credential");
  });

  it("Precedence: apiKey wins over apiKeyEnvVar", () => {
    const r = classifyProviderConfig({
      apiKey: "sk-…",
      apiKeyEnvVar: "OPENAI_API_KEY",
    });
    expect(r.kind).toBe("raw_api_key");
  });

  it("Non-string apiKey is treated as missing (defensive against malformed jsonb)", () => {
    const r = classifyProviderConfig({
      providerType: "openai",
      // @ts-expect-error — intentional malformed payload
      apiKey: 12345,
    });
    expect(r.kind).toBe("cloud_no_credential");
  });
});

describe("maskProviderConfig — rollback artifact", () => {
  it("redacts every key in SECRET_DENYLIST", () => {
    const sample: Record<string, unknown> = {
      apiKey: "sk-leak",
      pat: "ghp_leak",
      Authorization: "Bearer leak",
      "x-api-key": "leak",
      providerType: "openai",
      model: "gpt-4o-mini",
    };
    const masked = maskProviderConfig(sample);
    for (const k of SECRET_DENYLIST) {
      if (k in sample) {
        expect(masked[k], `key=${k}`).toBe("<redacted>");
      }
    }
    expect(masked.providerType).toBe("openai");
    expect(masked.model).toBe("gpt-4o-mini");
  });

  it("preserves non-secret metadata verbatim", () => {
    const sample = {
      providerSlug: "openai",
      providerType: "openai",
      model: "gpt-4o-mini",
      baseUrl: "https://api.openai.com",
    };
    expect(maskProviderConfig(sample)).toEqual(sample);
  });

  it("does NOT redact apiKeyEnvVar (it is the env var NAME, not the secret)", () => {
    const sample = {
      providerType: "openai",
      apiKeyEnvVar: "OPENAI_API_KEY",
    };
    const masked = maskProviderConfig(sample);
    expect(masked.apiKeyEnvVar).toBe("OPENAI_API_KEY");
  });

  it("returns {} for null / undefined input", () => {
    expect(maskProviderConfig(null)).toEqual({});
    expect(maskProviderConfig(undefined)).toEqual({});
  });

  it("masked output never contains a leaked secret value (regression guard)", () => {
    const masked = maskProviderConfig({
      apiKey: "sk-secret-leak-bait",
      pat: "ghp_secret_leak",
      providerSlug: "openai",
    });
    const serialized = JSON.stringify(masked);
    expect(serialized).not.toContain("sk-secret-leak-bait");
    expect(serialized).not.toContain("ghp_secret_leak");
  });
});
