/**
 * generate-dev-secrets — pure-render tests.
 *
 * The script's I/O (writeFile, exit codes, --print, --force) is exercised
 * by docs and manual ops. The purely-functional render is what we lock
 * in here so the env body shape can't drift away from the preflight
 * contract.
 */

import { describe, it, expect } from "vitest";
import { renderDevEnv } from "../../scripts/staging-foundation/generate-dev-secrets";
import { runPreflight } from "../../scripts/staging-foundation/preflight";

function parseEnv(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

describe("renderDevEnv", () => {
  it("emits all four secret keys with non-empty values", () => {
    const { body, generatedKeys } = renderDevEnv();
    expect(generatedKeys.sort()).toEqual([
      "COOKIE_SECRET",
      "ENCRYPTION_KEY",
      "JWT_SECRET",
      "SECRETS_ENCRYPTION_KEY",
    ]);
    const parsed = parseEnv(body);
    for (const k of generatedKeys) {
      expect(parsed[k]).toBeTruthy();
      expect(parsed[k].length).toBeGreaterThanOrEqual(32);
    }
  });

  it("encryption keys are 64 hex chars (32 bytes AES-256)", () => {
    const { body } = renderDevEnv();
    const parsed = parseEnv(body);
    expect(parsed.ENCRYPTION_KEY).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.SECRETS_ENCRYPTION_KEY).toMatch(/^[0-9a-f]{64}$/);
  });

  it("emits randomness — back-to-back calls produce different values", () => {
    const a = renderDevEnv().body;
    const b = renderDevEnv().body;
    expect(a).not.toBe(b);
  });

  it("includes a DATABASE_URL line and a TEST_MODE line", () => {
    const { body } = renderDevEnv();
    const parsed = parseEnv(body);
    expect(parsed.DATABASE_URL).toBeTruthy();
    expect(parsed.TEST_MODE).toBe("staging-integration");
  });

  it("commented OPA_URL line stays opa.example.com-free (preflight rejects it)", () => {
    const { body } = renderDevEnv();
    const opaLines = body
      .split("\n")
      .filter((l) => l.toUpperCase().includes("OPA_URL"));
    for (const l of opaLines) {
      expect(l).not.toMatch(/=.*opa\.example\.com/);
    }
  });
});

describe("renderDevEnv ↔ preflight round trip", () => {
  it("a generated env, with DATABASE_URL and OPA_URL filled in, satisfies the preflight gate", () => {
    const { body } = renderDevEnv();
    const env = parseEnv(body);
    // The dev template purposely leaves OPA_URL commented; supply both.
    env.DATABASE_URL = "postgres://localhost:5432/mynewap1claude";
    env.OPA_URL = "http://localhost:8181";
    const report = runPreflight(env as NodeJS.ProcessEnv);
    expect(report.allRequiredOk).toBe(true);
    expect(report.missingRequired).toEqual([]);
  });
});
