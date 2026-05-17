/**
 * T-G.3.δ — Security Graph sources surface.
 *
 * Stacks on α (#1417) + β (#1418) + γ (#1419). Mirrors T-G.2.γ
 * (`listRepositories`) — precedent (s) carry-forward — but keyed on
 * `sourceKey` (NVD/GHSA/scanner-id) instead of `repositoryId`. Drives
 * the operator dashboard's "feed freshness" panel — the
 * operator-actionable signal for re-ingest cron decisions on
 * security data feeds.
 */

import { describe, it, expect } from "vitest";

import {
  securityGraphRouter,
  SECURITY_GRAPH_LIST_SOURCES_DEFAULT_LIMIT,
  SECURITY_GRAPH_LIST_SOURCES_ABSOLUTE_LIMIT,
  type SecurityGraphListSourcesEnvelope,
} from "../../server/agent-studio/services/security-graph/security-graph-router";

describe("T-G.3.δ — securityGraphRouter.listSources shape", () => {
  it("router exposes listSources procedure", () => {
    const procedures = (securityGraphRouter as unknown as {
      _def: { procedures: Record<string, unknown> };
    })._def.procedures;
    const keys = Object.keys(procedures);
    expect(keys).toContain("listSources");
    // Prior procedures still present.
    expect(keys).toContain("listIngestions");
    expect(keys).toContain("getIngestionStats");
    expect(keys).toContain("listIngestionNodes");
    expect(keys).toContain("listIngestionEdges");
    expect(keys).toContain("listKnownTypes");
  });

  it("default + absolute limit constants are sane", () => {
    expect(SECURITY_GRAPH_LIST_SOURCES_DEFAULT_LIMIT).toBe(50);
    expect(SECURITY_GRAPH_LIST_SOURCES_ABSOLUTE_LIMIT).toBe(200);
    expect(SECURITY_GRAPH_LIST_SOURCES_DEFAULT_LIMIT).toBeLessThan(
      SECURITY_GRAPH_LIST_SOURCES_ABSOLUTE_LIMIT,
    );
  });

  it("envelope wraps an array of per-source summary rows", () => {
    const env: SecurityGraphListSourcesEnvelope = {
      sources: [
        {
          sourceKey: "nvd",
          latestIngestionId: "nvd::2026-05-17T20:00Z",
          latestStatus: "complete",
          latestNodesUpserted: 1200,
          latestEdgesUpserted: 4300,
          latestEdgesRejected: 12,
          latestStartedAt: new Date("2026-05-17T20:00:00Z"),
          latestCompletedAt: new Date("2026-05-17T20:01:30Z"),
          totalIngestionCount: 7,
        },
      ],
    };
    expect(env.sources.length).toBe(1);
    // Security graph uses `sourceKey` (feed id) where code graph uses
    // `repositoryId` — the only schema-shape difference vs
    // CodeGraphRepositorySummaryRow.
    expect(env.sources[0]!.sourceKey).toBe("nvd");
    expect(env.sources[0]!.totalIngestionCount).toBe(7);

    // latestCompletedAt nullable for inflight runs.
    const inflight: SecurityGraphListSourcesEnvelope = {
      sources: [
        {
          sourceKey: "ghsa",
          latestIngestionId: "ghsa::2026-05-17T21:00Z",
          latestStatus: "writing",
          latestNodesUpserted: 0,
          latestEdgesUpserted: 0,
          latestEdgesRejected: 0,
          latestStartedAt: new Date("2026-05-17T21:00:00Z"),
          latestCompletedAt: null,
          totalIngestionCount: 1,
        },
      ],
    };
    expect(inflight.sources[0]!.latestCompletedAt).toBeNull();
  });
});
