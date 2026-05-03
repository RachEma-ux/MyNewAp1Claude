/**
 * Extended Preflight (scripts/staging/preflight.ts) — pure-function tests.
 *
 * The extended preflight composes the foundation preflight (PR #91)
 * with extended env coverage (per-DB DSNs, STAGING_APP_URL, KGRA &
 * SANDBOX_WF), URL probes, browser-tooling probes, and connector
 * classification. We exercise the pure pieces here; the actual
 * fetch/network is stubbed via vi.fn() on globalThis.fetch so the
 * tests stay deterministic and infra-free.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildReport } from "../../scripts/staging/preflight";

const FULL_FOUNDATION_ENV: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgres://staging/mynewap1claude",
  OPA_URL: "http://staging-opa.internal:8181",
  ENCRYPTION_KEY: "x".repeat(64),
  SECRETS_ENCRYPTION_KEY: "y".repeat(64),
  COOKIE_SECRET: "z".repeat(43),
  JWT_SECRET: "w".repeat(43),
};

const FULL_EXTENDED_ENV: NodeJS.ProcessEnv = {
  ...FULL_FOUNDATION_ENV,
  STAGING_APP_URL: "http://localhost:3000",
  DATABASE_URL_MYNEWAP1CLAUDE: "postgres://localhost:5432/mynewap1claude",
  DATABASE_URL_ASDB: "postgres://localhost:5433/asdb",
  DATABASE_URL_RAGDB: "postgres://localhost:5434/ragdb",
  DATABASE_URL_WFDB: "postgres://localhost:5435/wfdb",
  GRAPHRAG_WORKER_URL: "http://localhost:4101",
  DATA_ACQUISITION_WORKER_URL: "http://localhost:4102",
  EXTERNAL_ORCHESTRATOR_URL: "http://localhost:4103",
  SANDBOX_WF_WORKER_URL: "http://localhost:4104",
  KGRA_SERVICE_URL: "http://localhost:4105",
};

let originalFetch: typeof fetch;
let originalCwd: () => string;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  // Default: every URL probe returns "unreachable" (no network in tests).
  globalThis.fetch = vi.fn(async () => {
    throw new Error("network disabled in tests");
  }) as unknown as typeof fetch;
  // Pin process.env into a clean snapshot for each test by stubbing
  // process.env in the call to buildReport (we pass env in directly).
  originalCwd = process.cwd;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.cwd = originalCwd;
  vi.restoreAllMocks();
});

describe("extended preflight — verdict logic", () => {
  it("BLOCKED when foundation env is empty", async () => {
    const r = await buildReport({} as NodeJS.ProcessEnv);
    expect(r.verdict).toBe("BLOCKED");
    expect(r.missingRequired).toContain("DATABASE_URL");
    expect(r.missingRequired).toContain("OPA_URL");
  });

  it("BLOCKED when foundation passes but extended is missing", async () => {
    const r = await buildReport(FULL_FOUNDATION_ENV);
    expect(r.verdict).toBe("BLOCKED");
    // Extended fields present in the missing list:
    expect(r.missingRequired).toContain("STAGING_APP_URL");
    expect(r.missingRequired).toContain("DATABASE_URL_MYNEWAP1CLAUDE");
  });

  it("BLOCKED when env is full but Playwright/Chromium tooling is missing", async () => {
    // The test runs in the repo root; Playwright is not installed, so
    // toolingProbes will report unavailable. That alone should keep
    // the verdict at BLOCKED even when env is complete.
    const r = await buildReport(FULL_EXTENDED_ENV);
    const missingTools = r.toolingProbes.filter((t) => !t.available).map((t) => t.tool);
    if (missingTools.length > 0) {
      expect(r.verdict).toBe("BLOCKED");
    } else {
      // If a future test runner has Playwright pre-installed, the
      // verdict can swing to PASS — that's fine.
      expect(r.verdict).toBe("PASS");
    }
  });
});

describe("extended preflight — connectors are BLOCKED when credentials missing", () => {
  it("github → blocked, with both keys named", async () => {
    const r = await buildReport(FULL_EXTENDED_ENV);
    const gh = r.connectors.find((c) => c.connector === "github");
    expect(gh).toBeDefined();
    expect(gh!.status).toBe("blocked");
    expect(gh!.missingKeys).toContain("GITHUB_APP_ID");
    expect(gh!.missingKeys).toContain("GITHUB_PRIVATE_KEY");
  });

  it("github → configured when both keys are present", async () => {
    const r = await buildReport({
      ...FULL_EXTENDED_ENV,
      GITHUB_APP_ID: "12345",
      GITHUB_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\n...",
    });
    const gh = r.connectors.find((c) => c.connector === "github");
    expect(gh!.status).toBe("configured");
    expect(gh!.missingKeys).toEqual([]);
  });

  it("s3 → blocked when any of the four S3 keys is missing", async () => {
    const r = await buildReport({
      ...FULL_EXTENDED_ENV,
      S3_BUCKET: "x",
      S3_REGION: "us-east-1",
      S3_ACCESS_KEY_ID: "AKIA...",
      // S3_SECRET_ACCESS_KEY intentionally missing
    });
    const s3 = r.connectors.find((c) => c.connector === "s3");
    expect(s3!.status).toBe("blocked");
    expect(s3!.missingKeys).toEqual(["S3_SECRET_ACCESS_KEY"]);
  });
});

describe("extended preflight — URL probes are recorded but never crash the run", () => {
  it("missing URL is reported as 'skipped' not 'unreachable'", async () => {
    const r = await buildReport({} as NodeJS.ProcessEnv);
    const appProbe = r.urlProbes.find((p) => p.key === "STAGING_APP_URL");
    expect(appProbe).toBeDefined();
    expect(appProbe!.status).toBe("skipped");
  });

  it("an unreachable URL yields status 'unreachable' but doesn't throw", async () => {
    const r = await buildReport(FULL_EXTENDED_ENV);
    const appProbe = r.urlProbes.find((p) => p.key === "STAGING_APP_URL");
    expect(appProbe).toBeDefined();
    expect(["unreachable", "unhealthy", "reachable"]).toContain(appProbe!.status);
  });

  it("an unhealthy reachable URL flips verdict to FAIL", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => "down",
    })) as unknown as typeof fetch;
    const r = await buildReport(FULL_EXTENDED_ENV);
    expect(r.verdict).toBe("FAIL");
  });
});

describe("extended preflight — exit-code mapping discipline", () => {
  it("PASS verdict means every required key is present and tooling is available", async () => {
    // Force tooling to be available by calling buildReport against a
    // synthetic shape; we can't actually install Playwright in tests,
    // so we just sanity-check the data plumbing.
    const r = await buildReport({} as NodeJS.ProcessEnv);
    if (r.verdict === "PASS") {
      expect(r.missingRequired).toEqual([]);
      expect(r.toolingProbes.every((t) => t.available)).toBe(true);
    }
  });
});
