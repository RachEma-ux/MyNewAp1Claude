/**
 * H2-c7 (cycle-7 audit closure §H2-c7) — MCP tool response output-schema
 * validator.
 *
 * Pre-cycle-7 the dispatcher invoked `conn.callTool()` (or the sandbox)
 * and returned `result` to the trace + model loop with NO validation
 * against the tool's advertised output schema. Phase 8 validates
 * INPUT arguments (Gate 2: missing_parameter / invented_parameter)
 * but RESPONSE structure was unchecked. A misbehaving MCP server
 * returning an object that drifted from its advertised schema would:
 *   1. Land in the trace ledger uncaught (trace-row stores raw)
 *   2. Feed to the LLM as the tool result (model reasons on garbage)
 *   3. Persist to `agsChatMessages` as the durable record
 *
 * Post-cycle-7 the dispatcher calls `validateMcpToolResponse` after
 * the invoke succeeds. When the tool has no `outputSchema`, the
 * validator no-ops (most MCP tools don't advertise one). When the
 * tool does have `outputSchema`, the validator checks the same
 * JSON-Schema slice the input validator covers (`type: object`
 * with `properties` + `required` + optional `additionalProperties`).
 *
 * Mismatches surface as `DispatchErrorCode.schema_mismatch_on_output`
 * (distinct from `tool_execution_failed`) so audit + trace + operator
 * UI can distinguish "server returned an error" from "server returned
 * the wrong shape." Operationally distinct: schema drift indicates
 * server-version skew (operator action: pin or upgrade), not a
 * tool-input problem the user can fix.
 *
 * Design choice: mirror `validateArgumentsAgainstSchema` shape
 * (proposed-tool-call.ts:232-274) — same JSON-Schema slice, same
 * conservative validation. Keeps the input-side and output-side
 * validators consistent in coverage so a future PR that extends
 * one can extend both.
 *
 * Conservative-by-default: extra fields not declared in `properties`
 * are accepted UNLESS the schema sets `additionalProperties: false`.
 * This is the input-side default and mirrors MCP spec leniency —
 * servers may add new fields without breaking older clients.
 */
import type { McpTool } from "./types";

export type ResponseValidationCode =
  | "missing_field"
  | "invented_field"
  | "type_mismatch"
  | "wrong_root_type";

export interface ResponseValidationFailure {
  code: ResponseValidationCode;
  message: string;
}

/**
 * Validate an MCP tool's response against its advertised output schema.
 *
 * Returns null on success (no schema = no-op, schema match = no failure).
 * Returns a structured failure when the response doesn't match.
 *
 * The dispatcher is responsible for surfacing failures as
 * `DispatchErrorCode.schema_mismatch_on_output`. This function does
 * not throw — failure is a value the caller branches on.
 */
export function validateMcpToolResponse(
  tool: McpTool,
  result: unknown,
): ResponseValidationFailure | null {
  const schema = tool.outputSchema;
  if (!schema || typeof schema !== "object") return null;

  const expectedRootType = (schema as { type?: string }).type;
  const actualRootType = jsType(result);

  // Root-level type check (e.g., schema says `type: object` but server
  // returned a string).
  if (expectedRootType && actualRootType !== expectedRootType) {
    if (
      !(expectedRootType === "integer" && actualRootType === "number")
    ) {
      return {
        code: "wrong_root_type",
        message: `response root has type ${actualRootType}, expected ${expectedRootType}`,
      };
    }
  }

  // Only descend into properties when the root is an object — the
  // JSON-Schema slice MCP tools use is dominated by `type: object`
  // shapes; primitive roots are validated at the root-type check
  // above. Future PRs that need array-of-object validation can
  // extend here.
  if (expectedRootType !== "object" && expectedRootType !== undefined) {
    return null;
  }
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    // Schema didn't specify `type: object` AND result isn't one —
    // nothing more to check.
    return null;
  }

  const obj = result as Record<string, unknown>;
  const props = (schema.properties ?? {}) as Record<string, { type?: string }>;
  const required = (schema.required ?? []) as string[];
  const additionalProperties =
    (schema as { additionalProperties?: boolean }).additionalProperties;

  for (const key of required) {
    if (!(key in obj)) {
      return {
        code: "missing_field",
        message: `required response field "${key}" is missing`,
      };
    }
  }

  for (const key of Object.keys(obj)) {
    if (!(key in props)) {
      // Conservative-by-default: accept extras unless schema explicitly
      // says `additionalProperties: false`. Mirrors MCP spec leniency.
      if (additionalProperties === false) {
        return {
          code: "invented_field",
          message: `response field "${key}" not declared in tool output schema`,
        };
      }
    } else {
      const expected = props[key]?.type;
      if (expected) {
        const actual = jsType(obj[key]);
        if (
          actual !== expected &&
          !(expected === "integer" && actual === "number")
        ) {
          return {
            code: "type_mismatch",
            message: `response field "${key}" has type ${actual}, expected ${expected}`,
          };
        }
      }
    }
  }

  return null;
}

function jsType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
