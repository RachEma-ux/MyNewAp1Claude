/**
 * T-G.3.α — Security Graph tRPC router (read-only operator surface).
 *
 * Validates the new `agentStudio.securityGraph.*` router. Mirrors
 * `tg-2-alpha-code-graph-router.test.ts` line-for-line — precedent
 * (s) carry-forward of the T-G.2.α read-surface ladder.
 *
 *   1. Router exports `listIngestions` + `getIngestionStats` procedures.
 *   2. Default + absolute limit constants are correctly clamped.
 *   3. Envelope shapes are discriminated where applicable
 *      (`getIngestionStats` → `ok` | `not_found`).
 *   4. Source-scan integrity asserts the router is mounted on
 *      `api/router.ts` under the `securityGraph` key — mount-drift
 *      safety net per `reference_tsconfig_excludes_hide_trpc_mount_drift`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  securityGraphRouter,
  SECURITY_GRAPH_LIST_INGESTIONS_DEFAULT_LIMIT,
  SECURITY_GRAPH_LIST_INGESTIONS_ABSOLUTE_LIMIT,
  type SecurityGraphGetIngestionStatsEnvelope,
  type SecurityGraphListIngestionsEnvelope,
} from "../../server/agent-studio/services/security-graph/security-graph-router";

describe("T-G.3.α — securityGraphRouter shape", () => {
  it("exports listIngestions + getIngestionStats procedures", () => {
    const procedures = (securityGraphRouter as unknown as {
      _def: { procedures: Record<string, unknown> };
    })._def.procedures;
    const keys = Object.keys(procedures);
    expect(keys).toContain("listIngestions");
    expect(keys).toContain("getIngestionStats");
  });

  it("exposes sane default + absolute limit constants", () => {
    expect(SECURITY_GRAPH_LIST_INGESTIONS_DEFAULT_LIMIT).toBe(50);
    expect(SECURITY_GRAPH_LIST_INGESTIONS_ABSOLUTE_LIMIT).toBe(200);
    expect(SECURITY_GRAPH_LIST_INGESTIONS_DEFAULT_LIMIT).toBeLessThan(
      SECURITY_GRAPH_LIST_INGESTIONS_ABSOLUTE_LIMIT,
    );
  });

  it("discriminated stats envelope: ok vs not_found", () => {
    const ok: SecurityGraphGetIngestionStatsEnvelope = {
      status: "ok",
      stats: {
        ingestionId: "nvd::2026-05-17T20:00Z",
        nodeCount: 0,
        edgeCount: 0,
        nodeTypeCounts: [],
        edgeTypeCounts: [],
      },
    };
    const missing: SecurityGraphGetIngestionStatsEnvelope = {
      status: "not_found",
      ingestionId: "i-missing",
    };
    expect(ok.status).toBe("ok");
    expect(missing.status).toBe("not_found");
    if (ok.status === "ok") {
      expect(ok.stats.ingestionId).toBe("nvd::2026-05-17T20:00Z");
    }
    if (missing.status === "not_found") {
      expect(missing.ingestionId).toBe("i-missing");
    }
  });

  it("list envelope wraps an array of ingestions (with sourceKey, not repositoryId)", () => {
    const env: SecurityGraphListIngestionsEnvelope = {
      ingestions: [
        {
          ingestionId: "nvd::2026-05-17T20:00Z",
          sourceKey: "nvd",
          status: "complete",
          nodesUpserted: 1200,
          edgesUpserted: 3400,
          edgesRejected: 0,
          startedAt: new Date("2026-05-17T20:00:00Z"),
          completedAt: new Date("2026-05-17T20:01:30Z"),
        },
      ],
    };
    expect(env.ingestions.length).toBe(1);
    // Security graph uses `sourceKey` (feed id) where code graph uses
    // `repositoryId` — this is the only schema shape difference vs
    // CodeGraphIngestionListRow.
    expect(env.ingestions[0]!.sourceKey).toBe("nvd");
  });
});

// ──────────────────────────────────────────────────────────────────
// Source-scan integrity — mount drift guard.
// ──────────────────────────────────────────────────────────────────

describe("T-G.3.α source-scan — securityGraph router is mounted", () => {
  it("api/router.ts imports securityGraphRouter and mounts it at `securityGraph`", () => {
    const file = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/api/router.ts",
      ),
      "utf-8",
    );
    expect(file).toContain(
      'import { securityGraphRouter } from "../services/security-graph/security-graph-router"',
    );
    expect(file).toMatch(/securityGraph:\s*securityGraphRouter,/);
  });
});
