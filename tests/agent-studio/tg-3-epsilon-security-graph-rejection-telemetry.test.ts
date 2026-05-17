/**
 * T-G.3.ε — securityGraph rejection telemetry.
 *
 * Optional follow-up to the T-G.3 closure (§18). Surfaces
 * `metadata.rejectionsByReason` flattened across recent ingestions
 * — count-map shape, not row-list shape (which is why T-G.2.ε's
 * parser-error analog didn't directly mirror).
 */

import { describe, it, expect } from "vitest";

import {
  securityGraphRouter,
  SECURITY_GRAPH_RECENT_REJECTIONS_DEFAULT_INGESTION_LIMIT,
  SECURITY_GRAPH_RECENT_REJECTIONS_DEFAULT_ROW_LIMIT,
  SECURITY_GRAPH_RECENT_REJECTIONS_ABSOLUTE_INGESTION_LIMIT,
  SECURITY_GRAPH_RECENT_REJECTIONS_ABSOLUTE_ROW_LIMIT,
  type SecurityGraphRecentRejectionsEnvelope,
} from "../../server/agent-studio/services/security-graph/security-graph-router";

describe("T-G.3.ε — securityGraphRouter.listRecentRejectionsByReason shape", () => {
  it("router exposes listRecentRejectionsByReason procedure", () => {
    const procedures = (securityGraphRouter as unknown as {
      _def: { procedures: Record<string, unknown> };
    })._def.procedures;
    const keys = Object.keys(procedures);
    expect(keys).toContain("listRecentRejectionsByReason");
    // Prior α/β/γ/δ procedures still present (regression check).
    expect(keys).toContain("listIngestions");
    expect(keys).toContain("getIngestionStats");
    expect(keys).toContain("listIngestionNodes");
    expect(keys).toContain("listIngestionEdges");
    expect(keys).toContain("listKnownTypes");
    expect(keys).toContain("listSources");
  });

  it("default + absolute limit constants are sane", () => {
    expect(SECURITY_GRAPH_RECENT_REJECTIONS_DEFAULT_INGESTION_LIMIT).toBe(20);
    expect(SECURITY_GRAPH_RECENT_REJECTIONS_DEFAULT_ROW_LIMIT).toBe(100);
    expect(SECURITY_GRAPH_RECENT_REJECTIONS_ABSOLUTE_INGESTION_LIMIT).toBe(200);
    expect(SECURITY_GRAPH_RECENT_REJECTIONS_ABSOLUTE_ROW_LIMIT).toBe(500);
    expect(
      SECURITY_GRAPH_RECENT_REJECTIONS_DEFAULT_INGESTION_LIMIT,
    ).toBeLessThan(SECURITY_GRAPH_RECENT_REJECTIONS_ABSOLUTE_INGESTION_LIMIT);
    expect(
      SECURITY_GRAPH_RECENT_REJECTIONS_DEFAULT_ROW_LIMIT,
    ).toBeLessThan(SECURITY_GRAPH_RECENT_REJECTIONS_ABSOLUTE_ROW_LIMIT);
  });

  it("envelope wraps an array of rejection rows with ingestion context", () => {
    const env: SecurityGraphRecentRejectionsEnvelope = {
      rejections: [
        {
          ingestionId: "nvd::2026-05-17T20:00Z",
          sourceKey: "nvd",
          reason: "schema_violation",
          count: 12,
          ingestionStartedAt: new Date("2026-05-17T20:00:00Z"),
        },
        {
          ingestionId: "nvd::2026-05-17T20:00Z",
          sourceKey: "nvd",
          reason: "unknown_target_type",
          count: 3,
          ingestionStartedAt: new Date("2026-05-17T20:00:00Z"),
        },
      ],
    };
    expect(env.rejections.length).toBe(2);
    expect(env.rejections[0]!.reason).toBe("schema_violation");
    expect(env.rejections[0]!.count).toBe(12);
    // ingestionId + sourceKey attached for source-of-record context
    // (same pattern as code-graph parser-error rows).
    expect(env.rejections[0]!.sourceKey).toBe("nvd");
    expect(env.rejections[1]!.reason).toBe("unknown_target_type");
  });
});
