/**
 * M6-c6 (cycle-6 audit `/sdcard/Download/RUNTIME_GATE_AUDIT_2026-05-09.md`
 * §M6-c6) — `canonicalProposedToolCall` determinism coverage gap.
 *
 * Pre-cycle-6 the existing determinism tests
 * (`tests/agent-studio/proposed-tool-call.test.ts:130-147` and the
 * mirror in `retrofit-acceptance.test.ts:485-493`) covered:
 *   - argument key-order invariance (top-level only)
 *   - rationale-changes-hash
 *   - hash is 64-char hex
 *
 * The hash is the IDEMPOTENCY KEY for the (draft, hash) UNIQUE
 * INDEX added in M2-c6. ANY non-determinism in the canonical form
 * causes:
 *   - duplicate approval rows (two callers compute different
 *     hashes for what should be the same call → two pending rows)
 *   - the M2-c6 UNIQUE INDEX silently allows duplicates
 *
 * What was NOT covered pre-cycle-6:
 *   - Nested-object key ordering (deep recursion in arguments)
 *   - Array order PRESERVATION (lists are semantically ordered —
 *     [a,b] and [b,a] should hash differently)
 *   - Optional-field defaulting consistency (toolVersion, schemaHash,
 *     cagBlockIds, knowledgeUnitIds, toolKnowledgeIds undefined →
 *     same hash as those fields explicitly set to null/[])
 *   - Hash includes EVERY field listed in canonical's `ordered`
 *     object (a future PR that drops a field from canonical's
 *     output silently breaks the idempotency contract)
 *   - cagBlockIds / knowledgeUnitIds / toolKnowledgeIds /
 *     evidenceChunkIds are LIST semantics not SET (different order
 *     = different hash)
 *
 * This file pins the contract.
 */
import { describe, it, expect } from "vitest";
import {
  canonicalProposedToolCall,
  hashProposedToolCall,
} from "../../server/agent-studio/services/mcp/proposed-tool-call";
import type { ProposedToolCall } from "../../server/agent-studio/services/mcp/proposed-tool-call";

function baseCall(overrides: Partial<ProposedToolCall> = {}): ProposedToolCall {
  return {
    mcpServerId: "srv1",
    toolName: "search_docs",
    arguments: { query: "x" },
    rationale: "user asked",
    evidenceChunkIds: [],
    riskLevel: "low",
    requiresApproval: false,
    ...overrides,
  };
}

describe("M6-c6 — nested-object key ordering invariance", () => {
  // The pre-cycle-6 test covered top-level argument key ordering.
  // canonicalProposedToolCall delegates to sortKeys which is
  // recursive — but this contract was untested.
  it("nested arguments object: deeply-different key order → same canonical", () => {
    const a = baseCall({
      arguments: {
        outer: { inner1: 1, inner2: 2, inner3: 3 },
        other: "z",
      },
    });
    const b = baseCall({
      arguments: {
        other: "z",
        outer: { inner3: 3, inner1: 1, inner2: 2 },
      },
    });
    expect(canonicalProposedToolCall(a)).toBe(canonicalProposedToolCall(b));
    expect(hashProposedToolCall(a)).toBe(hashProposedToolCall(b));
  });

  it("triple-nested key reordering → same hash", () => {
    const a = baseCall({
      arguments: {
        l1: { l2: { l3: { x: 1, y: 2 } } },
      },
    });
    const b = baseCall({
      arguments: {
        l1: { l2: { l3: { y: 2, x: 1 } } },
      },
    });
    expect(hashProposedToolCall(a)).toBe(hashProposedToolCall(b));
  });
});

describe("M6-c6 — list semantics: order matters on every list field", () => {
  // The four list-typed fields (cagBlockIds, knowledgeUnitIds,
  // toolKnowledgeIds, evidenceChunkIds) are semantically ORDERED
  // — `[a, b]` and `[b, a]` are different proposals, not the same
  // proposal with reordered evidence. A future PR that "stabilized"
  // the canonical by sorting these would silently collapse two
  // distinct calls onto the same hash.
  it("evidenceChunkIds: [a,b] ≠ [b,a]", () => {
    const a = baseCall({ evidenceChunkIds: [1, 2] });
    const b = baseCall({ evidenceChunkIds: [2, 1] });
    expect(hashProposedToolCall(a)).not.toBe(hashProposedToolCall(b));
  });

  it("cagBlockIds: [a,b] ≠ [b,a]", () => {
    const a = baseCall({ cagBlockIds: [10, 20] });
    const b = baseCall({ cagBlockIds: [20, 10] });
    expect(hashProposedToolCall(a)).not.toBe(hashProposedToolCall(b));
  });

  it("knowledgeUnitIds: [a,b] ≠ [b,a]", () => {
    const a = baseCall({ knowledgeUnitIds: [100, 200] });
    const b = baseCall({ knowledgeUnitIds: [200, 100] });
    expect(hashProposedToolCall(a)).not.toBe(hashProposedToolCall(b));
  });

  it("toolKnowledgeIds: [a,b] ≠ [b,a]", () => {
    const a = baseCall({ toolKnowledgeIds: [1000, 2000] });
    const b = baseCall({ toolKnowledgeIds: [2000, 1000] });
    expect(hashProposedToolCall(a)).not.toBe(hashProposedToolCall(b));
  });

  it("array values inside arguments preserve order", () => {
    // Argument values that happen to be arrays must NOT be sorted
    // (the user's `[a, b, c]` vs `[c, b, a]` are different inputs
    // to the tool — sorting would corrupt semantics).
    const a = baseCall({ arguments: { items: ["alpha", "beta"] } });
    const b = baseCall({ arguments: { items: ["beta", "alpha"] } });
    expect(hashProposedToolCall(a)).not.toBe(hashProposedToolCall(b));
  });
});

describe("M6-c6 — optional-field defaulting consistency", () => {
  // canonicalProposedToolCall normalizes undefined → null/[] for the
  // optional fields. This means:
  //   - `{toolVersion: undefined}` and `{toolVersion: null}` and the
  //     field-omitted case must all produce the SAME hash
  //   - Same for the four optional list fields (cagBlockIds,
  //     knowledgeUnitIds, toolKnowledgeIds default to []).
  //
  // Without this, a refactor that exposed the "undefined" case to
  // a caller (e.g. a JSON deserializer that drops undefined fields)
  // would compute a different hash than the explicit-null caller,
  // causing duplicate approval rows.
  it("toolVersion: undefined === null === omitted", () => {
    const a = hashProposedToolCall(baseCall({ toolVersion: undefined }));
    const b = hashProposedToolCall(baseCall({ toolVersion: null }));
    const c = hashProposedToolCall(baseCall());
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("schemaHash: undefined === null === omitted", () => {
    const a = hashProposedToolCall(baseCall({ schemaHash: undefined }));
    const b = hashProposedToolCall(baseCall({ schemaHash: null }));
    const c = hashProposedToolCall(baseCall());
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("cagBlockIds: undefined === [] === omitted", () => {
    const a = hashProposedToolCall(baseCall({ cagBlockIds: undefined }));
    const b = hashProposedToolCall(baseCall({ cagBlockIds: [] }));
    const c = hashProposedToolCall(baseCall());
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("knowledgeUnitIds: undefined === [] === omitted", () => {
    const a = hashProposedToolCall(baseCall({ knowledgeUnitIds: undefined }));
    const b = hashProposedToolCall(baseCall({ knowledgeUnitIds: [] }));
    const c = hashProposedToolCall(baseCall());
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("toolKnowledgeIds: undefined === [] === omitted", () => {
    const a = hashProposedToolCall(baseCall({ toolKnowledgeIds: undefined }));
    const b = hashProposedToolCall(baseCall({ toolKnowledgeIds: [] }));
    const c = hashProposedToolCall(baseCall());
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});

describe("M6-c6 — every contract field affects the hash (no silent drops)", () => {
  // A future PR that drops a field from canonical's `ordered`
  // object silently breaks the idempotency contract for callers
  // that vary by that field. Pin each top-level field.
  it("mcpServerId change → different hash", () => {
    expect(hashProposedToolCall(baseCall({ mcpServerId: "srv1" }))).not.toBe(
      hashProposedToolCall(baseCall({ mcpServerId: "srv2" })),
    );
  });
  it("toolName change → different hash", () => {
    expect(hashProposedToolCall(baseCall({ toolName: "a" }))).not.toBe(
      hashProposedToolCall(baseCall({ toolName: "b" })),
    );
  });
  it("arguments change → different hash", () => {
    expect(hashProposedToolCall(baseCall({ arguments: { x: 1 } }))).not.toBe(
      hashProposedToolCall(baseCall({ arguments: { x: 2 } })),
    );
  });
  it("riskLevel change → different hash", () => {
    expect(hashProposedToolCall(baseCall({ riskLevel: "low" }))).not.toBe(
      hashProposedToolCall(baseCall({ riskLevel: "high" })),
    );
  });
  it("requiresApproval change → different hash", () => {
    expect(
      hashProposedToolCall(baseCall({ requiresApproval: false })),
    ).not.toBe(hashProposedToolCall(baseCall({ requiresApproval: true })));
  });
  it("toolVersion change → different hash", () => {
    expect(hashProposedToolCall(baseCall({ toolVersion: "1.0" }))).not.toBe(
      hashProposedToolCall(baseCall({ toolVersion: "2.0" })),
    );
  });
  it("schemaHash change → different hash", () => {
    expect(hashProposedToolCall(baseCall({ schemaHash: "a".repeat(64) }))).not.toBe(
      hashProposedToolCall(baseCall({ schemaHash: "b".repeat(64) })),
    );
  });
});

describe("M6-c6 — canonical output is deterministic JSON.stringify (no spread / Date / Map)", () => {
  // The canonical form is fed directly into createHash().update().
  // Stringifying via JSON.stringify on the `ordered` object means:
  //   - No Date instances (would serialize as ISO string but with
  //     timezone gotchas across runtime envs).
  //   - No Map/Set (would serialize as `{}` — silently empty).
  //   - No symbols or BigInt.
  // The current implementation only puts primitives, plain
  // objects, and arrays into `ordered`, but a future PR that adds
  // a Date or Map field could break determinism in environment-
  // dependent ways.
  it("canonical output is parseable JSON", () => {
    const out = canonicalProposedToolCall(baseCall());
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it("canonical output round-trips JSON.parse → JSON.stringify (no environment-dependent bits)", () => {
    const out = canonicalProposedToolCall(baseCall({
      arguments: { unicode: "héllo 🌍 世界", nested: { a: 1 } },
      evidenceChunkIds: [1, 2, 3],
    }));
    const parsed = JSON.parse(out);
    const restringified = JSON.stringify(parsed);
    // Note: this isn't a perfect round-trip check because the
    // recanonical step would re-sort keys; but for a single
    // canonicalize call output, parse + stringify must produce
    // the same byte sequence (no environment-specific encoding).
    expect(JSON.parse(restringified)).toEqual(parsed);
  });
});
