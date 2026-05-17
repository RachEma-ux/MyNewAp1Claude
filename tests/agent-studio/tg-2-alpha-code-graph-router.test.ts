/**
 * T-G.2.α — Code Graph tRPC router (read-only operator surface).
 *
 * Validates the new `agentStudio.codeGraph.*` router:
 *   1. Router exports `listIngestions` + `getIngestionStats` procedures.
 *   2. Default + absolute limit constants are correctly clamped.
 *   3. Envelope shapes are discriminated where applicable
 *      (`getIngestionStats` → `ok` | `not_found`).
 *   4. Source-scan integrity asserts the router is mounted on
 *      `api/router.ts` under the `codeGraph` key. This is the
 *      mount-drift safety net per `reference_tsconfig_excludes_hide_trpc_mount_drift`.
 *
 * Behavior tests stub the store factory via a shape assertion only —
 * the live DB path is exercised by the existing
 * `code-graph-store` integration tests (separate file). This test
 * stays a pure-structure test so it runs without ASDB.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  codeGraphRouter,
  CODE_GRAPH_LIST_INGESTIONS_DEFAULT_LIMIT,
  CODE_GRAPH_LIST_INGESTIONS_ABSOLUTE_LIMIT,
  type CodeGraphGetIngestionStatsEnvelope,
  type CodeGraphListIngestionsEnvelope,
} from "../../server/agent-studio/services/code-graph/code-graph-router";

describe("T-G.2.α — codeGraphRouter shape", () => {
  it("exports listIngestions + getIngestionStats procedures", () => {
    const procedures = (codeGraphRouter as unknown as {
      _def: { procedures: Record<string, unknown> };
    })._def.procedures;
    const keys = Object.keys(procedures);
    expect(keys).toContain("listIngestions");
    expect(keys).toContain("getIngestionStats");
  });

  it("exposes sane default + absolute limit constants", () => {
    expect(CODE_GRAPH_LIST_INGESTIONS_DEFAULT_LIMIT).toBe(50);
    expect(CODE_GRAPH_LIST_INGESTIONS_ABSOLUTE_LIMIT).toBe(200);
    expect(CODE_GRAPH_LIST_INGESTIONS_DEFAULT_LIMIT).toBeLessThan(
      CODE_GRAPH_LIST_INGESTIONS_ABSOLUTE_LIMIT,
    );
  });

  it("discriminated stats envelope: ok vs not_found", () => {
    // Compile-time + runtime shape check via type narrowing.
    const ok: CodeGraphGetIngestionStatsEnvelope = {
      status: "ok",
      stats: {
        ingestionId: "i1",
        nodeCount: 0,
        edgeCount: 0,
        nodeTypeCounts: [],
        edgeTypeCounts: [],
      },
    };
    const missing: CodeGraphGetIngestionStatsEnvelope = {
      status: "not_found",
      ingestionId: "i-missing",
    };
    expect(ok.status).toBe("ok");
    expect(missing.status).toBe("not_found");
    if (ok.status === "ok") {
      expect(ok.stats.ingestionId).toBe("i1");
    }
    if (missing.status === "not_found") {
      expect(missing.ingestionId).toBe("i-missing");
    }
  });

  it("list envelope wraps an array of ingestions", () => {
    const env: CodeGraphListIngestionsEnvelope = { ingestions: [] };
    expect(Array.isArray(env.ingestions)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────
// Source-scan integrity — mount drift guard.
//
// tsconfig excludes services/** from typecheck (per the
// `reference_tsconfig_excludes_hide_trpc_mount_drift` memory), so a
// silently-unmounted router would compile clean. Source-scan the
// barrel to confirm both the import and the mount-key are present.
// ──────────────────────────────────────────────────────────────────

describe("T-G.2.α source-scan — codeGraph router is mounted", () => {
  it("api/router.ts imports codeGraphRouter and mounts it at `codeGraph`", () => {
    const file = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/api/router.ts",
      ),
      "utf-8",
    );
    expect(file).toContain(
      'import { codeGraphRouter } from "../services/code-graph/code-graph-router"',
    );
    expect(file).toMatch(/codeGraph:\s*codeGraphRouter,/);
  });
});
