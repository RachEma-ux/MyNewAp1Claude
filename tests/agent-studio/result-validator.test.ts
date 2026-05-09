/**
 * H2-c7 (cycle-7 audit `/sdcard/Download/POST_DISPATCH_AUDIT_2026-05-09.md`
 * §H2-c7) — `validateMcpToolResponse` unit tests.
 *
 * The validator is a pure function. The dispatcher calls it at
 * post-invoke; mismatches surface as
 * `DispatchErrorCode.schema_mismatch_on_output`. This file pins
 * the validator's behavioral contract:
 *
 *   1. No-op when the tool doesn't advertise an outputSchema (most
 *      MCP tools don't yet — adding the validator must NOT break
 *      existing behavior for those tools)
 *   2. Wrong root-type detected (e.g., schema says object, server
 *      returned a string)
 *   3. Required fields enforced
 *   4. Extra fields accepted by default (MCP spec leniency)
 *   5. Extra fields REJECTED when schema sets additionalProperties=false
 *   6. Field-type mismatches detected
 *   7. integer-vs-number coercion (matches input-side leniency)
 *   8. Idempotent on null / undefined inputs
 *   9. Coverage matches the input-side validator's slice
 *      (validateArgumentsAgainstSchema in proposed-tool-call.ts)
 */
import { describe, it, expect } from "vitest";
import { validateMcpToolResponse } from "../../server/agent-studio/services/mcp/result-validator";
import type { McpTool } from "../../server/agent-studio/services/mcp/types";

function tool(over: Partial<McpTool> = {}): McpTool {
  return { name: "test_tool", ...over };
}

describe("validateMcpToolResponse — no-op cases", () => {
  it("returns null when tool has no outputSchema (most MCP tools today)", () => {
    expect(validateMcpToolResponse(tool(), { anything: "goes" })).toBeNull();
  });

  it("returns null when outputSchema is null/undefined explicitly", () => {
    expect(
      validateMcpToolResponse(tool({ outputSchema: undefined }), {
        x: 1,
      }),
    ).toBeNull();
  });

  it("returns null when outputSchema is empty object (vacuous schema)", () => {
    expect(
      validateMcpToolResponse(tool({ outputSchema: {} }), { x: 1 }),
    ).toBeNull();
  });
});

describe("validateMcpToolResponse — root-type mismatch", () => {
  it("detects wrong root type (schema=object, returned=string)", () => {
    const r = validateMcpToolResponse(
      tool({ outputSchema: { type: "object" } }),
      "hello",
    );
    expect(r).not.toBeNull();
    expect(r!.code).toBe("wrong_root_type");
    expect(r!.message).toContain("string");
    expect(r!.message).toContain("object");
  });

  it("detects wrong root type (schema=string, returned=object)", () => {
    const r = validateMcpToolResponse(
      tool({ outputSchema: { type: "string" } }),
      { x: 1 },
    );
    expect(r).not.toBeNull();
    expect(r!.code).toBe("wrong_root_type");
  });

  it("accepts integer when schema expects number (input-side leniency)", () => {
    expect(
      validateMcpToolResponse(
        tool({ outputSchema: { type: "number" } }),
        42,
      ),
    ).toBeNull();
  });

  it("accepts number when schema expects integer (input-side leniency)", () => {
    // Mirrors proposed-tool-call.ts:262-263 — `expected === "integer" && actual === "number"`
    expect(
      validateMcpToolResponse(
        tool({ outputSchema: { type: "integer" } }),
        42,
      ),
    ).toBeNull();
  });

  it("does not check root type when schema doesn't specify one", () => {
    expect(
      validateMcpToolResponse(
        tool({ outputSchema: { properties: { x: { type: "string" } } } }),
        { x: "hi" },
      ),
    ).toBeNull();
  });
});

describe("validateMcpToolResponse — required field enforcement", () => {
  const SCHEMA = {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
    },
    required: ["id", "name"],
  };

  it("returns null when all required fields present", () => {
    expect(
      validateMcpToolResponse(tool({ outputSchema: SCHEMA }), {
        id: "abc",
        name: "x",
      }),
    ).toBeNull();
  });

  it("flags missing required field", () => {
    const r = validateMcpToolResponse(tool({ outputSchema: SCHEMA }), {
      id: "abc",
    });
    expect(r).not.toBeNull();
    expect(r!.code).toBe("missing_field");
    expect(r!.message).toContain('"name"');
  });

  it("flags first missing required field (left-to-right order)", () => {
    const r = validateMcpToolResponse(tool({ outputSchema: SCHEMA }), {});
    expect(r).not.toBeNull();
    expect(r!.code).toBe("missing_field");
    expect(r!.message).toContain('"id"');
  });
});

describe("validateMcpToolResponse — extra-field handling (additionalProperties)", () => {
  it("accepts extra fields by default (MCP spec leniency)", () => {
    // The conservative-by-default behavior. Without this, every MCP
    // server adding a new optional field would break existing
    // clients — unacceptable per MCP spec semantics.
    expect(
      validateMcpToolResponse(
        tool({
          outputSchema: {
            type: "object",
            properties: { a: { type: "string" } },
          },
        }),
        { a: "x", undeclared: "extra" },
      ),
    ).toBeNull();
  });

  it("rejects extra fields when additionalProperties=false", () => {
    const r = validateMcpToolResponse(
      tool({
        outputSchema: {
          type: "object",
          properties: { a: { type: "string" } },
          additionalProperties: false,
        },
      }),
      { a: "x", undeclared: "extra" },
    );
    expect(r).not.toBeNull();
    expect(r!.code).toBe("invented_field");
    expect(r!.message).toContain('"undeclared"');
  });
});

describe("validateMcpToolResponse — field-type mismatches", () => {
  const SCHEMA = {
    type: "object",
    properties: {
      count: { type: "number" },
      name: { type: "string" },
    },
  };

  it("returns null when field types match", () => {
    expect(
      validateMcpToolResponse(tool({ outputSchema: SCHEMA }), {
        count: 5,
        name: "x",
      }),
    ).toBeNull();
  });

  it("flags type mismatch (string in number field)", () => {
    const r = validateMcpToolResponse(tool({ outputSchema: SCHEMA }), {
      count: "five",
      name: "x",
    });
    expect(r).not.toBeNull();
    expect(r!.code).toBe("type_mismatch");
    expect(r!.message).toContain('"count"');
  });

  it("flags type mismatch (object in string field)", () => {
    const r = validateMcpToolResponse(tool({ outputSchema: SCHEMA }), {
      count: 5,
      name: { nested: true },
    });
    expect(r).not.toBeNull();
    expect(r!.code).toBe("type_mismatch");
  });

  it("doesn't validate fields without declared type", () => {
    // properties: { x: {} } means "x can be anything" — no type check.
    expect(
      validateMcpToolResponse(
        tool({
          outputSchema: {
            type: "object",
            properties: { x: {} },
          },
        }),
        { x: "anything" },
      ),
    ).toBeNull();
  });

  it("integer field accepts number (consistent with input-side)", () => {
    expect(
      validateMcpToolResponse(
        tool({
          outputSchema: {
            type: "object",
            properties: { n: { type: "integer" } },
          },
        }),
        { n: 42 },
      ),
    ).toBeNull();
  });
});

describe("validateMcpToolResponse — null/edge inputs", () => {
  it("treats null result as not-an-object (no descent)", () => {
    // Schema didn't say type:object so null is fine
    expect(
      validateMcpToolResponse(
        tool({ outputSchema: { properties: { x: { type: "string" } } } }),
        null,
      ),
    ).toBeNull();
  });

  it("treats array result as not-an-object (no property descent)", () => {
    // Same — schema didn't specify type:object so an array passes
    // through. A schema that DOES specify type:object will catch this
    // via the wrong_root_type check above.
    expect(
      validateMcpToolResponse(
        tool({ outputSchema: { properties: { x: { type: "string" } } } }),
        [1, 2, 3],
      ),
    ).toBeNull();
  });

  it("flags null when schema explicitly required type=object", () => {
    const r = validateMcpToolResponse(
      tool({ outputSchema: { type: "object" } }),
      null,
    );
    expect(r).not.toBeNull();
    expect(r!.code).toBe("wrong_root_type");
  });

  it("flags array when schema explicitly required type=object", () => {
    const r = validateMcpToolResponse(
      tool({ outputSchema: { type: "object" } }),
      [1, 2, 3],
    );
    expect(r).not.toBeNull();
    expect(r!.code).toBe("wrong_root_type");
    expect(r!.message).toContain("array");
  });
});

describe("validateMcpToolResponse — combined cases (real-world shapes)", () => {
  it("validates a typical search-result tool response", () => {
    const searchTool = tool({
      outputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          totalHits: { type: "integer" },
          // results array left untyped at field level (MCP slice)
          results: {},
        },
        required: ["query", "results"],
      },
    });
    expect(
      validateMcpToolResponse(searchTool, {
        query: "hello",
        totalHits: 42,
        results: [{ id: 1 }, { id: 2 }],
      }),
    ).toBeNull();
  });

  it("flags realistic schema drift (server added field client doesn't know about)", () => {
    // additionalProperties=false is rare in practice but operators
    // who set it are signaling "tight contract — drift is a bug".
    const strictTool = tool({
      outputSchema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
    });
    const r = validateMcpToolResponse(strictTool, {
      id: "abc",
      newServerSideField: 1,
    });
    expect(r).not.toBeNull();
    expect(r!.code).toBe("invented_field");
  });
});
