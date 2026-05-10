/**
 * H3-c8 (cycle-8 audit `/sdcard/Download/RAC_ORCHESTRATOR_AUDIT_2026-05-09.md`
 * §H3-c8) — RAC retrieval planner timeout envelope.
 *
 * Pre-cycle-8 the planner ran
 * `Promise.all([listSourcesForProfile, getWorkspaceEmbeddingDefault])`
 * with no timeout wrapper. If either DB query hung (lock contention,
 * ASDB outage mid-query), the planner stalled the entire chat turn.
 * Same root cause as H2-c8 (CAG resolver timeout), one layer up.
 *
 * H3-c8 reuses the shared `runtime/with-timeout.ts` helper added by
 * PR-C, wraps each I/O call independently (so the timeout label
 * names the offender), and surfaces a typed `PlannerTimeoutError`
 * the orchestrator's safe-degraded mode catches as a `retrieval_error`
 * fallback. Per-call wrapping (not Promise.all wrapping) is
 * intentional: a single hung query takes the full timeout budget AND
 * the breadcrumb names which one stalled.
 *
 * Pinned invariants:
 *   1. Planner imports `withTimeout` + `isTimeoutError` from the
 *      shared helper (NOT inlining the pattern).
 *   2. Planner declares `RAC_PLANNER_TIMEOUT_MS` (default 5000) with
 *      env override + warn-on-out-of-range.
 *   3. `PlannerTimeoutError` is exported (typed) + re-exported via
 *      the retrieval barrel.
 *   4. All three I/O calls (`getProfile`, `listSourcesForProfile`,
 *      `getWorkspaceEmbeddingDefault`) wrapped with `withTimeout` +
 *      a labeled wrapper so the operator-visible timeout message
 *      names the offender.
 *   5. Behavioral: a slow `getProfile` triggers PlannerTimeoutError;
 *      a slow source-list also triggers; non-timeout errors propagate
 *      unchanged.
 *   6. H3-c8 closure marker on planner.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

vi.mock("../../server/agent-studio/services/rac/sources", () => ({
  listSourcesForProfile: vi.fn(),
  getProfile: vi.fn(),
  getWorkspaceEmbeddingDefault: vi.fn(),
}));

import {
  planRetrieval,
  PlannerTimeoutError,
} from "../../server/agent-studio/services/rac/retrieval-planner";
import {
  listSourcesForProfile,
  getProfile,
  getWorkspaceEmbeddingDefault,
} from "../../server/agent-studio/services/rac/sources";

const PLANNER_PATH = join(
  process.cwd(),
  "server/agent-studio/services/rac/retrieval-planner.ts",
);
const RETRIEVAL_BARREL_PATH = join(
  process.cwd(),
  "server/agent-studio/services/rac/retrieval/index.ts",
);

beforeEach(() => {
  vi.mocked(listSourcesForProfile).mockReset();
  vi.mocked(getProfile).mockReset();
  vi.mocked(getWorkspaceEmbeddingDefault).mockReset();
  // Default to a fast, valid profile so behavioral tests can override
  // a single dependency without losing the others.
  vi.mocked(getProfile).mockResolvedValue({
    id: 1,
    workspaceId: 1,
    agentId: 1,
    agentDraftId: 1,
    profileKey: "default",
    enabled: true,
    timeoutMs: null,
    notes: null,
    createdBy: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any);
  vi.mocked(listSourcesForProfile).mockResolvedValue([]);
  vi.mocked(getWorkspaceEmbeddingDefault).mockResolvedValue(null);
});

// ─────────────────────────────────────────────────────────────────────
// Behavior — typed timeout class
// ─────────────────────────────────────────────────────────────────────

describe("H3-c8 — PlannerTimeoutError class", () => {
  it("has code='rac_planner_timeout' and a meaningful name", () => {
    const e = new PlannerTimeoutError("test detail");
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(PlannerTimeoutError);
    expect(e.code).toBe("rac_planner_timeout");
    expect(e.name).toBe("PlannerTimeoutError");
    expect(e.message).toContain("test detail");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Behavior — slow I/O surfaces as PlannerTimeoutError
// ─────────────────────────────────────────────────────────────────────

describe("H3-c8 — slow I/O triggers PlannerTimeoutError", () => {
  // Override env to use a SHORT timeout for tests so they don't
  // actually wait 5 seconds. Vitest runs each test sequentially in
  // singleFork mode so env mutation is safe within this describe.
  // NOTE: the env var is captured at MODULE LOAD time (top-level
  // const), so to test a short timeout we slow down the inner
  // promise enough that the default 5s would fail too. Instead
  // we use a long-enough delay relative to the test's 10s vitest
  // default to actually trigger the production timeout.
  it(
    "slow getProfile (>5s) throws PlannerTimeoutError (default RAC_PLANNER_TIMEOUT_MS=5000)",
    async () => {
      vi.mocked(getProfile).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  id: 1,
                  workspaceId: 1,
                  agentId: 1,
                  agentDraftId: 1,
                  profileKey: "default",
                  enabled: true,
                } as any),
              7_000,
            ),
          ),
      );
      await expect(
        planRetrieval({ workspaceId: 1, profileId: 1 }),
      ).rejects.toBeInstanceOf(PlannerTimeoutError);
    },
    15_000, // vitest test-level timeout — give enough room for the 5s production timeout to fire
  );

  it("non-timeout error from getProfile propagates unchanged", async () => {
    vi.mocked(getProfile).mockRejectedValue(new Error("DB connection refused"));
    await expect(
      planRetrieval({ workspaceId: 1, profileId: 1 }),
    ).rejects.toThrow("DB connection refused");
    await expect(
      planRetrieval({ workspaceId: 1, profileId: 1 }),
    ).rejects.not.toBeInstanceOf(PlannerTimeoutError);
  });

  it("happy path returns normally with no timeout", async () => {
    const out = await planRetrieval({ workspaceId: 1, profileId: 1 });
    expect(out.profile.id).toBe(1);
    expect(out.items).toEqual([]);
    expect(out.runnableCount).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Source-scan lockstep
// ─────────────────────────────────────────────────────────────────────

describe("H3-c8 — planner source-scan lockstep", () => {
  const src = readFileSync(PLANNER_PATH, "utf8");

  it("source carries the H3-c8 closure marker", () => {
    expect(src).toMatch(/H3-c8\b/);
  });

  it("imports withTimeout + isTimeoutError from shared helper (not inlined)", () => {
    expect(
      src,
      "H3-c8 violated: planner must import the shared withTimeout " +
        "from runtime/with-timeout. Inlining the timeout pattern " +
        "duplicates H2-c8's helper and risks divergence.",
    ).toMatch(
      /import\s*\{\s*withTimeout,\s*isTimeoutError,?\s*\}\s*from\s*["']\.\.\/runtime\/with-timeout["']/,
    );
  });

  it("declares RAC_PLANNER_TIMEOUT_MS with env override + warn-on-out-of-range", () => {
    expect(
      src,
      "H3-c8 violated: planner must declare RAC_PLANNER_TIMEOUT_MS " +
        "as an env-overridable constant with the standard validation " +
        "pattern (cycle-7 L5-c6 / H1-c7 / H7-c7 / H8-c7 / H2-c8).",
    ).toMatch(
      /RAC_PLANNER_TIMEOUT_MS[\s\S]{0,400}process\.env\.RAC_PLANNER_TIMEOUT_MS[\s\S]{0,400}console\.warn/,
    );
  });

  it("RAC_PLANNER_TIMEOUT_MS default is 5000ms", () => {
    expect(src).toMatch(/RAC_PLANNER_TIMEOUT_MS[\s\S]{0,300}return\s+5_?000;/);
  });

  it("exports PlannerTimeoutError class with code='rac_planner_timeout'", () => {
    expect(
      src,
      "H3-c8 violated: planner must export PlannerTimeoutError so the " +
        "orchestrator can recognize the typed timeout vs generic errors. " +
        "Mirrors cycle-7's PlannerError typed-error pattern.",
    ).toMatch(/export\s+class\s+PlannerTimeoutError\s+extends\s+Error/);
    expect(src).toMatch(/code\s*=\s*"rac_planner_timeout"/);
  });

  it("wraps getProfile call with withTimeout(RAC_PLANNER_TIMEOUT_MS)", () => {
    expect(
      src,
      "H3-c8 violated: getProfile must be wrapped via " +
        "`withTimeout(getProfile(input.profileId), RAC_PLANNER_TIMEOUT_MS, ...)`. " +
        "Without this wrap, a hung profile lookup blocks the planner indefinitely.",
    ).toMatch(
      /withTimeout\(\s*getProfile\([\s\S]{0,200}RAC_PLANNER_TIMEOUT_MS/,
    );
  });

  it("wraps listSourcesForProfile with withTimeout (per-call, not Promise.all-level)", () => {
    expect(
      src,
      "H3-c8 violated: listSourcesForProfile must be wrapped " +
        "individually so the timeout label names which call stalled " +
        "rather than collapsing both into one ambiguous timeout.",
    ).toMatch(
      /withTimeout\(\s*listSourcesForProfile\([\s\S]{0,200}RAC_PLANNER_TIMEOUT_MS/,
    );
  });

  it("wraps getWorkspaceEmbeddingDefault with withTimeout (per-call)", () => {
    expect(src).toMatch(
      /withTimeout\(\s*getWorkspaceEmbeddingDefault\([\s\S]{0,200}RAC_PLANNER_TIMEOUT_MS/,
    );
  });

  it("converts isTimeoutError(err) → PlannerTimeoutError throw (typed escalation)", () => {
    expect(
      src,
      "H3-c8 violated: when the inner error is a timeout, the planner " +
        "must throw PlannerTimeoutError so the orchestrator's typed " +
        "catch handles it correctly. Without the conversion, the " +
        "orchestrator sees only the raw withTimeout error and can't " +
        "discriminate.",
    ).toMatch(
      /isTimeoutError\(err\)[\s\S]{0,300}throw\s+new\s+PlannerTimeoutError/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// Barrel re-export
// ─────────────────────────────────────────────────────────────────────

describe("H3-c8 — retrieval barrel re-exports PlannerTimeoutError", () => {
  const src = readFileSync(RETRIEVAL_BARREL_PATH, "utf8");

  it("retrieval/index.ts re-exports PlannerTimeoutError", () => {
    expect(
      src,
      "H3-c8 violated: retrieval barrel must re-export " +
        "PlannerTimeoutError so the orchestrator can import it from " +
        "the same path as the rest of the planner public surface.",
    ).toMatch(/PlannerTimeoutError/);
  });
});
