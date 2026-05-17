/**
 * T-G.3.β — Security Graph drill-in tRPC procedures.
 *
 * Stacks on α (#1417). Mirrors `tg-2-beta-code-graph-drill-in.test.ts`
 * — precedent (s) carry-forward of the T-G.2.β shape.
 *
 *   - `listIngestionNodes(ingestionId, typeKey?, limit?)`
 *   - `listIngestionEdges(ingestionId, edgeTypeKey?, limit?)`
 *
 * Both pre-check ingestion existence via `getIngestionStats === null`
 * and return `ingestion_not_found` envelope before paying for the
 * sample query.
 */

import { describe, it, expect } from "vitest";

import {
  securityGraphRouter,
  SECURITY_GRAPH_DRILL_IN_DEFAULT_LIMIT,
  SECURITY_GRAPH_DRILL_IN_ABSOLUTE_LIMIT,
  type SecurityGraphListIngestionNodesEnvelope,
  type SecurityGraphListIngestionEdgesEnvelope,
} from "../../server/agent-studio/services/security-graph/security-graph-router";

describe("T-G.3.β — securityGraphRouter drill-in shape", () => {
  it("router exposes listIngestionNodes + listIngestionEdges procedures", () => {
    const procedures = (securityGraphRouter as unknown as {
      _def: { procedures: Record<string, unknown> };
    })._def.procedures;
    const keys = Object.keys(procedures);
    expect(keys).toContain("listIngestionNodes");
    expect(keys).toContain("listIngestionEdges");
    // α procedures still present.
    expect(keys).toContain("listIngestions");
    expect(keys).toContain("getIngestionStats");
  });

  it("drill-in default + absolute limit constants are sane", () => {
    expect(SECURITY_GRAPH_DRILL_IN_DEFAULT_LIMIT).toBe(100);
    expect(SECURITY_GRAPH_DRILL_IN_ABSOLUTE_LIMIT).toBe(500);
    expect(SECURITY_GRAPH_DRILL_IN_DEFAULT_LIMIT).toBeLessThan(
      SECURITY_GRAPH_DRILL_IN_ABSOLUTE_LIMIT,
    );
  });

  it("nodes envelope: ok vs ingestion_not_found discriminator", () => {
    const ok: SecurityGraphListIngestionNodesEnvelope = {
      status: "ok",
      nodes: [
        {
          id: "cve:CVE-2026-0001",
          typeKey: "cve",
          name: "CVE-2026-0001",
        },
      ],
    };
    const missing: SecurityGraphListIngestionNodesEnvelope = {
      status: "ingestion_not_found",
      ingestionId: "i-missing",
    };
    if (ok.status === "ok") {
      expect(ok.nodes.length).toBe(1);
      expect(ok.nodes[0]!.typeKey).toBe("cve");
    }
    if (missing.status === "ingestion_not_found") {
      expect(missing.ingestionId).toBe("i-missing");
    }
  });

  it("edges envelope: ok vs ingestion_not_found discriminator", () => {
    const ok: SecurityGraphListIngestionEdgesEnvelope = {
      status: "ok",
      edges: [
        {
          id: "cve:CVE-2026-0001::affects_package::package:npm:foo:1.2.3",
          sourceId: "cve:CVE-2026-0001",
          edgeTypeKey: "affects_package",
          targetId: "package:npm:foo:1.2.3",
        },
      ],
    };
    const missing: SecurityGraphListIngestionEdgesEnvelope = {
      status: "ingestion_not_found",
      ingestionId: "i-missing",
    };
    if (ok.status === "ok") {
      expect(ok.edges.length).toBe(1);
      expect(ok.edges[0]!.edgeTypeKey).toBe("affects_package");
    }
    if (missing.status === "ingestion_not_found") {
      expect(missing.ingestionId).toBe("i-missing");
    }
  });
});
