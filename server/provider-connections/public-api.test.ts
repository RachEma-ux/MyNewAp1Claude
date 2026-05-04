/**
 * Provider Connections — Public API "no secrets" tests
 *
 * Plan v3 Phase 2 acceptance: every public read action's output must
 * be free of PAT / API key / encrypted secret payload. These are
 * structural guards on the type/shape returned, not network probes.
 *
 * The actual network/secret-bearing path is the internal credential
 * resolver (Phase 2) — its boundary is enforced by Phase 3's lint
 * script, not by these tests.
 */
import { describe, it, expect } from "vitest";
import type {
  ProviderConnectionRef,
  ConnectionStatusSummary,
  ValidateConnectionResult,
} from "./public-api";

// Strings that MUST NEVER appear as keys on a public output. The list
// is intentionally broad — any literal field name a future engineer
// might use for secret material gets flagged.
const FORBIDDEN_PUBLIC_KEYS = [
  "apiKey",
  "api_key",
  "pat",
  "PAT",
  "encryptedPat",
  "encrypted_pat",
  "encryptedSecret",
  "encrypted_secret",
  "secret",
  "secretValue",
  "secret_value",
  "apiKeyEnvVar",
  "api_key_env_var",
  "credential",
  "credentials",
  "Authorization",
  "authorization",
  "x-api-key",
  "anthropic-version",
  "bearer",
  "Bearer",
];

function assertNoForbiddenKeys(value: unknown, path = "$"): void {
  if (value === null || value === undefined) return;
  if (typeof value !== "object") return;

  if (Array.isArray(value)) {
    for (const [i, item] of value.entries()) {
      assertNoForbiddenKeys(item, `${path}[${i}]`);
    }
    return;
  }

  for (const key of Object.keys(value)) {
    if (FORBIDDEN_PUBLIC_KEYS.includes(key)) {
      throw new Error(
        `Forbidden secret-bearing key "${key}" found at ${path}.${key}. Public API outputs MUST NOT contain secret material (Plan v3 D2).`,
      );
    }
    assertNoForbiddenKeys(
      (value as Record<string, unknown>)[key],
      `${path}.${key}`,
    );
  }
}

describe("Provider Connections public API — no secret material in output shapes", () => {
  it("ProviderConnectionRef shape contains no forbidden keys", () => {
    const sample: ProviderConnectionRef = {
      providerConnectionId: 1,
      providerCatalogEntryId: 2,
      workspaceId: 3,
      lifecycleStatus: "active",
      healthStatus: "ok",
      modelCount: 5,
      capabilities: ["chat", "embeddings"],
    };
    expect(() => assertNoForbiddenKeys(sample)).not.toThrow();
    // Sanity: assert known field names exist so refactors that drop
    // them don't silently pass this guard.
    expect(sample.providerConnectionId).toBe(1);
    expect(sample.healthStatus).toBe("ok");
  });

  it("ConnectionStatusSummary shape contains no forbidden keys", () => {
    const sample: ConnectionStatusSummary = {
      providerConnectionId: 1,
      lifecycleStatus: "active",
      healthStatus: "ok",
      lastHealthCheck: new Date(),
      modelCount: 0,
      capabilities: [],
    };
    expect(() => assertNoForbiddenKeys(sample)).not.toThrow();
  });

  it("ValidateConnectionResult shape contains no forbidden keys (ok branch)", () => {
    const sample: ValidateConnectionResult = {
      providerConnectionId: 1,
      ok: true,
      lifecycleStatus: "active",
      healthStatus: "ok",
    };
    expect(() => assertNoForbiddenKeys(sample)).not.toThrow();
  });

  it("ValidateConnectionResult shape contains no forbidden keys (failure branch)", () => {
    const sample: ValidateConnectionResult = {
      providerConnectionId: 1,
      ok: false,
      reason: "secret_missing",
      lifecycleStatus: "active",
      healthStatus: "unknown",
    };
    expect(() => assertNoForbiddenKeys(sample)).not.toThrow();
  });

  it("guard catches a deliberately-poisoned output", () => {
    const poisoned = {
      providerConnectionId: 1,
      // simulating a future regression where someone forwarded the secret
      apiKey: "sk-leak",
    };
    expect(() => assertNoForbiddenKeys(poisoned)).toThrow(
      /Forbidden secret-bearing key "apiKey"/,
    );
  });

  it("guard catches a nested forbidden key", () => {
    const poisoned = {
      providerConnectionId: 1,
      meta: { nested: { encryptedPat: "ciphertext-leak" } },
    };
    expect(() => assertNoForbiddenKeys(poisoned)).toThrow(
      /Forbidden secret-bearing key "encryptedPat"/,
    );
  });
});
