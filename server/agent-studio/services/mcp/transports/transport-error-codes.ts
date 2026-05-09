/**
 * M8-c7 (cycle-7 audit `/sdcard/Download/POST_DISPATCH_AUDIT_2026-05-09.md`
 * §M8-c7) — transport error classification.
 *
 * Pre-cycle-7 the four transport implementations
 * (`http.ts`, `sse.ts`, `stdio.ts`, `websocket.ts`) emitted free-form
 * `McpError(code, msg)` values where `code` was a stringly-typed grab
 * bag (`fetch_failed`, `open_failed`, `rpc_error`, `http_error`,
 * `parse_failed`, `process_closed`, ...). The dispatcher caught all
 * of them in a single `catch` and flattened them into the generic
 * `tool_execution_failed` `DispatchErrorCode`. Operationally the
 * resulting audit row could not distinguish:
 *   - a transient network blip the runtime could retry, from
 *   - a server reachable-but-rejecting the call (HTTP 5xx), from
 *   - a server-spec violation (malformed JSON-RPC), from
 *   - a write that never left the box.
 *
 * Post-cycle-7 the transport `code` field is type-narrowed to
 * `TransportErrorCode`, and the dispatcher routes through
 * `mapTransportCodeToDispatchCode()` so each transport-level failure
 * surfaces under a richer `DispatchErrorCode` variant. Mirrors the
 * H1-c7 / H3-c7 pattern (timeout + sandbox already get distinct
 * codes — transport-level failures join the same taxonomy).
 *
 * Design choices:
 *   - **Closed enum, but McpError.code stays `string`.** The
 *     `TransportErrorCode` union is the contract transport sites
 *     should follow when constructing `new McpError(...)`, but
 *     `McpError.code` itself is typed `string` because the legacy
 *     `callMcpTool` shim re-throws dispatcher errors via
 *     `new McpError(dispatcherCode, ...)` and those codes can be
 *     any `DispatchErrorCode` (not just transport codes). The
 *     dispatcher's mapping table catches every transport variant;
 *     if a new code lands without a mapping the function returns
 *     `null` and the dispatcher falls back to
 *     `tool_execution_failed` (safe default — no observability
 *     regression).
 *   - **Operational buckets, not 1:1.** The mapping groups codes by
 *     "what does the operator do next?" — retry vs config-fix vs
 *     server-bug. Six buckets cover the full surface; finer
 *     granularity would just shuffle codes between equivalent
 *     remediation paths.
 *   - **Transport-level `timeout` collapses into `tool_call_timeout`.**
 *     The transport's own `timeout` (e.g. SSE's per-RPC reject) and
 *     the dispatcher's outer `withTimeout` (H1-c7) share a single
 *     root cause from the operator's perspective. Reusing the
 *     existing code keeps the audit taxonomy tight.
 */
import type { DispatchErrorCode } from "../dispatcher-types";

/**
 * Closed enumeration of every transport-level error code the four
 * transports may surface via `new McpError(code, msg)`. New codes MUST
 * be added here AND mapped in `mapTransportCodeToDispatchCode` —
 * otherwise the dispatcher will silently fall through to
 * `tool_execution_failed`, which defeats the M8-c7 distinction.
 *
 * Codes are grouped by intent in the JSDoc — runtime is a flat union
 * for ergonomics + structural typing at `new McpError` sites.
 */
export type TransportErrorCode =
  // Couldn't establish the transport (network unreachable, DNS, HTTP
  // GET to SSE endpoint failed, child process failed to spawn, WS
  // open() failed, MCP server config not found, etc.). Often
  // transient — operator's first move is "retry / check connectivity".
  | "open_failed"
  | "open_error"
  | "open_timeout"
  | "fetch_failed"
  | "connection_error"
  | "spawn_failed"
  | "not_found"
  // Connection terminated mid-call (process exited, websocket closed,
  // SSE stream ended, stdio child crashed). Retryable but more
  // concerning — the server reached an error state under our load.
  | "closed"
  | "connection_closed"
  | "process_closed"
  | "process_error"
  | "stream_closed"
  // Wire-format / JSON-RPC error from a reachable server. Server is
  // up but speaking incorrect protocol (or rejecting the call). Not
  // retryable without a server-side change.
  | "parse_failed"
  | "rpc_error"
  | "tool_call_failed"
  // Server returned a non-2xx HTTP response (and it wasn't an auth
  // challenge — those flow through `McpAuthRequiredError`). Server
  // is up + speaking HTTP correctly but is rejecting outright.
  | "http_error"
  // The runtime couldn't write the request to the transport
  // (POST to SSE failed, ws.send() failed, stdin write failed).
  // Bridge between transport-up and call-failed.
  | "post_failed"
  | "send_failed"
  | "write_failed"
  // Transport-level timeout (per-RPC reject, distinct from the
  // dispatcher's outer `withTimeout` wrap). Maps to the existing
  // `tool_call_timeout` `DispatchErrorCode` — same root cause from
  // the operator's perspective.
  | "timeout"
  // Configuration error (missing url / args / cmd). Dev/setup error,
  // not a runtime failure.
  | "config";

/**
 * Map a transport-level `TransportErrorCode` to the dispatcher's
 * structured `DispatchErrorCode`. Returns `null` if the code isn't
 * recognized — caller (dispatcher.ts §9 invokeError handling) falls
 * back to `tool_execution_failed` so observability never breaks on a
 * future code that's added to the union but not the map.
 *
 * Ordering of the switch follows the bucket comments in
 * `TransportErrorCode` so future readers can keep them in sync.
 */
export function mapTransportCodeToDispatchCode(
  code: string | undefined,
): DispatchErrorCode | null {
  switch (code) {
    // Connection-establishment failure → unreachable (retryable)
    case "open_failed":
    case "open_error":
    case "open_timeout":
    case "fetch_failed":
    case "connection_error":
    case "spawn_failed":
    case "not_found":
      return "transport_unreachable";

    // Connection terminated mid-call → closed (potentially retryable)
    case "closed":
    case "connection_closed":
    case "process_closed":
    case "process_error":
    case "stream_closed":
      return "transport_closed";

    // Wire-format / JSON-RPC error → protocol_error (server bug)
    case "parse_failed":
    case "rpc_error":
    case "tool_call_failed":
      return "transport_protocol_error";

    // Non-2xx HTTP response → http_error (server reachable, rejecting)
    case "http_error":
      return "transport_http_error";

    // Couldn't write the request → send_failed
    case "post_failed":
    case "send_failed":
    case "write_failed":
      return "transport_send_failed";

    // Transport-level timeout collapses into the existing dispatcher
    // timeout taxonomy — same root cause from the operator's POV.
    case "timeout":
      return "tool_call_timeout";

    // Configuration error → config
    case "config":
      return "transport_config_error";

    default:
      return null;
  }
}
