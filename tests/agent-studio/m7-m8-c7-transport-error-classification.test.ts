/**
 * M7-c7 + M8-c7 (cycle-7 audit `/sdcard/Download/POST_DISPATCH_AUDIT_2026-05-09.md`
 * §M7-c7 + §M8-c7) — dispatcher transport-error classification.
 *
 * Pre-cycle-7 the four transport implementations (http/sse/stdio/
 * websocket) emitted `McpError(code, msg)` with stringly-typed `code`
 * values, and the dispatcher caught all of them in a single `catch`
 * and flattened them into `DispatchErrorCode.tool_execution_failed`.
 * Audit consequences:
 *   - Network blip (retryable) vs auth failure (terminal) became
 *     indistinguishable upstream.
 *   - Operator forensics couldn't tell "transport reached the server
 *     and got rejected" from "couldn't reach the server at all".
 *   - No functional test fixtures pinned malformed-response handling
 *     or transport parse-failure / timeout / 401 paths.
 *
 * Post-cycle-7:
 *   - `TransportErrorCode` is a closed union enumerating every code
 *     the four transports may emit.
 *   - `mapTransportCodeToDispatchCode()` routes each code into one of
 *     six richer `DispatchErrorCode` variants (transport_unreachable,
 *     transport_closed, transport_protocol_error, transport_http_error,
 *     transport_send_failed, transport_config_error) — plus reusing
 *     the existing `tool_call_timeout` for transport-level timeouts.
 *   - The dispatcher's invokeError path captures the transport code
 *     on `McpError` instances and routes through the helper BEFORE
 *     falling through to `tool_execution_failed`.
 *   - Malformed-response coverage flows through H2-c7's
 *     `validateMcpToolResponse` (already unit-covered in
 *     `result-validator.test.ts`); this file pins the dispatcher's
 *     wire-up via source-scan.
 *
 * Test layout:
 *   1. Unit tests for `mapTransportCodeToDispatchCode` —
 *      every code in the union maps to exactly one DispatchErrorCode
 *      and unknown codes return null (caller's fall-through hook).
 *   2. Source-scan: every `new McpError(...)` site in the four
 *      transport files uses a code that's in the union.
 *   3. Source-scan: dispatcher captures `transportCode` on invokeError
 *      and routes through the helper before fall-through.
 *   4. Source-scan: M7 wire-up (dispatcher calls
 *      validateMcpToolResponse before truncateResultPreview) — pinned
 *      separately by H2-c7's test, but a thin assertion here
 *      documents the M7 link.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { mapTransportCodeToDispatchCode } from "../../server/agent-studio/services/mcp/transports/transport-error-codes";

const MCP_DIR = join(process.cwd(), "server/agent-studio/services/mcp");
const TRANSPORTS_DIR = join(MCP_DIR, "transports");
const DISPATCHER_PATH = join(MCP_DIR, "dispatcher.ts");
const TYPES_PATH = join(MCP_DIR, "dispatcher-types.ts");
const TRANSPORT_CODES_PATH = join(
  TRANSPORTS_DIR,
  "transport-error-codes.ts",
);

// ─────────────────────────────────────────────────────────────────────
// 1. M8 unit tests for `mapTransportCodeToDispatchCode`
// ─────────────────────────────────────────────────────────────────────

describe("M8-c7 — mapTransportCodeToDispatchCode buckets", () => {
  // Each test below pins ONE bucket — adding a new code requires
  // adding it to the union (typescript) AND updating the right test
  // here (lockstep with the helper).

  describe("→ transport_unreachable (connection-establishment failures)", () => {
    for (const code of [
      "open_failed",
      "open_error",
      "open_timeout",
      "fetch_failed",
      "connection_error",
      "spawn_failed",
      "not_found",
    ]) {
      it(`'${code}' → transport_unreachable`, () => {
        expect(mapTransportCodeToDispatchCode(code)).toBe(
          "transport_unreachable",
        );
      });
    }
  });

  describe("→ transport_closed (connection terminated mid-call)", () => {
    for (const code of [
      "closed",
      "connection_closed",
      "process_closed",
      "process_error",
      "stream_closed",
    ]) {
      it(`'${code}' → transport_closed`, () => {
        expect(mapTransportCodeToDispatchCode(code)).toBe(
          "transport_closed",
        );
      });
    }
  });

  describe("→ transport_protocol_error (wire-format / RPC error from server)", () => {
    for (const code of ["parse_failed", "rpc_error", "tool_call_failed"]) {
      it(`'${code}' → transport_protocol_error`, () => {
        expect(mapTransportCodeToDispatchCode(code)).toBe(
          "transport_protocol_error",
        );
      });
    }
  });

  describe("→ transport_http_error (server returned non-2xx)", () => {
    it("'http_error' → transport_http_error", () => {
      expect(mapTransportCodeToDispatchCode("http_error")).toBe(
        "transport_http_error",
      );
    });
  });

  describe("→ transport_send_failed (couldn't write the request)", () => {
    for (const code of ["post_failed", "send_failed", "write_failed"]) {
      it(`'${code}' → transport_send_failed`, () => {
        expect(mapTransportCodeToDispatchCode(code)).toBe(
          "transport_send_failed",
        );
      });
    }
  });

  describe("→ tool_call_timeout (transport-level timeout collapses into existing taxonomy)", () => {
    it("'timeout' → tool_call_timeout (NOT a new variant)", () => {
      // Operator-facing code reuses the H1-c7 dispatcher-timeout code
      // because the root cause is identical from the operator's POV.
      expect(mapTransportCodeToDispatchCode("timeout")).toBe(
        "tool_call_timeout",
      );
    });
  });

  describe("→ transport_config_error (config invalid)", () => {
    it("'config' → transport_config_error", () => {
      expect(mapTransportCodeToDispatchCode("config")).toBe(
        "transport_config_error",
      );
    });
  });

  describe("unknown code → null (dispatcher falls back to tool_execution_failed)", () => {
    it("returns null for codes that aren't in the union", () => {
      // The fall-through is intentional — a future transport code
      // that lands without a mapping shouldn't break observability,
      // it should degrade gracefully to the legacy
      // tool_execution_failed bucket.
      expect(mapTransportCodeToDispatchCode("brand_new_code")).toBeNull();
    });

    it("returns null for undefined (sandbox / generic-throw paths)", () => {
      expect(mapTransportCodeToDispatchCode(undefined)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(mapTransportCodeToDispatchCode("")).toBeNull();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. M8 source-scan: every `new McpError` in transports uses a
//    TransportErrorCode that's covered by the helper.
// ─────────────────────────────────────────────────────────────────────

describe("M8-c7 — every transport-emitted code is in the helper's mapping", () => {
  // Walk the four transport files and extract every `new McpError("...")`
  // first-arg literal. Each must map to a non-null DispatchErrorCode
  // — otherwise the dispatcher's failure-mapping would silently
  // collapse it to `tool_execution_failed`.
  const transportFiles = readdirSync(TRANSPORTS_DIR).filter(
    (f) =>
      f.endsWith(".ts") &&
      f !== "transport-error-codes.ts" &&
      f !== "graceful-child-close.ts" &&
      f !== "sdk.ts",
  );

  it("scans expected transport files", () => {
    expect(transportFiles.sort()).toEqual([
      "http.ts",
      "sse.ts",
      "stdio.ts",
      "websocket.ts",
    ]);
  });

  for (const file of transportFiles) {
    describe(file, () => {
      const src = readFileSync(join(TRANSPORTS_DIR, file), "utf8");
      // Extract codes from BOTH single-line and multi-line forms:
      //   new McpError("code", "msg")
      //   new McpError(\n  "code",\n  ...
      const matches = [
        ...src.matchAll(/new McpError\(\s*"([a-z_]+)"/g),
      ].map((m) => m[1]);
      const unique = Array.from(new Set(matches));

      it("emits at least one McpError (otherwise the test is silently a no-op)", () => {
        expect(unique.length).toBeGreaterThan(0);
      });

      for (const code of unique) {
        it(`'${code}' is in the TransportErrorCode → DispatchErrorCode map`, () => {
          // mapTransportCodeToDispatchCode returning null means a
          // future PR added a transport code without updating the
          // helper. Catch it at test time, not in production audit
          // rows after the fact.
          const mapped = mapTransportCodeToDispatchCode(code);
          expect(
            mapped,
            `M8-c7 violated: ${file} emits 'new McpError("${code}", ...)' ` +
              `but ${code} is not mapped in mapTransportCodeToDispatchCode. ` +
              `Either add ${code} to TransportErrorCode + the helper's ` +
              `switch, or change the transport site to use an existing ` +
              `code. Otherwise the dispatcher will silently flatten it ` +
              `to tool_execution_failed and operator forensics lose the ` +
              `signal.`,
          ).not.toBeNull();
        });
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────
// 3. M8 source-scan: dispatcher captures transport code + uses helper
// ─────────────────────────────────────────────────────────────────────

describe("M8-c7 — dispatcher routes transport codes through the helper", () => {
  const src = readFileSync(DISPATCHER_PATH, "utf8");

  it("source carries the M8-c7 closure marker", () => {
    expect(
      src,
      "M8-c7 violated: dispatcher.ts must carry the M8-c7 closure " +
        "marker so a future audit can trace the transport-mapping " +
        "wire-up back to its origin item.",
    ).toMatch(/M8-c7\b/);
  });

  it("imports mapTransportCodeToDispatchCode from the dedicated module", () => {
    expect(
      src,
      "M8-c7 violated: dispatcher.ts must import " +
        "mapTransportCodeToDispatchCode from " +
        "./transports/transport-error-codes — keeps the mapping " +
        "centralized so future transports can register codes in one " +
        "place.",
    ).toMatch(
      /import\s*\{\s*mapTransportCodeToDispatchCode\s*\}\s*from\s*["']\.\/transports\/transport-error-codes["']/,
    );
  });

  it("imports McpError so it can narrow the caught error", () => {
    expect(
      src,
      "M8-c7 violated: dispatcher.ts must import McpError from ./types " +
        "so the invokeError catch branch can do `e instanceof McpError` " +
        "to safely extract the typed transport code.",
    ).toMatch(/import\s*\{\s*McpError\s*\}\s*from\s*["']\.\/types["']/);
  });

  it("invokeError carries a transportCode field", () => {
    expect(
      src,
      "M8-c7 violated: dispatcher.ts must store the transport-level " +
        "code on `invokeError.transportCode` so the failure-mapping " +
        "branch has the signal it needs to route through " +
        "mapTransportCodeToDispatchCode.",
    ).toMatch(/transportCode\?:\s*string/);
  });

  it("captures `e.code` from McpError instances", () => {
    expect(
      src,
      "M8-c7 violated: dispatcher.ts catch branch must check " +
        "`e instanceof McpError` and capture `e.code` onto " +
        "invokeError.transportCode. Without this the helper has " +
        "nothing to map.",
    ).toMatch(
      /transportCode:\s*e\s+instanceof\s+McpError\s*\?\s*e\.code\s*:\s*undefined/,
    );
  });

  it("failure-mapping calls mapTransportCodeToDispatchCode BEFORE falling back to tool_execution_failed", () => {
    // The load-bearing assertion. A future PR that "simplified" by
    // removing the helper call would silently restore the pre-cycle-7
    // collapse and the audit benefit evaporates.
    expect(
      src,
      "M8-c7 violated: dispatcher.ts failure-mapping must call " +
        "mapTransportCodeToDispatchCode(invokeError.transportCode) " +
        "BEFORE falling back to tool_execution_failed. Removing this " +
        "call silently restores the pre-cycle-7 'every transport " +
        "failure looks the same' bug.",
    ).toMatch(
      /mapTransportCodeToDispatchCode\(\s*invokeError\.transportCode[\s\S]{0,400}sandboxMapped\s*\?\?\s*transportMapped\s*\?\?\s*"tool_execution_failed"/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. M8 source-scan: dispatcher-types.ts has the new variants
// ─────────────────────────────────────────────────────────────────────

describe("M8-c7 — DispatchErrorCode union has the new transport variants", () => {
  const src = readFileSync(TYPES_PATH, "utf8");

  it("source carries the M8-c7 closure marker", () => {
    expect(src).toMatch(/M8-c7\b/);
  });

  for (const variant of [
    "transport_unreachable",
    "transport_closed",
    "transport_protocol_error",
    "transport_http_error",
    "transport_send_failed",
    "transport_config_error",
  ]) {
    it(`'${variant}' is a DispatchErrorCode variant`, () => {
      expect(
        src,
        `M8-c7 violated: dispatcher-types.ts must declare ${variant} ` +
          `in the DispatchErrorCode union — without it the helper's ` +
          `return type doesn't compile.`,
      ).toMatch(new RegExp(`["|]\\s*"${variant}"`));
    });
  }
});

// ─────────────────────────────────────────────────────────────────────
// 5. M7 source-scan: dispatcher wires validateMcpToolResponse at the
//    post-invoke gate (functional test for the validator itself
//    lives in `result-validator.test.ts`; this assertion documents
//    the M7 hookup).
// ─────────────────────────────────────────────────────────────────────

describe("M7-c7 — dispatcher wires malformed-response validator at post-invoke", () => {
  const src = readFileSync(DISPATCHER_PATH, "utf8");

  it("invokes validateMcpToolResponse before writing success-path audit row", () => {
    expect(
      src,
      "M7-c7 violated: dispatcher.ts must call validateMcpToolResponse " +
        "between the invoke success path and the audit-row write so " +
        "malformed responses surface as schema_mismatch_on_output " +
        "instead of leaking garbage into the trace + LLM context.",
    ).toMatch(
      /validateMcpToolResponse\(tool,\s*result\)[\s\S]{0,500}schema_mismatch_on_output/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// 6. M8 closure-marker on the new module
// ─────────────────────────────────────────────────────────────────────

describe("M8-c7 — transport-error-codes module carries closure marker", () => {
  const src = readFileSync(TRANSPORT_CODES_PATH, "utf8");

  it("source carries the M8-c7 closure marker", () => {
    expect(src).toMatch(/M8-c7\b/);
  });

  it("documents why McpError.code stays string (legacy callMcpTool shim)", () => {
    // A future PR that "tightens" McpError.code to TransportErrorCode
    // would break the mcp-manager.callMcpTool re-throw shim. The
    // doc-block must explain why so the next reviewer doesn't
    // re-attempt the narrow.
    expect(
      src,
      "M8-c7 violated: transport-error-codes.ts doc-block must " +
        "explain why McpError.code is intentionally `string` (the " +
        "legacy callMcpTool shim re-throws dispatcher codes through " +
        "McpError, so narrowing the field would break compatibility).",
    ).toMatch(/string[\s\S]{0,400}callMcpTool|callMcpTool[\s\S]{0,400}string/);
  });
});
