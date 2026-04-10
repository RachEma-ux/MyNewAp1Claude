/**
 * KGIA — Query Repair Service Tests
 */

import { describe, it, expect } from "vitest";
import { addLimitClause, capHopDepth } from "../services/query-repair";

describe("addLimitClause", () => {
  it("adds LIMIT to Cypher query without one", () => {
    const query = "MATCH (n:Person) RETURN n";
    const result = addLimitClause(query, 500);
    expect(result).toContain("LIMIT 500");
  });

  it("does not add LIMIT if already present", () => {
    const query = "MATCH (n:Person) RETURN n LIMIT 10";
    const result = addLimitClause(query, 500);
    expect(result).toBe(query);
  });

  it("adds LIMIT to SPARQL SELECT", () => {
    const query = "SELECT ?s ?p ?o WHERE { ?s ?p ?o }";
    const result = addLimitClause(query, 1000);
    expect(result).toContain("LIMIT 1000");
  });

  it("does not modify query with existing SPARQL LIMIT", () => {
    const query = "SELECT ?s WHERE { ?s ?p ?o } LIMIT 50";
    const result = addLimitClause(query, 1000);
    expect(result).toBe(query);
  });

  it("does not modify non-graph queries", () => {
    const query = "some random text";
    const result = addLimitClause(query, 500);
    expect(result).toBe(query);
  });
});

describe("capHopDepth", () => {
  it("replaces [*] with bounded range", () => {
    const query = "MATCH (a)-[*]->(b) RETURN a, b";
    const result = capHopDepth(query, 4);
    expect(result).toContain("[*1..4]");
  });

  it("caps [*..10] to maxHops", () => {
    const query = "MATCH (a)-[*..10]->(b) RETURN a, b";
    const result = capHopDepth(query, 4);
    expect(result).toContain("[*1..4]");
  });

  it("preserves hops within limit", () => {
    const query = "MATCH (a)-[*1..3]->(b) RETURN a, b";
    const result = capHopDepth(query, 6);
    expect(result).toContain("[*1..3]");
  });

  it("caps both min and max when both exceed limit", () => {
    const query = "MATCH (a)-[*5..10]->(b) RETURN a, b";
    const result = capHopDepth(query, 3);
    expect(result).toContain("[*3..3]");
  });

  it("handles multiple patterns in one query", () => {
    const query = "MATCH (a)-[*]->(b)-[*..8]->(c) RETURN a, b, c";
    const result = capHopDepth(query, 4);
    expect(result).not.toContain("[*]");
    expect(result).toContain("[*1..4]");
  });
});
