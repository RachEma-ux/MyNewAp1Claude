/**
 * T-G.2.δ — Code Graph closed-taxonomy enumeration.
 *
 * Stacks on α (#1411) + β (#1412) + γ (#1413). Exposes
 * `CODE_GRAPH_NODE_TYPES` + `CODE_GRAPH_EDGE_TYPES` +
 * `CODE_GRAPH_EDGE_CONSTRAINTS` via tRPC so the dashboard filter
 * dropdowns can populate dynamically without hard-coding the 12+10
 * enums.
 *
 * Parameterless query (no `input` schema) — pure enumeration.
 */

import { describe, it, expect } from "vitest";

import {
  codeGraphRouter,
  type CodeGraphKnownTypesEnvelope,
} from "../../server/agent-studio/services/code-graph/code-graph-router";
import {
  CODE_GRAPH_NODE_TYPES,
  CODE_GRAPH_EDGE_TYPES,
} from "../../server/agent-studio/services/code-graph/contracts/public-api";

describe("T-G.2.δ — codeGraphRouter.listKnownTypes shape", () => {
  it("router exposes listKnownTypes procedure", () => {
    const procedures = (codeGraphRouter as unknown as {
      _def: { procedures: Record<string, unknown> };
    })._def.procedures;
    const keys = Object.keys(procedures);
    expect(keys).toContain("listKnownTypes");
    // Prior procedures still present.
    expect(keys).toContain("listIngestions");
    expect(keys).toContain("getIngestionStats");
    expect(keys).toContain("listIngestionNodes");
    expect(keys).toContain("listIngestionEdges");
    expect(keys).toContain("listRepositories");
  });

  it("envelope passes through the 12 node + 10 edge closed taxonomies", () => {
    const env: CodeGraphKnownTypesEnvelope = {
      nodeTypes: CODE_GRAPH_NODE_TYPES,
      edgeTypes: CODE_GRAPH_EDGE_TYPES,
      edgeConstraints: {} as never,
    };
    expect(env.nodeTypes.length).toBe(12);
    expect(env.edgeTypes.length).toBe(10);
    // Spot-check a few well-known entries (anchors against drift).
    expect(env.nodeTypes).toContain("repository");
    expect(env.nodeTypes).toContain("file");
    expect(env.nodeTypes).toContain("function");
    expect(env.nodeTypes).toContain("api_endpoint");
    expect(env.edgeTypes).toContain("imports");
    expect(env.edgeTypes).toContain("calls");
    expect(env.edgeTypes).toContain("declares");
  });
});
