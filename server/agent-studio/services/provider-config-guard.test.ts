/**
 * Phase 27.2A — providerConfig guard tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sanitizeProviderConfigForStorage,
  sanitizeProviderConfig,
  __forTests,
} from "./provider-config-guard";

describe("sanitizeProviderConfigForStorage — Phase 27.2A", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("returns empty object for null / undefined / non-object", () => {
    expect(sanitizeProviderConfigForStorage(null).sanitized).toEqual({});
    expect(sanitizeProviderConfigForStorage(undefined).sanitized).toEqual({});
    expect(
      sanitizeProviderConfigForStorage(42 as unknown as Record<string, unknown>)
        .sanitized,
    ).toEqual({});
  });

  it("preserves non-secret keys unchanged", () => {
    const input = {
      provider: "openai",
      model: "gpt-4o",
      temperature: 0.2,
      maxTokens: 1024,
      baseUrl: "https://api.openai.com/v1",
    };
    const r = sanitizeProviderConfigForStorage(input);
    expect(r.sanitized).toEqual(input);
    expect(r.removedKeys).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("strips apiKey and apiKeyEnvVar and warns", () => {
    const input = {
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-LIVE-DEADBEEF",
      apiKeyEnvVar: "OPENAI_API_KEY",
    };
    const r = sanitizeProviderConfigForStorage(input, { agentId: 7 });
    expect(r.sanitized).toEqual({ provider: "openai", model: "gpt-4o" });
    expect(r.removedKeys.sort()).toEqual(["apiKey", "apiKeyEnvVar"]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const msg = warnSpy.mock.calls[0][0] as string;
    expect(msg).toContain("[ProviderConfigGuard]");
    expect(msg).toContain("apiKey");
    expect(msg).toContain("apiKeyEnvVar");
    expect(msg).toContain("agentId=7");
    expect(msg).toContain("LK-01");
  });

  it("strips snake_case variants too", () => {
    const input = {
      provider: "openai",
      api_key: "sk-LIVE",
      api_key_env_var: "OPENAI_API_KEY",
    };
    const r = sanitizeProviderConfigForStorage(input);
    expect(r.sanitized).toEqual({ provider: "openai" });
    expect(r.removedKeys.sort()).toEqual(["api_key", "api_key_env_var"]);
  });

  it("does not leak the apiKey value into the log", () => {
    sanitizeProviderConfigForStorage({ apiKey: "sk-LIVE-SECRET-VALUE" });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const msg = warnSpy.mock.calls[0][0] as string;
    expect(msg).not.toContain("sk-LIVE-SECRET-VALUE");
  });

  it("convenience sanitizeProviderConfig returns just the sanitized object", () => {
    const r = sanitizeProviderConfig({ apiKey: "x", model: "y" });
    expect(r).toEqual({ model: "y" });
  });

  it("FORBIDDEN_PROVIDER_CONFIG_KEYS list contains the four canonical names", () => {
    expect(__forTests.FORBIDDEN_PROVIDER_CONFIG_KEYS).toContain("apiKey");
    expect(__forTests.FORBIDDEN_PROVIDER_CONFIG_KEYS).toContain("apiKeyEnvVar");
    expect(__forTests.FORBIDDEN_PROVIDER_CONFIG_KEYS).toContain("api_key");
    expect(__forTests.FORBIDDEN_PROVIDER_CONFIG_KEYS).toContain(
      "api_key_env_var",
    );
  });
});
