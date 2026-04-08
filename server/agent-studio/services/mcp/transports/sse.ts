/**
 * AI Agent Studio — MCP SSE transport (scaffold)
 *
 * Phase 7. SSE transport sends RPC requests via POST and receives
 * responses on a long-lived EventSource. Node lacks a built-in
 * EventSource client, and adding `eventsource` would touch package.json
 * (violates the standalone-module constraint).
 *
 * For now this transport throws "not implemented" with a clear path
 * forward: install the `eventsource` package or use a Node-built-in
 * EventSource polyfill that arrives in newer Node versions.
 *
 * The HTTP transport handles most stateless servers; SSE is only needed
 * for servers that push notifications back to the client.
 */

import type { McpConnection } from "../types";
import { McpError } from "../types";

export interface SseConnectInput {
  serverId: number;
  url: string;
  headers?: Record<string, string>;
}

export async function connectSse(_input: SseConnectInput): Promise<McpConnection> {
  throw new McpError(
    "transport_not_implemented",
    "SSE transport is not implemented yet — use HTTP or stdio for now. " +
      "Tracking: needs an EventSource client (no built-in in Node)."
  );
}
