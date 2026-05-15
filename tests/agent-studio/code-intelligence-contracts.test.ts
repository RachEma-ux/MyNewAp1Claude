/**
 * Code Intelligence Graph contracts — Phase 25 §T-G.2.
 *
 * Tests the 12-node + 10-edge closed taxonomies + per-edge endpoint
 * constraint validator.
 */

import { describe, it, expect } from "vitest";
import {
  CODE_GRAPH_NODE_TYPES,
  CODE_GRAPH_EDGE_TYPES,
  CODE_GRAPH_EDGE_CONSTRAINTS,
  isCodeGraphNodeType,
  isCodeGraphEdgeType,
  isAllowedCodeGraphEdge,
  listAllowedEdgeTypesFromSource,
} from "../../server/agent-studio/services/code-graph/contracts/public-api";

describe("Closed node-type taxonomy", () => {
  it("contains exactly 12 roadmap-named types", () => {
    expect([...CODE_GRAPH_NODE_TYPES]).toEqual([
      "repository",
      "package",
      "file",
      "class",
      "function",
      "method",
      "api_endpoint",
      "service",
      "db_table",
      "frontend_component",
      "config_file",
      "test_file",
    ]);
  });

  it("isCodeGraphNodeType narrows correctly", () => {
    expect(isCodeGraphNodeType("file")).toBe(true);
    expect(isCodeGraphNodeType("api_endpoint")).toBe(true);
    expect(isCodeGraphNodeType("module")).toBe(false);
    expect(isCodeGraphNodeType(42)).toBe(false);
  });

  it("ids unique", () => {
    expect(new Set(CODE_GRAPH_NODE_TYPES).size).toBe(
      CODE_GRAPH_NODE_TYPES.length,
    );
  });
});

describe("Closed edge-type taxonomy", () => {
  it("contains exactly 10 roadmap-named types", () => {
    expect([...CODE_GRAPH_EDGE_TYPES]).toEqual([
      "imports",
      "calls",
      "declares",
      "implements",
      "depends_on",
      "reads_from_table",
      "writes_to_table",
      "routes_to",
      "renders_component",
      "tests",
    ]);
  });

  it("isCodeGraphEdgeType narrows correctly", () => {
    expect(isCodeGraphEdgeType("imports")).toBe(true);
    expect(isCodeGraphEdgeType("tests")).toBe(true);
    expect(isCodeGraphEdgeType("inherits")).toBe(false);
  });
});

describe("Edge endpoint constraints", () => {
  it("every edge has a constraint entry", () => {
    for (const e of CODE_GRAPH_EDGE_TYPES) {
      expect(CODE_GRAPH_EDGE_CONSTRAINTS[e]).toBeDefined();
    }
  });

  it("imports: file → file|package, many_to_many", () => {
    const c = CODE_GRAPH_EDGE_CONSTRAINTS.imports;
    expect(c.sourceTypeKeys).toEqual(["file"]);
    expect(c.targetTypeKeys).toEqual(["file", "package"]);
    expect(c.cardinality).toBe("many_to_many");
  });

  it("calls: function|method → function|method|api_endpoint", () => {
    const c = CODE_GRAPH_EDGE_CONSTRAINTS.calls;
    expect(c.sourceTypeKeys).toEqual(["function", "method"]);
    expect(c.targetTypeKeys).toEqual([
      "function",
      "method",
      "api_endpoint",
    ]);
  });

  it("declares: file → class|function|api_endpoint, one_to_many", () => {
    const c = CODE_GRAPH_EDGE_CONSTRAINTS.declares;
    expect(c.sourceTypeKeys).toEqual(["file"]);
    expect(c.targetTypeKeys).toEqual([
      "class",
      "function",
      "api_endpoint",
    ]);
    expect(c.cardinality).toBe("one_to_many");
  });

  it("routes_to: api_endpoint → function|method, one_to_many", () => {
    const c = CODE_GRAPH_EDGE_CONSTRAINTS.routes_to;
    expect(c.sourceTypeKeys).toEqual(["api_endpoint"]);
    expect(c.targetTypeKeys).toEqual(["function", "method"]);
    expect(c.cardinality).toBe("one_to_many");
  });

  it("reads_from_table + writes_to_table: function|method → db_table", () => {
    expect(CODE_GRAPH_EDGE_CONSTRAINTS.reads_from_table.targetTypeKeys).toEqual([
      "db_table",
    ]);
    expect(CODE_GRAPH_EDGE_CONSTRAINTS.writes_to_table.targetTypeKeys).toEqual([
      "db_table",
    ]);
  });

  it("tests: test_file → many code-graph types", () => {
    const c = CODE_GRAPH_EDGE_CONSTRAINTS.tests;
    expect(c.sourceTypeKeys).toEqual(["test_file"]);
    expect(c.targetTypeKeys).toEqual([
      "file",
      "function",
      "method",
      "class",
      "api_endpoint",
    ]);
  });
});

describe("isAllowedCodeGraphEdge validator", () => {
  it("accepts file -imports-> file", () => {
    expect(isAllowedCodeGraphEdge("file", "imports", "file")).toBe(true);
  });

  it("accepts function -calls-> function", () => {
    expect(isAllowedCodeGraphEdge("function", "calls", "function")).toBe(true);
  });

  it("accepts api_endpoint -routes_to-> function", () => {
    expect(
      isAllowedCodeGraphEdge("api_endpoint", "routes_to", "function"),
    ).toBe(true);
  });

  it("rejects file -calls-> function (file isn't a calls-source)", () => {
    expect(isAllowedCodeGraphEdge("file", "calls", "function")).toBe(false);
  });

  it("rejects function -declares-> class (file is the only declares-source)", () => {
    expect(isAllowedCodeGraphEdge("function", "declares", "class")).toBe(
      false,
    );
  });

  it("rejects function -tests-> file (only test_file can be a tests-source)", () => {
    expect(isAllowedCodeGraphEdge("function", "tests", "file")).toBe(false);
  });
});

describe("listAllowedEdgeTypesFromSource helper", () => {
  it("file can originate imports + declares", () => {
    const allowed = listAllowedEdgeTypesFromSource("file");
    expect(allowed).toContain("imports");
    expect(allowed).toContain("declares");
    expect(allowed).not.toContain("calls");
    expect(allowed).not.toContain("routes_to");
  });

  it("function can originate calls + reads_from_table + writes_to_table", () => {
    const allowed = listAllowedEdgeTypesFromSource("function");
    expect(allowed).toContain("calls");
    expect(allowed).toContain("reads_from_table");
    expect(allowed).toContain("writes_to_table");
    expect(allowed).not.toContain("imports");
  });

  it("test_file can originate only tests", () => {
    const allowed = listAllowedEdgeTypesFromSource("test_file");
    expect(allowed).toEqual(["tests"]);
  });

  it("api_endpoint can originate routes_to", () => {
    const allowed = listAllowedEdgeTypesFromSource("api_endpoint");
    expect(allowed).toContain("routes_to");
  });
});
