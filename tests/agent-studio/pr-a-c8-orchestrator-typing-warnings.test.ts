/**
 * PR-A — cycle-8 (`/sdcard/Download/RAC_ORCHESTRATOR_AUDIT_2026-05-09.md`)
 * sub-arc PR-A: M1+M2+M3+M9+H4-c8.
 *
 * Bundles five orchestrator-core findings:
 *   - M1-c8: typed `FallbackReason` discriminated union
 *   - M2-c8: silent `no_query` / `no_profile` paths now emit warnings
 *   - M3-c8: `??=` first-only → `fallbackReasons` cascade array +
 *            renamed primary field
 *   - M9-c8: `primaryFallbackDetail` carries underlying error text
 *   - H4-c8: `dedupeWarnings` collapses repeated reasons before
 *            chat flows console.info them
 *
 * All five touch the same file (`rac-orchestrator.ts`) — bundled by
 * file boundary per cycle-7 lesson #1.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Stub the heavy dependencies so the orchestrator runs as pure
// orchestration. Mirrors the existing rac-orchestrator.test.ts setup.
vi.mock("../../server/agent-studio/services/cag", async () => {
  const actual = await vi.importActual<any>("../../server/agent-studio/services/cag");
  return {
    ...actual,
    resolveCagPack: vi.fn(),
  };
});
vi.mock("../../server/agent-studio/services/rac/sources", () => ({
  listProfilesForDraft: vi.fn(),
  getPolicyForProfile: vi.fn(),
}));
vi.mock("../../server/agent-studio/services/rac/retrieval", () => ({
  planRetrieval: vi.fn(),
  executeRetrieval: vi.fn(),
  filterRetrieval: vi.fn(),
}));

import { resolveCagPack } from "../../server/agent-studio/services/cag";
import { listProfilesForDraft } from "../../server/agent-studio/services/rac/sources";
import {
  resolveAndAssembleContext,
  dedupeWarnings,
  type FallbackReason,
} from "../../server/agent-studio/services/runtime/rac-orchestrator";

const RAC_ORCH_PATH = join(
  process.cwd(),
  "server/agent-studio/services/runtime/rac-orchestrator.ts",
);

const baseInput = {
  workspaceId: 1,
  agentId: 1,
  agentDraftId: 1,
  actorId: 1,
};

beforeEach(() => {
  vi.mocked(resolveCagPack).mockResolvedValue({
    section: { kind: "capability_pack", text: "cap" },
    pack: { id: 1, packVersion: 1 } as any,
    warnings: [],
  });
  vi.mocked(listProfilesForDraft).mockResolvedValue([]);
});

// ─────────────────────────────────────────────────────────────────────
// M1-c8 — typed FallbackReason union
// ─────────────────────────────────────────────────────────────────────

describe("M1-c8 — FallbackReason is a typed discriminated union", () => {
  const src = readFileSync(RAC_ORCH_PATH, "utf8");

  it("source exports `FallbackReason` as a typed union", () => {
    expect(
      src,
      "M1-c8 violated: rac-orchestrator.ts must export `FallbackReason` " +
        "as a typed discriminated union so a typo in a fallback literal " +
        "fails at compile time. Mirrors cycle-7 M8-c7 TransportErrorCode.",
    ).toMatch(/export\s+type\s+FallbackReason\s*=/);
  });

  it("union enumerates exactly the four current reasons", () => {
    expect(src).toMatch(/"no_query"/);
    expect(src).toMatch(/"no_profile"/);
    expect(src).toMatch(/"cag_resolver_error"/);
    expect(src).toMatch(/"retrieval_error"/);
  });

  it("RuntimeTraceMetrics declares primaryFallbackReason: FallbackReason | null", () => {
    expect(
      src,
      "M1-c8 violated: trace must use the typed `FallbackReason` for " +
        "primaryFallbackReason, not free-form string. The closed type " +
        "is what catches drift.",
    ).toMatch(/primaryFallbackReason:\s*FallbackReason\s*\|\s*null/);
  });

  it("source carries the M1-c8 closure marker", () => {
    expect(src).toMatch(/M1-c8\b/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// M2-c8 — silent fallbacks now emit warnings
// ─────────────────────────────────────────────────────────────────────

describe("M2-c8 — every fallback path emits a warning", () => {
  it("no_query path emits a warning entry (was silent pre-cycle-8)", async () => {
    const out = await resolveAndAssembleContext({
      mode: "safe_degraded",
      ...baseInput,
      query: "",
    });
    expect(out.trace.primaryFallbackReason).toBe("no_query");
    expect(
      out.warnings.some((w) => /fallback: no_query/.test(w)),
      "M2-c8 violated: no_query path must emit a warning so callers " +
        "checking warnings.length see the silent retrieval-skip.",
    ).toBe(true);
  });

  it("no_profile path emits a warning entry (was silent pre-cycle-8)", async () => {
    vi.mocked(listProfilesForDraft).mockResolvedValue([]);
    const out = await resolveAndAssembleContext({
      mode: "safe_degraded",
      ...baseInput,
      query: "find docs",
    });
    expect(out.trace.primaryFallbackReason).toBe("no_profile");
    expect(
      out.warnings.some((w) => /fallback: no_profile/.test(w)),
      "M2-c8 violated: no_profile path must emit a warning so the " +
        "absent-profile fallback is operator-visible.",
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// M3-c8 — fallbackReasons cascade array preserves multi-fallback causality
// ─────────────────────────────────────────────────────────────────────

describe("M3-c8 — fallbackReasons array preserves cascade", () => {
  it("primaryFallbackReason holds the FIRST reason when multiple fire", async () => {
    // CAG resolver throws non-CagRequired error → cag_resolver_error
    // (first), then no profile → no_profile (second). Both should
    // appear in fallbackReasons; primary is the first.
    vi.mocked(resolveCagPack).mockRejectedValue(new Error("CAG DB hiccup"));
    vi.mocked(listProfilesForDraft).mockResolvedValue([]);
    const out = await resolveAndAssembleContext({
      mode: "safe_degraded",
      ...baseInput,
      query: "anything",
    });
    expect(out.trace.primaryFallbackReason).toBe("cag_resolver_error");
    expect(out.trace.fallbackReasons).toEqual([
      "cag_resolver_error",
      "no_profile",
    ]);
  });

  it("single fallback path: fallbackReasons has one entry matching primary", async () => {
    const out = await resolveAndAssembleContext({
      mode: "safe_degraded",
      ...baseInput,
      query: "",
    });
    expect(out.trace.fallbackReasons).toEqual(["no_query"]);
    expect(out.trace.primaryFallbackReason).toBe("no_query");
  });

  it("no fallback: fallbackReasons is empty + primary is null", async () => {
    // Happy path proxy — return CAG, mock retrieval to succeed
    vi.mocked(listProfilesForDraft).mockResolvedValue([
      {
        id: 1,
        agentDraftId: 1,
        profileKey: "default",
        enabled: true,
      } as any,
    ]);
    const { planRetrieval, executeRetrieval, filterRetrieval } = await import(
      "../../server/agent-studio/services/rac/retrieval"
    );
    vi.mocked(planRetrieval).mockResolvedValue({ items: [], warnings: [] } as any);
    vi.mocked(executeRetrieval).mockResolvedValue({
      chunks: [],
      perSource: [],
      totalLatencyMs: 5,
      warnings: [],
    } as any);
    vi.mocked(filterRetrieval).mockReturnValue({
      chunks: [],
      rejectionCounts: {
        citationRequired: 0,
        belowMinScore: 0,
        freshness: 0,
        duplicate: 0,
        capacity: 0,
        piiBlocked: 0,
        licenseBlocked: 0,
      },
      warnings: [],
    } as any);
    const { getPolicyForProfile } = await import(
      "../../server/agent-studio/services/rac/sources"
    );
    vi.mocked(getPolicyForProfile).mockResolvedValue({} as any);

    const out = await resolveAndAssembleContext({
      mode: "safe_degraded",
      ...baseInput,
      query: "x",
    });
    expect(out.trace.primaryFallbackReason).toBeNull();
    expect(out.trace.fallbackReasons).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// M9-c8 — primaryFallbackDetail carries underlying error text
// ─────────────────────────────────────────────────────────────────────

describe("M9-c8 — primaryFallbackDetail captures underlying error text", () => {
  it("retrieval_error captures the original error message in detail", async () => {
    vi.mocked(listProfilesForDraft).mockResolvedValue([
      { id: 1, agentDraftId: 1, profileKey: "default", enabled: true } as any,
    ]);
    const { planRetrieval } = await import(
      "../../server/agent-studio/services/rac/retrieval"
    );
    vi.mocked(planRetrieval).mockRejectedValue(
      new Error("vector db connection refused"),
    );
    const out = await resolveAndAssembleContext({
      mode: "safe_degraded",
      ...baseInput,
      query: "x",
    });
    expect(out.trace.primaryFallbackReason).toBe("retrieval_error");
    expect(out.trace.primaryFallbackDetail).toContain(
      "vector db connection refused",
    );
  });

  it("no_query records a structural detail (not an external error)", async () => {
    const out = await resolveAndAssembleContext({
      mode: "safe_degraded",
      ...baseInput,
      query: "  ",
    });
    expect(out.trace.primaryFallbackDetail).toMatch(/empty|whitespace/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// H4-c8 — dedupeWarnings collapses repeats
// ─────────────────────────────────────────────────────────────────────

describe("H4-c8 — dedupeWarnings collapses repeats intra-turn", () => {
  it("collapses identical warnings into a single (xN) line", () => {
    const out = dedupeWarnings([
      "plan: source disabled",
      "plan: source disabled",
      "plan: source disabled",
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/plan: source disabled.*x3/);
  });

  it("preserves order: first occurrence drives the position", () => {
    const out = dedupeWarnings([
      "plan: a",
      "exec: b",
      "plan: a",
      "exec: b",
      "filter: c",
    ]);
    expect(out).toEqual([
      "plan: a (x2)",
      "exec: b (x2)",
      "filter: c",
    ]);
  });

  it("distinct details within the same prefix stay distinct (sub-80-char key)", () => {
    const out = dedupeWarnings([
      "plan: no embedding for source 1",
      "plan: no embedding for source 2",
      "plan: no embedding for source 3",
    ]);
    // Three distinct lines (each within 80-char head differs at the trailing digit)
    expect(out).toHaveLength(3);
  });

  it("empty input → empty output", () => {
    expect(dedupeWarnings([])).toEqual([]);
  });

  it("single warning → unchanged (no count suffix)", () => {
    expect(dedupeWarnings(["plan: only one"])).toEqual(["plan: only one"]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Source-scan lockstep: closure markers + helper exports
// ─────────────────────────────────────────────────────────────────────

describe("PR-A — source-scan lockstep", () => {
  const src = readFileSync(RAC_ORCH_PATH, "utf8");

  for (const marker of ["M1-c8", "M2-c8", "M3-c8", "M9-c8", "H4-c8"]) {
    it(`source carries the ${marker} closure marker`, () => {
      expect(src).toMatch(new RegExp(`${marker}\\b`));
    });
  }

  it("exports the recordFallback helper signal (named recordFallback)", () => {
    // Internal helper — not exported, but a future PR that drops or
    // renames it MUST update the call sites + this test.
    expect(src).toMatch(/function recordFallback\(/);
  });

  it("exports dedupeWarnings (called by chat flows)", () => {
    expect(src).toMatch(/export function dedupeWarnings\(/);
  });

  it("removed the `??=` first-only pattern from primary record path (code, not comments)", () => {
    // The pre-cycle-8 `trace.fallbackReason ??= "..."` shape is
    // replaced by the recordFallback helper. A future PR that
    // re-introduces `??=` on the primary field would silently
    // restore the lost-causality bug. We allow the doc-block to
    // QUOTE the old pattern (in backticks) for documentation; we
    // forbid actual code lines starting without `*` or `//` prefixes
    // from carrying it.
    const codeLines = src
      .split("\n")
      .filter((line) => !/^\s*(\*|\/\/)/.test(line))
      .join("\n");
    expect(
      codeLines,
      "M3-c8 violated: the `trace.fallbackReason ??= ...` pattern " +
        "must NOT reappear in code — use recordFallback() so the " +
        "cascade is preserved. (Doc-block mentions of the old pattern " +
        "are exempt; this check filters out comment lines.)",
    ).not.toMatch(/trace\.(primary)?[Ff]allbackReason\s*\?\?=/);
  });
});
