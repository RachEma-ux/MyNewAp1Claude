/**
 * T-G.2.γ — Code Graph repository summary.
 *
 * Stacks on α (#1411) + β. Adds `listRepositories`, a per-repository
 * roll-up of the most-recent ingestion + freshness anchor +
 * total-ingestion-count. Drives the operator dashboard's "stale repos"
 * panel — the operator-actionable signal for re-ingest cron decisions.
 *
 * Structural test only — DB-backed behavior covered by the store
 * integration tests.
 */

import { describe, it, expect } from "vitest";

import {
  codeGraphRouter,
  CODE_GRAPH_LIST_REPOSITORIES_DEFAULT_LIMIT,
  CODE_GRAPH_LIST_REPOSITORIES_ABSOLUTE_LIMIT,
  type CodeGraphListRepositoriesEnvelope,
} from "../../server/agent-studio/services/code-graph/code-graph-router";

describe("T-G.2.γ — codeGraphRouter.listRepositories shape", () => {
  it("router exposes listRepositories procedure", () => {
    const procedures = (codeGraphRouter as unknown as {
      _def: { procedures: Record<string, unknown> };
    })._def.procedures;
    const keys = Object.keys(procedures);
    expect(keys).toContain("listRepositories");
    // Prior procedures still present.
    expect(keys).toContain("listIngestions");
    expect(keys).toContain("getIngestionStats");
    expect(keys).toContain("listIngestionNodes");
    expect(keys).toContain("listIngestionEdges");
  });

  it("default + absolute limit constants are sane", () => {
    expect(CODE_GRAPH_LIST_REPOSITORIES_DEFAULT_LIMIT).toBe(50);
    expect(CODE_GRAPH_LIST_REPOSITORIES_ABSOLUTE_LIMIT).toBe(200);
    expect(CODE_GRAPH_LIST_REPOSITORIES_DEFAULT_LIMIT).toBeLessThan(
      CODE_GRAPH_LIST_REPOSITORIES_ABSOLUTE_LIMIT,
    );
  });

  it("envelope wraps an array of per-repository summary rows", () => {
    const env: CodeGraphListRepositoriesEnvelope = {
      repositories: [
        {
          repositoryId: "RachEma-ux/MyNewAp1Claude",
          latestIngestionId: "RachEma-ux/MyNewAp1Claude::2026-05-17T20:00Z",
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
    expect(env.repositories.length).toBe(1);
    expect(env.repositories[0]!.repositoryId).toBe(
      "RachEma-ux/MyNewAp1Claude",
    );
    expect(env.repositories[0]!.totalIngestionCount).toBe(7);
    // latestCompletedAt is nullable while a run is still writing.
    const inflight: CodeGraphListRepositoriesEnvelope = {
      repositories: [
        {
          repositoryId: "demo-org/inflight",
          latestIngestionId: "demo-org/inflight::2026-05-17T21:00Z",
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
    expect(inflight.repositories[0]!.latestCompletedAt).toBeNull();
  });
});
