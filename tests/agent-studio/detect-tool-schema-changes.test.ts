/**
 * Tool-schema change detector — Phase 22 §T-I.5 batch A.4.
 *
 * Pure-function tests on the diff helper that powers the auto-sync
 * `tool_schema_changed` bridge wiring.
 */

import { describe, it, expect } from "vitest";
import {
  detectToolSchemaChanges,
  canonicalizeSchemaForCompare,
} from "../../server/agent-studio/services/mcp/detect-tool-schema-changes";

describe("canonicalizeSchemaForCompare — key-order independence", () => {
  it("hashes identically across key permutations", () => {
    const a = { type: "object", properties: { x: { type: "string" } } };
    const b = { properties: { x: { type: "string" } }, type: "object" };
    expect(canonicalizeSchemaForCompare(a)).toBe(
      canonicalizeSchemaForCompare(b),
    );
  });

  it("returns null for undefined (distinct from empty object)", () => {
    expect(canonicalizeSchemaForCompare(undefined)).toBe(null);
    expect(canonicalizeSchemaForCompare({})).not.toBe(null);
  });

  it("recursive sort handles nested objects", () => {
    const a = {
      type: "object",
      properties: { y: { type: "number" }, x: { type: "string" } },
    };
    const b = {
      properties: { x: { type: "string" }, y: { type: "number" } },
      type: "object",
    };
    expect(canonicalizeSchemaForCompare(a)).toBe(
      canonicalizeSchemaForCompare(b),
    );
  });

  it("distinguishes arrays by element order (semantic)", () => {
    const a = { required: ["a", "b"] };
    const b = { required: ["b", "a"] };
    expect(canonicalizeSchemaForCompare(a)).not.toBe(
      canonicalizeSchemaForCompare(b),
    );
  });
});

describe("detectToolSchemaChanges — first publish", () => {
  it("returns empty list when previous is undefined", () => {
    expect(
      detectToolSchemaChanges(
        [
          {
            name: "search",
            inputSchema: { type: "object", properties: { q: { type: "string" } } },
          },
        ],
        undefined,
      ),
    ).toEqual([]);
  });
});

describe("detectToolSchemaChanges — no changes", () => {
  it("returns empty when current matches previous", () => {
    const tools = [
      {
        name: "search",
        inputSchema: { type: "object", properties: { q: { type: "string" } } },
      },
      {
        name: "fetch",
        inputSchema: { type: "object", properties: { url: { type: "string" } } },
      },
    ];
    expect(detectToolSchemaChanges(tools, tools)).toEqual([]);
  });

  it("description-only changes do NOT count as schema_changed", () => {
    const prev = [
      {
        name: "search",
        description: "old description",
        inputSchema: { type: "object" },
      },
    ];
    const curr = [
      {
        name: "search",
        description: "new description",
        inputSchema: { type: "object" },
      },
    ];
    expect(detectToolSchemaChanges(curr, prev)).toEqual([]);
  });
});

describe("detectToolSchemaChanges — added / removed / schema_changed", () => {
  it("emits 'added' for new tools", () => {
    const prev = [{ name: "search", inputSchema: { type: "object" } }];
    const curr = [
      { name: "search", inputSchema: { type: "object" } },
      { name: "fetch", inputSchema: { type: "object" } },
    ];
    expect(detectToolSchemaChanges(curr, prev)).toEqual([
      { toolName: "fetch", kind: "added" },
    ]);
  });

  it("emits 'removed' for tools dropped between snapshots", () => {
    const prev = [
      { name: "search", inputSchema: { type: "object" } },
      { name: "fetch", inputSchema: { type: "object" } },
    ];
    const curr = [{ name: "search", inputSchema: { type: "object" } }];
    expect(detectToolSchemaChanges(curr, prev)).toEqual([
      { toolName: "fetch", kind: "removed" },
    ]);
  });

  it("emits 'schema_changed' when inputSchema differs", () => {
    const prev = [
      {
        name: "search",
        inputSchema: { type: "object", properties: { q: { type: "string" } } },
      },
    ];
    const curr = [
      {
        name: "search",
        inputSchema: {
          type: "object",
          properties: { q: { type: "string" }, k: { type: "number" } },
        },
      },
    ];
    expect(detectToolSchemaChanges(curr, prev)).toEqual([
      { toolName: "search", kind: "schema_changed" },
    ]);
  });

  it("aggregates multiple change kinds in one diff", () => {
    const prev = [
      { name: "search", inputSchema: { type: "object" } },
      { name: "fetch", inputSchema: { type: "object" } },
    ];
    const curr = [
      { name: "search", inputSchema: { type: "object", required: ["q"] } }, // schema_changed
      { name: "list", inputSchema: { type: "object" } }, // added
      // fetch removed
    ];
    const changes = detectToolSchemaChanges(curr, prev);
    // Order is: per-current-tool, then per-removed-tool.
    expect(changes).toEqual([
      { toolName: "search", kind: "schema_changed" },
      { toolName: "list", kind: "added" },
      { toolName: "fetch", kind: "removed" },
    ]);
  });
});
