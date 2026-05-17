/**
 * T-G.3.γ — Security Graph closed-taxonomy enumeration.
 *
 * Stacks on α (#1417) + β (#1418). Mirrors T-G.2.δ — precedent (s)
 * carry-forward. Exposes the compile-time `SECURITY_GRAPH_NODE_TYPES`
 * (10) + `SECURITY_GRAPH_EDGE_TYPES` (8) + edge constraints via tRPC
 * so the dashboard filter dropdowns can populate dynamically.
 *
 * Parameterless query — pure enumeration.
 */

import { describe, it, expect } from "vitest";

import {
  securityGraphRouter,
  type SecurityGraphKnownTypesEnvelope,
} from "../../server/agent-studio/services/security-graph/security-graph-router";
import {
  SECURITY_GRAPH_NODE_TYPES,
  SECURITY_GRAPH_EDGE_TYPES,
} from "../../server/agent-studio/services/security-graph/contracts";

describe("T-G.3.γ — securityGraphRouter.listKnownTypes shape", () => {
  it("router exposes listKnownTypes procedure", () => {
    const procedures = (securityGraphRouter as unknown as {
      _def: { procedures: Record<string, unknown> };
    })._def.procedures;
    const keys = Object.keys(procedures);
    expect(keys).toContain("listKnownTypes");
    // Prior procedures still present (regression check).
    expect(keys).toContain("listIngestions");
    expect(keys).toContain("getIngestionStats");
    expect(keys).toContain("listIngestionNodes");
    expect(keys).toContain("listIngestionEdges");
  });

  it("envelope passes through the 10 node + 8 edge closed taxonomies", () => {
    const env: SecurityGraphKnownTypesEnvelope = {
      nodeTypes: SECURITY_GRAPH_NODE_TYPES,
      edgeTypes: SECURITY_GRAPH_EDGE_TYPES,
      edgeConstraints: {} as never,
    };
    expect(env.nodeTypes.length).toBe(10);
    expect(env.edgeTypes.length).toBe(8);
    // Spot-check well-known entries — anchors against silent
    // drift (especially important for the security taxonomy where
    // node names like `cve` and edges like `affects_package` are
    // the operator-facing labels).
    expect(env.nodeTypes).toContain("cve");
    expect(env.nodeTypes).toContain("security_finding");
    expect(env.nodeTypes).toContain("package");
    expect(env.nodeTypes).toContain("customer_exposure");
    expect(env.nodeTypes).toContain("policy");
    expect(env.edgeTypes).toContain("affects_package");
    expect(env.edgeTypes).toContain("bundled_in");
    expect(env.edgeTypes).toContain("deployed_in");
    expect(env.edgeTypes).toContain("governed_by_policy");
  });
});
