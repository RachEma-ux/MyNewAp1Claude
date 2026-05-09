/**
 * H2-c7 (cycle-7 audit `/sdcard/Download/POST_DISPATCH_AUDIT_2026-05-09.md`
 * §H2-c7) — dispatcher integration with output-schema validator.
 *
 * Pre-cycle-7 the dispatcher invoked `conn.callTool()` (or sandbox)
 * and returned `result` to trace + model loop with NO validation
 * against the tool's advertised output schema. Phase 8 validated
 * INPUT arguments but RESPONSE structure was unchecked. A
 * misbehaving MCP server returning drifted data would propagate
 * to the trace + LLM uncaught.
 *
 * Post-cycle-7 the dispatcher calls `validateMcpToolResponse` at
 * post-invoke (after both branches return result, before
 * truncateResultPreview + audit-row write). Mismatches surface as
 * `DispatchErrorCode.schema_mismatch_on_output` so audit + trace +
 * operator UI can distinguish "server returned an error" from
 * "server returned the wrong shape" — operationally distinct
 * (server-version skew vs tool semantics).
 *
 * Behavioral coverage of the validator's correctness lives in
 * `tests/agent-studio/result-validator.test.ts`. This file pins the
 * dispatcher integration via source-scan:
 *
 *   1. McpTool type adds outputSchema?: Record<string, unknown>
 *   2. DispatchErrorCode union includes schema_mismatch_on_output
 *   3. Dispatcher imports validateMcpToolResponse
 *   4. Dispatcher calls the validator on the success path (after
 *      invokeError check)
 *   5. Validator failure surfaces as schema_mismatch_on_output
 *      via fail()
 *   6. Validator runs BEFORE the audit-row write so the failure
 *      lands in the audit trail
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const DISPATCHER_PATH = join(
  process.cwd(),
  "server/agent-studio/services/mcp/dispatcher.ts",
);
const TYPES_PATH = join(
  process.cwd(),
  "server/agent-studio/services/mcp/dispatcher-types.ts",
);
const MCP_TYPES_PATH = join(
  process.cwd(),
  "server/agent-studio/services/mcp/types.ts",
);

describe("H2-c7 — McpTool type carries outputSchema", () => {
  const src = readFileSync(MCP_TYPES_PATH, "utf8");

  it("McpTool interface adds outputSchema?: Record<string, unknown>", () => {
    expect(
      src,
      "H2-c7 violated: McpTool must declare outputSchema (optional) " +
        "so transports can forward the field from MCP servers' " +
        "tools/list response and the dispatcher's validator can " +
        "read it.",
    ).toMatch(/outputSchema\?:\s*Record<string,\s*unknown>/);
  });

  it("doc-block on outputSchema names the H2-c7 closure + no-op-when-absent semantic", () => {
    expect(
      src,
      "H2-c7 violated: outputSchema doc-block must explain that the " +
        "validator no-ops when the field is absent (most MCP tools " +
        "today don't advertise an outputSchema).",
    ).toMatch(/H2-c7[\s\S]{0,800}no-?ops?/i);
  });
});

describe("H2-c7 — DispatchErrorCode union", () => {
  const src = readFileSync(TYPES_PATH, "utf8");

  it("includes schema_mismatch_on_output variant", () => {
    expect(
      src,
      "H2-c7 violated: DispatchErrorCode must include " +
        "`schema_mismatch_on_output` so audit + trace + operator UI " +
        "can distinguish schema drift from server-returned errors.",
    ).toMatch(/"schema_mismatch_on_output"/);
  });

  it("doc-block on the new variant explains the operational distinction", () => {
    expect(
      src,
      "H2-c7 violated: the variant doc-block must explain the " +
        "distinction (server returned an error vs server returned " +
        "wrong shape — server-version skew vs tool semantics).",
    ).toMatch(/H2-c7[\s\S]{0,400}schema/i);
  });
});

describe("H2-c7 — dispatcher integration", () => {
  const src = readFileSync(DISPATCHER_PATH, "utf8");

  it("source carries the H2-c7 closure marker", () => {
    expect(src).toMatch(/H2-c7\b/);
  });

  it("imports validateMcpToolResponse from ./result-validator", () => {
    expect(
      src,
      "H2-c7 violated: dispatcher.ts must import " +
        "`validateMcpToolResponse` from `./result-validator`. " +
        "Importing from elsewhere or inlining the validation " +
        "defeats the single-source-of-truth contract.",
    ).toMatch(
      /import\s*\{[\s\S]{0,80}validateMcpToolResponse[\s\S]{0,80}\}\s*from\s*["']\.\/result-validator["']/,
    );
  });

  it("calls validateMcpToolResponse at post-invoke (after invokeError check)", () => {
    // The validator MUST run on the success path — the call site
    // should appear AFTER the `if (invokeError)` block (so we know
    // we have a valid `result`) but BEFORE the truncateResultPreview
    // / audit-row write.
    expect(
      src,
      "H2-c7 violated: dispatcher must call validateMcpToolResponse " +
        "at post-invoke. Without the call, malformed responses " +
        "still propagate uncaught.",
    ).toMatch(/validateMcpToolResponse\s*\(\s*tool\s*,\s*result\s*\)/);
  });

  it("validator failure surfaces as schema_mismatch_on_output via fail()", () => {
    // Catches a future PR that "simplified" by routing the failure
    // through the wrong code or by silently dropping the validator
    // result.
    expect(
      src,
      "H2-c7 violated: a validator failure must surface as " +
        "fail(\"schema_mismatch_on_output\", ...) — using a different " +
        "code (or dropping the failure) collapses the H2-c7 distinction.",
    ).toMatch(/responseFailure[\s\S]{0,200}fail\s*\(\s*"schema_mismatch_on_output"/);
  });

  it("validator runs BEFORE truncateResultPreview / audit-row write", () => {
    // Ordering invariant — the audit row should record the
    // validation failure (via the fail() helper), not the
    // ok-but-wrong-shape success row. Source-scan that the
    // validator block appears earlier than the truncateResultPreview
    // line (lexically AND in execution order).
    const validatorIdx = src.indexOf("validateMcpToolResponse(tool, result)");
    // L4-c7 changed truncateResultPreview to return {preview, truncated}.
    // The success path now binds the result first then assigns into the
    // payload; match the call site rather than the (now-split) assignment.
    const previewIdx = src.indexOf("truncateResultPreview(result)");
    expect(
      validatorIdx,
      "expected to find validateMcpToolResponse call",
    ).toBeGreaterThan(0);
    expect(
      previewIdx,
      "expected to find truncateResultPreview assignment",
    ).toBeGreaterThan(0);
    expect(
      validatorIdx,
      "H2-c7 violated: validateMcpToolResponse must be called " +
        "BEFORE truncateResultPreview so a schema-mismatch fails " +
        "the dispatch via fail() (which writes a deny audit row) " +
        "rather than slipping through to the success-path audit-row " +
        "write.",
    ).toBeLessThan(previewIdx);
  });

  it("validator failure carries the structured response-validation code in details", () => {
    // The fail() call passes { code: responseFailure.code } in details
    // so the audit row + trace can carry the structured failure
    // type (missing_field / invented_field / type_mismatch /
    // wrong_root_type) for forensics.
    expect(
      src,
      "H2-c7 violated: the schema_mismatch_on_output fail() call " +
        "must thread responseFailure.code into details so audit + " +
        "trace can filter by the specific validation failure type.",
    ).toMatch(/code:\s*responseFailure\.code/);
  });
});
