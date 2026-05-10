/**
 * Phase 12.5 — Text2Cypher validator tests.
 *
 * Asserts the read-only guardrails block every forbidden token + allow
 * approved templates.
 */

import { describe, it, expect } from "vitest";
import {
  FORBIDDEN_TOKENS,
  validateCypherReadOnly,
} from "../../server/agent-studio/services/graph/retrieval/public-api.js";

describe("validateCypherReadOnly — read-only acceptance", () => {
  it("accepts a simple MATCH...RETURN", () => {
    const r = validateCypherReadOnly("MATCH (n:Note) WHERE n.id = $id RETURN n LIMIT 100");
    expect(r.ok).toBe(true);
  });

  it("accepts depth-3 traversal", () => {
    const r = validateCypherReadOnly("MATCH (a:Note)-[:LINKS_TO*1..3]-(b:Note) RETURN a, b LIMIT 50");
    expect(r.ok).toBe(true);
  });

  it("accepts allowed apoc.path procedure", () => {
    const r = validateCypherReadOnly("CALL apoc.path.subgraphAll($seed, {maxLevel: 2}) YIELD nodes RETURN nodes");
    expect(r.ok).toBe(true);
  });
});

describe("validateCypherReadOnly — forbidden tokens", () => {
  for (const token of FORBIDDEN_TOKENS) {
    it(`rejects \`${token}\``, () => {
      const cypher =
        token === "LOAD CSV"
          ? "LOAD CSV WITH HEADERS FROM 'file:///x' AS row RETURN row"
          : `${token} (n:Note {id: 1}) RETURN n`;
      const r = validateCypherReadOnly(cypher);
      expect(r.ok).toBe(false);
      if (!r.ok && r.reason === "forbidden_token") {
        // token may include whitespace inside (LOAD CSV); match case-insensitively
        expect(r.token.replace(/\s+/g, " ")).toBe(token.replace(/\s+/g, " "));
      }
    });
  }

  it("rejects forbidden apoc.create procedure", () => {
    const r = validateCypherReadOnly("CALL apoc.create.node(['Note'], {id: 1}) YIELD node RETURN node");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("forbidden_procedure");
  });

  it("rejects disallowed procedure namespace", () => {
    const r = validateCypherReadOnly("CALL custom.namespace.someProc() YIELD x RETURN x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("disallowed_procedure");
  });

  it("rejects empty query", () => {
    const r = validateCypherReadOnly("   \n\n  ");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("empty_query");
  });

  it("rejects MATCH ... DELETE n", () => {
    const r = validateCypherReadOnly("MATCH (n:Note {id: 1}) DELETE n");
    expect(r.ok).toBe(false);
  });

  it("rejects DETACH DELETE", () => {
    const r = validateCypherReadOnly("MATCH (n:Note {id: 1}) DETACH DELETE n");
    expect(r.ok).toBe(false);
  });

  it("ignores forbidden tokens inside string literals (best-effort)", () => {
    // Phase 13.5 hardens this with a proper AST parser; the MVP token check
    // is intentionally conservative — strings containing forbidden uppercase
    // tokens are still rejected. This documents the limitation.
    const r = validateCypherReadOnly("MATCH (n:Note) WHERE n.title = 'CREATE TABLE' RETURN n");
    expect(r.ok).toBe(false); // documented false-positive for MVP
  });
});
