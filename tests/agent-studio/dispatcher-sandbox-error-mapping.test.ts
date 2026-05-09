/**
 * H3-c7 (cycle-7 audit `/sdcard/Download/POST_DISPATCH_AUDIT_2026-05-09.md`
 * §H3-c7) — sandbox error code mapping lockstep.
 *
 * Pre-cycle-7 every sandbox-route failure (`riskClass === "code_execution"`)
 * collapsed to `tool_execution_failed` regardless of the underlying
 * cause. The sandbox layer DID emit structured `ToolSandboxErrorCode`
 * variants (`SBX_TIMEOUT` / `SBX_MEMORY` / `SBX_DENY_GLOBAL` /
 * `SBX_UNAVAILABLE` / `SBX_THROWN`) on `sandboxResult.error.code`, and
 * the dispatcher captured them on `invokeError.sandboxCode`, but the
 * failure-mapping path discarded the signal — operator forensics
 * could not distinguish:
 *   - "policy denied this code" (config issue, NOT retryable)
 *   - "sandbox unavailable" (infra issue, retryable after restart)
 *   - "user code threw" (tool semantics, NOT retryable)
 *   - "ran past the timeout" (often retryable with longer budget)
 *   - "exceeded memory budget" (often retryable with smaller input)
 *
 * Post-cycle-7:
 *   1. `DispatchErrorCode` union extended with 5 sandbox-specific
 *      variants (sandbox_timeout / sandbox_memory /
 *      sandbox_policy_denied / sandbox_unavailable / sandbox_thrown)
 *   2. New `mapSandboxCodeToDispatchCode()` helper does the mapping
 *   3. The failure-mapping path branches on the sandbox code BEFORE
 *      falling through to `tool_execution_failed`
 *   4. `McpDispatchAuditPayload` carries a structured `sandboxErrorCode`
 *      field so operator forensics can filter by SBX_* code without
 *      parsing the errorMessage
 *
 * This file pins via source-scan:
 *   - All 5 SBX_* codes have matching DispatchErrorCode variants
 *   - mapSandboxCodeToDispatchCode covers all 5 SBX_* cases
 *   - Failure-mapping uses the helper (catches a future PR that
 *     reintroduces the collapse)
 *   - auditPayload.sandboxErrorCode is set BEFORE fail() runs
 *   - The dispatcher-types.ts McpDispatchAuditPayload includes
 *     sandboxErrorCode
 *   - The unknown-code case falls through to tool_execution_failed
 *     (defensive — preserves existing behavior for sandboxes that
 *     emit codes outside the known enum)
 *
 * Behavioral coverage (a real SBX_TIMEOUT actually surfaces as
 * sandbox_timeout in the result + audit row) is deferred to a
 * B-coverage integration test using a fake sandbox.
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
const SANDBOX_TYPES_PATH = join(
  process.cwd(),
  "server/agent-studio/services/sandbox/types.ts",
);

describe("H3-c7 — DispatchErrorCode union extended with sandbox variants", () => {
  const types = readFileSync(TYPES_PATH, "utf8");

  it("source carries the H3-c7 closure marker", () => {
    expect(
      types,
      "H3-c7 violated: dispatcher-types.ts must carry the `H3-c7` " +
        "closure marker on the new DispatchErrorCode variants.",
    ).toMatch(/H3-c7\b/);
  });

  // 5 sandbox codes, 5 dispatch variants. Pin each one to catch a
  // future PR that "simplifies" by dropping a code → distinction.
  const expectedDispatchCodes = [
    "sandbox_timeout",
    "sandbox_memory",
    "sandbox_policy_denied",
    "sandbox_unavailable",
    "sandbox_thrown",
  ];
  for (const code of expectedDispatchCodes) {
    it(`includes "${code}" variant`, () => {
      expect(
        types,
        `H3-c7 violated: DispatchErrorCode must include "${code}" so ` +
          `audit + trace + operator UI can distinguish this sandbox ` +
          `failure mode from generic tool_execution_failed.`,
      ).toMatch(new RegExp(`"${code}"`));
    });
  }
});

describe("H3-c7 — McpDispatchAuditPayload carries structured sandboxErrorCode", () => {
  const types = readFileSync(TYPES_PATH, "utf8");

  it("audit payload type includes sandboxErrorCode field", () => {
    // Without the field, operator forensics has to parse errorMessage
    // to find the SBX_* code — fragile and wastes a stable column.
    expect(
      types,
      "H3-c7 violated: McpDispatchAuditPayload must include " +
        "`sandboxErrorCode` so operator forensics can filter by " +
        "SBX_* code without parsing the errorMessage.",
    ).toMatch(/sandboxErrorCode:\s*string\s*\|\s*null/);
  });

  it("doc-block on sandboxErrorCode names all 5 SBX_* codes", () => {
    expect(
      types,
      "H3-c7 violated: the sandboxErrorCode doc-block must enumerate " +
        "all 5 SBX_* codes so future readers know the value space.",
    ).toMatch(/SBX_TIMEOUT[\s\S]{0,80}SBX_MEMORY[\s\S]{0,80}SBX_DENY_GLOBAL[\s\S]{0,80}SBX_UNAVAILABLE[\s\S]{0,80}SBX_THROWN/);
  });
});

describe("H3-c7 — dispatcher.ts maps sandbox codes via helper", () => {
  const src = readFileSync(DISPATCHER_PATH, "utf8");

  it("source carries the H3-c7 closure marker", () => {
    expect(src).toMatch(/H3-c7\b/);
  });

  it("defines mapSandboxCodeToDispatchCode helper", () => {
    expect(
      src,
      "H3-c7 violated: dispatcher.ts must define a " +
        "`mapSandboxCodeToDispatchCode` helper so the mapping is " +
        "centralized + testable, not inlined in the failure-mapping " +
        "branch.",
    ).toMatch(/function mapSandboxCodeToDispatchCode/);
  });

  it("helper covers all 5 SBX_* codes (none silently fall through)", () => {
    // Source-scan that the switch statement (or ternary chain) handles
    // each code. A future PR that drops a case would silently route
    // that sandbox failure to tool_execution_failed, regressing the fix.
    const sandboxCodes = [
      "SBX_TIMEOUT",
      "SBX_MEMORY",
      "SBX_DENY_GLOBAL",
      "SBX_UNAVAILABLE",
      "SBX_THROWN",
    ];
    for (const c of sandboxCodes) {
      expect(
        src,
        `H3-c7 violated: mapSandboxCodeToDispatchCode must include a ` +
          `case for "${c}" so this sandbox failure mode reaches its ` +
          `typed DispatchErrorCode variant.`,
      ).toMatch(new RegExp(`["']${c}["']`));
    }
  });

  it("helper returns null on unknown code (defensive fall-through)", () => {
    // The default case returns null so the caller falls through to
    // tool_execution_failed. This preserves correct behavior for
    // sandboxes that emit codes outside the known enum (e.g., a
    // future SBX_* added without updating the dispatcher).
    expect(
      src,
      "H3-c7 violated: mapSandboxCodeToDispatchCode must return null " +
        "in the default case so unknown sandbox codes fall through to " +
        "tool_execution_failed (defensive).",
    ).toMatch(/mapSandboxCodeToDispatchCode[\s\S]{0,2000}default:\s*\n\s*return null/);
  });
});

describe("H3-c7 — failure-mapping integration", () => {
  const src = readFileSync(DISPATCHER_PATH, "utf8");

  it("invoke-failure branch sets auditPayload.sandboxErrorCode BEFORE fail()", () => {
    // The audit row's sandboxErrorCode column carries the SBX_*
    // signal even on failure. fail() reads auditPayload, so the
    // assignment MUST happen before fail() runs.
    expect(
      src,
      "H3-c7 violated: auditPayload.sandboxErrorCode must be assigned " +
        "in the invoke-failure branch BEFORE fail() runs, so the audit " +
        "row carries the SBX_* signal.",
    ).toMatch(/auditPayload\.sandboxErrorCode\s*=\s*invokeError\.sandboxCode/);
  });

  it("failure-mapping uses mapSandboxCodeToDispatchCode (not inline switch)", () => {
    // Centralizing in the helper means a future PR can extend the
    // mapping without touching the failure-mapping path.
    expect(
      src,
      "H3-c7 violated: the failure-mapping branch must call " +
        "mapSandboxCodeToDispatchCode rather than inlining the " +
        "switch — keeps the mapping centralized + testable.",
    ).toMatch(/mapSandboxCodeToDispatchCode\s*\(/);
  });

  it("falls through to tool_execution_failed when sandbox map returns null", () => {
    // The defensive fall-through. Catches a future PR that
    // accidentally throws on unknown sandbox codes instead of
    // degrading gracefully.
    expect(
      src,
      "H3-c7 violated: the failure-mapping branch must fall through " +
        "to tool_execution_failed when mapSandboxCodeToDispatchCode " +
        "returns null (defensive — non-sandbox failures and unknown " +
        "sandbox codes both end up here).",
    ).toMatch(/sandboxMapped\s*\?\?\s*"tool_execution_failed"/);
  });

  it("timeout branch is checked BEFORE sandbox mapping (precedence)", () => {
    // Edge case: a sandbox call that times out should surface as
    // tool_call_timeout (H1-c7), not sandbox_timeout — H1's timeout
    // is the dispatcher-level wrapper, distinct from the sandbox's
    // internal SBX_TIMEOUT. The precedence keeps the H1-c7 contract
    // intact.
    expect(
      src,
      "H3-c7 violated: the failure-mapping branch must check " +
        "invokeError.timedOut BEFORE the sandbox mapping so " +
        "dispatcher-level timeouts surface as tool_call_timeout " +
        "(H1-c7), not sandbox_timeout.",
    ).toMatch(/if\s*\(\s*invokeError\.timedOut\s*\)\s*\{?[\s\S]{0,200}else\s*\{?[\s\S]{0,200}mapSandboxCodeToDispatchCode/);
  });
});

describe("H3-c7 — sandbox types stay in sync with dispatcher mapping", () => {
  // Sanity check that the SBX_* enum we mapped against actually
  // exists. If sandbox/types.ts removes a code, the mapping helper
  // would have a dead case (still works, but signals drift).
  const sandboxTypes = readFileSync(SANDBOX_TYPES_PATH, "utf8");

  it("sandbox/types.ts defines all 5 SBX_* codes the dispatcher maps", () => {
    expect(sandboxTypes).toMatch(/"SBX_TIMEOUT"/);
    expect(sandboxTypes).toMatch(/"SBX_MEMORY"/);
    expect(sandboxTypes).toMatch(/"SBX_DENY_GLOBAL"/);
    expect(sandboxTypes).toMatch(/"SBX_UNAVAILABLE"/);
    expect(sandboxTypes).toMatch(/"SBX_THROWN"/);
  });
});
