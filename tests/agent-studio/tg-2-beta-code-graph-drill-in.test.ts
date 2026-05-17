/**
 * T-G.2.β — Code Graph drill-in tRPC procedures.
 *
 * Extends T-G.2.α (#1411) with two operator-facing read procedures
 * that surface sample rows behind the per-typeKey stats panel:
 *
 *   - `listIngestionNodes(ingestionId, typeKey?, limit?)` — sample
 *     `ags_code_graph_nodes` rows scoped to one ingestion, optionally
 *     filtered by typeKey.
 *   - `listIngestionEdges(ingestionId, edgeTypeKey?, limit?)` — sample
 *     `ags_code_graph_edges` rows scoped to one ingestion, optionally
 *     filtered by edgeTypeKey.
 *
 * Both procedures pre-check ingestion existence via
 * `getIngestionStats === null` and return a discriminated
 * `ingestion_not_found` envelope before paying for the sample query.
 * Saves operators from misinterpreting "empty list" as "this
 * ingestion exists but has no rows".
 *
 * This test is structural — it does not exercise the live ASDB path
 * (covered by the store integration tests).
 */

import { describe, it, expect } from "vitest";

import {
  codeGraphRouter,
  CODE_GRAPH_DRILL_IN_DEFAULT_LIMIT,
  CODE_GRAPH_DRILL_IN_ABSOLUTE_LIMIT,
  type CodeGraphListIngestionNodesEnvelope,
  type CodeGraphListIngestionEdgesEnvelope,
} from "../../server/agent-studio/services/code-graph/code-graph-router";

describe("T-G.2.β — codeGraphRouter drill-in shape", () => {
  it("router exposes listIngestionNodes + listIngestionEdges procedures", () => {
    const procedures = (codeGraphRouter as unknown as {
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
    expect(CODE_GRAPH_DRILL_IN_DEFAULT_LIMIT).toBe(100);
    expect(CODE_GRAPH_DRILL_IN_ABSOLUTE_LIMIT).toBe(500);
    expect(CODE_GRAPH_DRILL_IN_DEFAULT_LIMIT).toBeLessThan(
      CODE_GRAPH_DRILL_IN_ABSOLUTE_LIMIT,
    );
  });

  it("nodes envelope: ok vs ingestion_not_found discriminator", () => {
    const ok: CodeGraphListIngestionNodesEnvelope = {
      status: "ok",
      nodes: [
        {
          id: "file:src/foo.ts",
          typeKey: "file",
          name: "foo.ts",
          filePath: "src/foo.ts",
        },
      ],
    };
    const missing: CodeGraphListIngestionNodesEnvelope = {
      status: "ingestion_not_found",
      ingestionId: "i-missing",
    };
    if (ok.status === "ok") {
      expect(ok.nodes.length).toBe(1);
      expect(ok.nodes[0]!.id).toBe("file:src/foo.ts");
    }
    if (missing.status === "ingestion_not_found") {
      expect(missing.ingestionId).toBe("i-missing");
    }
  });

  it("edges envelope: ok vs ingestion_not_found discriminator", () => {
    const ok: CodeGraphListIngestionEdgesEnvelope = {
      status: "ok",
      edges: [
        {
          id: "file:src/foo.ts::imports::file:src/bar.ts",
          sourceId: "file:src/foo.ts",
          edgeTypeKey: "imports",
          targetId: "file:src/bar.ts",
        },
      ],
    };
    const missing: CodeGraphListIngestionEdgesEnvelope = {
      status: "ingestion_not_found",
      ingestionId: "i-missing",
    };
    if (ok.status === "ok") {
      expect(ok.edges.length).toBe(1);
      expect(ok.edges[0]!.edgeTypeKey).toBe("imports");
    }
    if (missing.status === "ingestion_not_found") {
      expect(missing.ingestionId).toBe("i-missing");
    }
  });
});
