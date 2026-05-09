/**
 * H1-c7 (cycle-7 audit `/sdcard/Download/POST_DISPATCH_AUDIT_2026-05-09.md`
 * §H1-c7) — dispatcher tool-call timeout lockstep.
 *
 * Pre-cycle-7 the dispatcher had no per-call timeout: a slow or
 * hung MCP server could block the model loop indefinitely. Sandbox
 * tools have `DEFAULT_SANDBOX_POLICY.timeoutMs` (1s) and SSE
 * transport has `POST_TIMEOUT_MS=5s` buried at the transport
 * layer, but neither was exposed to the dispatcher and neither
 * covered the non-sandbox / non-SSE paths.
 *
 * Post-cycle-7 the dispatcher races `conn.callTool()` against
 * MCP_TOOL_CALL_TIMEOUT_MS (default 30s, env-overridable). On
 * timeout the sentinel-tagged error surfaces as
 * `DispatchErrorCode.tool_call_timeout` (distinct from
 * `tool_execution_failed`) so audit + trace + operator UI can tell
 * "server didn't respond within ceiling" from "server returned an
 * error" — operationally distinct (retryable vs not, indicates
 * server health vs tool semantics).
 *
 * This file pins via source-scan:
 *   1. Constant `MCP_TOOL_CALL_TIMEOUT_MS` defined with operator
 *      env override
 *   2. `DispatchErrorCode` includes `tool_call_timeout`
 *   3. The non-sandbox `conn.callTool` is wrapped via `withTimeout`
 *      (catches a future PR that drops the wrap)
 *   4. Failure-mapping path checks `invokeError.timedOut` and maps
 *      to `tool_call_timeout` (catches a future PR that "simplifies"
 *      by dropping the discrimination)
 *   5. Sentinel-based detection (not message-string matching, which
 *      is fragile)
 *   6. Doc-block carries the H1-c7 marker + rationale
 *
 * Behavioral coverage (timeout actually fires, audit row records
 * tool_call_timeout) is deferred to a B-coverage integration test
 * because it requires either a fake transport or a live MCP server
 * that sleeps.
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

describe("H1-c7 — DispatchErrorCode includes tool_call_timeout", () => {
  const types = readFileSync(TYPES_PATH, "utf8");

  it("dispatcher-types.ts adds tool_call_timeout to the union", () => {
    expect(
      types,
      "H1-c7 violated: DispatchErrorCode union must include " +
        "`tool_call_timeout` so audit + trace + operator UI can " +
        "distinguish timeout from generic execution failure.",
    ).toMatch(/"tool_call_timeout"/);
  });
});

describe("H1-c7 — dispatcher.ts defines + applies MCP_TOOL_CALL_TIMEOUT_MS", () => {
  const src = readFileSync(DISPATCHER_PATH, "utf8");

  it("source carries the H1-c7 closure marker", () => {
    expect(
      src,
      "H1-c7 violated: dispatcher.ts must carry the `H1-c7` closure " +
        "marker so a future audit can trace the timeout logic back " +
        "to its origin item.",
    ).toMatch(/H1-c7\b/);
  });

  it("defines MCP_TOOL_CALL_TIMEOUT_MS constant with operator env override", () => {
    // Catches a future PR that hardcodes a magic-number timeout
    // without an operator-tunable surface.
    expect(
      src,
      "H1-c7 violated: MCP_TOOL_CALL_TIMEOUT_MS must be defined as " +
        "a named constant with operator env override so deployments " +
        "with known-slow MCP tools can extend the ceiling.",
    ).toMatch(/MCP_TOOL_CALL_TIMEOUT_MS[\s\S]{0,400}process\.env\.MCP_TOOL_CALL_TIMEOUT_MS/);
  });

  it("env override warns on out-of-range / non-numeric values", () => {
    // Mirrors the L5-c6 timeout-bounds-warning pattern. An operator
    // setting MCP_TOOL_CALL_TIMEOUT_MS=foo should see a console
    // breadcrumb in logs, not silently get the default.
    expect(
      src,
      "H1-c7 violated: out-of-range MCP_TOOL_CALL_TIMEOUT_MS values " +
        "must produce a console.warn so operators don't silently get " +
        "the default. Mirrors L5-c6 timeout-bounds pattern.",
    ).toMatch(/MCP_TOOL_CALL_TIMEOUT_MS[\s\S]{0,400}console\.warn/);
  });

  it("defines withTimeout helper using Promise.race + clearTimeout", () => {
    // The wrap MUST clearTimeout on success to avoid leaking timers.
    // A future PR using setTimeout without clearTimeout would leak
    // timers under high-volume tool calls.
    expect(
      src,
      "H1-c7 violated: withTimeout helper must use Promise.race + " +
        "clearTimeout to avoid leaking timers under high-volume " +
        "tool calls.",
    ).toMatch(/withTimeout[\s\S]{0,400}Promise\.race[\s\S]{0,400}clearTimeout/);
  });

  it("conn.callTool is wrapped in withTimeout (not called directly)", () => {
    // The load-bearing assertion. A future PR that "simplifies" by
    // calling conn.callTool directly removes the timeout protection.
    expect(
      src,
      "H1-c7 violated: conn.callTool MUST be wrapped in withTimeout. " +
        "Direct calls without the wrapper restore the unbounded-wait " +
        "vulnerability.",
    ).toMatch(/withTimeout\s*\(\s*[\s\S]{0,200}conn\.callTool/);
  });
});

describe("H1-c7 — sentinel-based timeout detection (not string matching)", () => {
  const src = readFileSync(DISPATCHER_PATH, "utf8");

  it("uses a Symbol sentinel for timeout detection", () => {
    // String-matching on error.message is fragile (locale-dependent,
    // breaks on minor message changes). A Symbol sentinel is
    // tamper-resistant.
    expect(
      src,
      "H1-c7 violated: timeout detection must use a Symbol sentinel " +
        "marker (TIMEOUT_SENTINEL), not string-matching on error " +
        "message — which is fragile and breaks on locale or message " +
        "changes.",
    ).toMatch(/TIMEOUT_SENTINEL\s*=\s*Symbol/);
  });

  it("isTimeoutError type guard checks the sentinel marker", () => {
    expect(
      src,
      "H1-c7 violated: isTimeoutError must check the Symbol sentinel " +
        "to distinguish timeouts from other Error instances.",
    ).toMatch(/isTimeoutError[\s\S]{0,300}TIMEOUT_SENTINEL/);
  });

  it("invokeError carries the timedOut flag (set from isTimeoutError)", () => {
    // The flag is what the failure-mapping path branches on. Without
    // it the timeout would be lost in the generic invoke-error path.
    expect(
      src,
      "H1-c7 violated: invokeError must carry a `timedOut` flag " +
        "(set from isTimeoutError(e)) so the failure-mapping path " +
        "can distinguish timeout from other invoke failures.",
    ).toMatch(/invokeError\s*=\s*\{[\s\S]{0,400}timedOut:\s*isTimeoutError/);
  });
});

describe("H1-c7 — failure-mapping path discriminates timeout from execution failure", () => {
  const src = readFileSync(DISPATCHER_PATH, "utf8");

  it("maps invokeError.timedOut to tool_call_timeout", () => {
    // The discrimination is the load-bearing semantic. A future PR
    // that "simplified" by dropping the ternary would collapse
    // timeout into tool_execution_failed, losing the audit signal.
    expect(
      src,
      "H1-c7 violated: the invoke-failure branch must check " +
        "invokeError.timedOut and map to tool_call_timeout, NOT " +
        "collapse all invoke failures into tool_execution_failed.",
    ).toMatch(/invokeError\.timedOut[\s\S]{0,200}tool_call_timeout/);
  });

  it("tool_execution_failed is still the fall-through code for non-timeout failures", () => {
    // The change must NOT break the existing tool_execution_failed
    // path. Catches a future PR that accidentally replaces all
    // tool_execution_failed with tool_call_timeout.
    expect(
      src,
      "H1-c7 violated: the invoke-failure branch must still fall " +
        "through to tool_execution_failed for non-timeout failures.",
    ).toMatch(/tool_execution_failed/);
  });
});
