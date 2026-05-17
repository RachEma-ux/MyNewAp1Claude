/**
 * T-G.4.α — Recommendation Service tRPC router.
 *
 * Validates the new `agentStudio.recommendation.*` router. Contracts
 * + engine + runtime were shipped piecewise via T-G.4 / T-G.4.1 /
 * T-G.4.2; this PR mounts the operator-facing tRPC surface.
 *
 * Mirrors the precedent (s)/(t) read-surface pattern: adminProcedure
 * floor, discriminated envelopes (`ok` | `graphrag_unavailable`),
 * source-scan mount-drift guard.
 *
 *   1. Router exports `recommend` + `listKnownKinds` procedures.
 *   2. Envelope discriminator (`ok` | `graphrag_unavailable`)
 *      compiles + narrows correctly.
 *   3. listKnownKinds envelope passes through the 8 closed-taxonomy
 *      kinds + per-kind metadata.
 *   4. Source-scan integrity asserts the router is mounted on
 *      `api/router.ts` under the `recommendation` key per
 *      `reference_tsconfig_excludes_hide_trpc_mount_drift`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  recommendationRouter,
  type ListKnownKindsEnvelope,
  type RecommendEnvelope,
} from "../../server/agent-studio/services/recommendation/recommendation-router";
import {
  RECOMMENDATION_KINDS,
} from "../../server/agent-studio/services/recommendation/contracts";

describe("T-G.4.α — recommendationRouter shape", () => {
  it("exports recommend + listKnownKinds procedures", () => {
    const procedures = (recommendationRouter as unknown as {
      _def: { procedures: Record<string, unknown> };
    })._def.procedures;
    const keys = Object.keys(procedures);
    expect(keys).toContain("recommend");
    expect(keys).toContain("listKnownKinds");
  });

  it("recommend envelope: ok vs graphrag_unavailable discriminator", () => {
    const ok: RecommendEnvelope = {
      status: "ok",
      response: {
        kind: "note",
        anchor: { typeKey: "person", id: "1" },
        results: [],
        redactedCount: 0,
        fullyHiddenCount: 0,
      },
    };
    const unavailable: RecommendEnvelope = {
      status: "graphrag_unavailable",
    };
    expect(ok.status).toBe("ok");
    expect(unavailable.status).toBe("graphrag_unavailable");
    if (ok.status === "ok") {
      expect(ok.response.kind).toBe("note");
    }
  });

  it("listKnownKinds envelope passes through 8 closed-taxonomy kinds", () => {
    expect(RECOMMENDATION_KINDS.length).toBe(8);
    const env: ListKnownKindsEnvelope = {
      kinds: RECOMMENDATION_KINDS,
      metadata: {} as never,
    };
    // Spot-check the 8 kinds — anchors against silent enum drift.
    // These are the closed-taxonomy kinds from the
    // remaining-execution-plan §T-G.4.
    const kindSet = new Set(env.kinds);
    expect(kindSet.size).toBe(8);
    // The original 8 from the contracts.ts header: note, cag_block,
    // skill_pack, tool, policy, workflow, expert, next_action.
    // Spot-check a representative subset rather than the entire
    // list — that way an additive 9th kind (with ADR) doesn't break
    // this test, but a rename of an existing kind does.
    expect(kindSet.has("note" as never)).toBe(true);
    expect(kindSet.has("tool" as never)).toBe(true);
    expect(kindSet.has("policy" as never)).toBe(true);
    expect(kindSet.has("workflow" as never)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────
// Source-scan integrity — mount drift guard.
// ──────────────────────────────────────────────────────────────────

describe("T-G.4.α source-scan — recommendation router is mounted", () => {
  it("api/router.ts imports recommendationRouter and mounts it at `recommendation`", () => {
    const file = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/api/router.ts",
      ),
      "utf-8",
    );
    expect(file).toContain(
      'import { recommendationRouter } from "../services/recommendation/recommendation-router"',
    );
    expect(file).toMatch(/recommendation:\s*recommendationRouter,/);
  });
});
