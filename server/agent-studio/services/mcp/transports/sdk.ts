/**
 * AI Agent Studio — MCP SDK (in-process) transport (scaffold)
 *
 * Phase 7. The "sdk" transport is for built-in MCP servers that run
 * inside the Studio process itself (no IPC). There aren't any built-in
 * servers yet, so this throws "not implemented" — it's a placeholder
 * for the future when we want to ship Studio-native MCP servers (e.g.,
 * a "studio.knowledge" server that exposes the knowledge bindings as
 * MCP tools).
 *
 * The interface is identical to the other transports (returns an
 * McpConnection) so once we have a built-in server, we just hand its
 * already-instantiated handler to this connector.
 */

import type { McpConnection } from "../types";
import { McpError } from "../types";

export interface SdkConnectInput {
  serverId: number;
  /** Future: an in-process handler reference */
  handler?: unknown;
}

export async function connectSdk(_input: SdkConnectInput): Promise<McpConnection> {
  throw new McpError(
    "transport_not_implemented",
    "SDK transport is not implemented yet — no built-in MCP servers exist. " +
      "Use stdio or http for external servers."
  );
}
