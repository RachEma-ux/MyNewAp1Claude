/**
 * Preflight reporter — pure function tests.
 *
 * The preflight reads ONLY process.env, so we exercise it with
 * synthetic env objects rather than mutating process.env in-place.
 * That keeps the tests deterministic and free of cross-test leakage.
 */

import { describe, it, expect } from "vitest";
import { runPreflight, formatHuman } from "../../scripts/staging-foundation/preflight";

const FULL_ENV: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgres://staging/mynewap1claude",
  OPA_URL: "http://staging-opa.internal:8181",
  ENCRYPTION_KEY: "x".repeat(64),
  SECRETS_ENCRYPTION_KEY: "y".repeat(64),
  COOKIE_SECRET: "z".repeat(43),
  JWT_SECRET: "w".repeat(43),
};

describe("preflight — required infra detection", () => {
  it("flags every required key as missing on an empty env", () => {
    const r = runPreflight({} as NodeJS.ProcessEnv);
    expect(r.allRequiredOk).toBe(false);
    expect(r.missingRequired.sort()).toEqual([
      "COOKIE_SECRET",
      "DATABASE_URL",
      "ENCRYPTION_KEY",
      "JWT_SECRET",
      "OPA_URL",
      "SECRETS_ENCRYPTION_KEY",
    ]);
  });

  it("passes when all required infra is present", () => {
    const r = runPreflight(FULL_ENV);
    expect(r.allRequiredOk).toBe(true);
    expect(r.missingRequired).toEqual([]);
  });

  it("rejects opa.example.com placeholder as not real OPA", () => {
    const r = runPreflight({ ...FULL_ENV, OPA_URL: "http://opa.example.com:8181" });
    expect(r.allRequiredOk).toBe(false);
    expect(r.missingRequired).toContain("OPA_URL");
  });

  it("treats empty-string env values as missing", () => {
    const r = runPreflight({ ...FULL_ENV, COOKIE_SECRET: "" });
    expect(r.missingRequired).toContain("COOKIE_SECRET");
  });
});

describe("preflight — optional / component-scoped infra", () => {
  it("never blocks on missing optional infra", () => {
    const r = runPreflight(FULL_ENV);
    expect(r.allRequiredOk).toBe(true);
    expect(r.deferredComponents.length).toBeGreaterThan(0);
  });

  it("clears the deferred list when worker + connector envs are present", () => {
    const r = runPreflight({
      ...FULL_ENV,
      GRAPHRAG_WORKER_URL: "http://worker:9000",
      DATA_ACQUISITION_WORKER_URL: "http://worker:9001",
      EXTERNAL_ORCHESTRATOR_URL: "http://orch:9002",
      REDIS_URL: "redis://staging:6379",
      WORKER_QUEUE_URL: "redis://staging:6379",
      S3_BUCKET: "staging-bucket",
      GDRIVE_CLIENT_ID: "gdrive-id",
      GITHUB_APP_ID: "12345",
    });
    expect(r.deferredComponents).toEqual([]);
  });

  it("groups missing optional envs by component, not by key", () => {
    const r = runPreflight(FULL_ENV);
    expect(r.deferredComponents).toContain("graphrag-worker");
    expect(r.deferredComponents).toContain("s3-connector");
    expect(r.deferredComponents).toContain("worker-queue");
    const dups = r.deferredComponents.filter(
      (c, i, arr) => arr.indexOf(c) !== i,
    );
    expect(dups).toEqual([]);
  });
});

describe("preflight — mode detection", () => {
  it("returns staging-integration when TEST_MODE is set", () => {
    const r = runPreflight({ ...FULL_ENV, TEST_MODE: "staging-integration" });
    expect(r.mode).toBe("staging-integration");
  });

  it("returns default when TEST_MODE is unset or different", () => {
    expect(runPreflight(FULL_ENV).mode).toBe("default");
    expect(runPreflight({ ...FULL_ENV, TEST_MODE: "unit" }).mode).toBe("default");
  });
});

describe("preflight — formatter", () => {
  it("renders BLOCKED with hint lines on missing infra", () => {
    const r = runPreflight({} as NodeJS.ProcessEnv);
    const out = formatHuman(r);
    expect(out).toContain("Result: BLOCKED");
    expect(out).toContain("DATABASE_URL");
    expect(out).toContain("staging-runtime-foundation.md");
  });

  it("renders PASS when required infra is complete", () => {
    const out = formatHuman(runPreflight(FULL_ENV));
    expect(out).toContain("Result: PASS");
  });

  it("lists deferred components in PASS output when optional infra is partial", () => {
    const out = formatHuman(runPreflight(FULL_ENV));
    expect(out).toMatch(/Deferred components:/);
  });
});
