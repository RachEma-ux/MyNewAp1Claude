/**
 * Retrofit P7 — MCP tool knowledge sync (pure helpers).
 *
 * The DB-backed sync function (`syncToolKnowledge`) is exercised in
 * Phase 13 e2e against a live ASDB; here we test the pure helpers
 * since they're the contract surface that downstream consumers
 * (Phase 8 ProposedToolCall validator) depend on.
 */

import { describe, it, expect } from "vitest";
import {
  canonicalizeToolSnapshot,
  computeSchemaHash,
} from "../../server/agent-studio/services/mcp/tool-knowledge-sync";

describe("canonicalizeToolSnapshot", () => {
  it("produces identical output regardless of inputSchema key order", () => {
    const a = canonicalizeToolSnapshot({
      name: "add",
      description: "adds",
      inputSchema: { properties: { b: { type: "number" }, a: { type: "number" } }, type: "object" },
    });
    const b = canonicalizeToolSnapshot({
      name: "add",
      description: "adds",
      inputSchema: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } } },
    });
    expect(a).toBe(b);
  });

  it("treats missing description as empty string", () => {
    const a = canonicalizeToolSnapshot({ name: "x" });
    const b = canonicalizeToolSnapshot({ name: "x", description: "" });
    expect(a).toBe(b);
  });

  it("treats missing inputSchema as empty object", () => {
    const a = canonicalizeToolSnapshot({ name: "x", description: "d" });
    const b = canonicalizeToolSnapshot({ name: "x", description: "d", inputSchema: {} });
    expect(a).toBe(b);
  });
});

describe("computeSchemaHash", () => {
  it("64-char hex string (SHA-256)", () => {
    const h = computeSchemaHash({ name: "add", description: "adds two numbers" });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("identical snapshots produce identical hashes", () => {
    const snap = {
      name: "calculator",
      description: "do math",
      inputSchema: { type: "object", properties: { expr: { type: "string" } } },
    };
    expect(computeSchemaHash(snap)).toBe(computeSchemaHash(snap));
  });

  it("changing description changes the hash", () => {
    const a = computeSchemaHash({ name: "x", description: "before" });
    const b = computeSchemaHash({ name: "x", description: "after" });
    expect(a).not.toBe(b);
  });

  it("changing inputSchema changes the hash", () => {
    const a = computeSchemaHash({
      name: "x",
      description: "d",
      inputSchema: { type: "object", properties: { a: { type: "number" } } },
    });
    const b = computeSchemaHash({
      name: "x",
      description: "d",
      inputSchema: { type: "object", properties: { a: { type: "string" } } },
    });
    expect(a).not.toBe(b);
  });

  it("inputSchema key order does NOT change the hash (canonicalization)", () => {
    const a = computeSchemaHash({
      name: "x",
      inputSchema: { properties: { b: 1, a: 2 } } as any,
    });
    const b = computeSchemaHash({
      name: "x",
      inputSchema: { properties: { a: 2, b: 1 } } as any,
    });
    expect(a).toBe(b);
  });
});
