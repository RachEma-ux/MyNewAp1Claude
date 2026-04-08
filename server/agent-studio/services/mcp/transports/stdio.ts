/**
 * AI Agent Studio — MCP stdio transport
 *
 * Phase 7. Speaks JSON-RPC 2.0 over a child process's stdin/stdout.
 * One JSON object per line (newline-delimited) — the MCP convention.
 *
 * The MCP handshake is:
 *   1. client sends `initialize` with protocolVersion + capabilities
 *   2. server responds with its capabilities
 *   3. client sends `initialized` notification (no response)
 *   4. client sends `tools/list` to discover tools
 *
 * After handshake, `tools/call` is the only RPC the manager uses; the
 * rest of MCP (resources, prompts, sampling) isn't wired in this phase.
 */

import { spawn, type ChildProcess } from "child_process";
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpConnection,
  McpTool,
} from "../types";
import { McpError } from "../types";

const PROTOCOL_VERSION = "2024-11-05";
const HANDSHAKE_TIMEOUT_MS = 10_000;
const TOOLS_LIST_TIMEOUT_MS = 5_000;

export interface StdioConnectInput {
  serverId: number;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export async function connectStdio(
  input: StdioConnectInput
): Promise<McpConnection> {
  // Sanitize env: only forward what the server explicitly asked for + PATH
  const safeEnv: NodeJS.ProcessEnv = {};
  if (process.env.PATH) safeEnv.PATH = process.env.PATH;
  if (input.env) {
    for (const [k, v] of Object.entries(input.env)) safeEnv[k] = v;
  }

  let child: ChildProcess;
  try {
    child = spawn(input.command, input.args ?? [], {
      env: safeEnv,
      cwd: input.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e) {
    throw new McpError(
      "spawn_failed",
      `Failed to spawn MCP server: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  // Buffer for partial line assembly on stdout
  let stdoutBuf = "";
  // RPC id → resolver map
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (err: Error) => void }
  >();
  let nextId = 1;
  let closed = false;

  child.stdout?.on("data", (chunk: Buffer) => {
    stdoutBuf += chunk.toString("utf-8");
    // Process complete lines
    let nl: number;
    while ((nl = stdoutBuf.indexOf("\n")) !== -1) {
      const line = stdoutBuf.slice(0, nl).trim();
      stdoutBuf = stdoutBuf.slice(nl + 1);
      if (!line) continue;
      let msg: JsonRpcResponse;
      try {
        msg = JSON.parse(line);
      } catch {
        // Server sent something non-JSON (e.g., a log line on stdout —
        // technically a violation but tolerated)
        continue;
      }
      if (typeof msg.id !== "number") continue;
      const handler = pending.get(msg.id);
      if (!handler) continue;
      pending.delete(msg.id);
      if (msg.error) {
        handler.reject(
          new McpError(
            "rpc_error",
            `${msg.error.code}: ${msg.error.message}`
          )
        );
      } else {
        handler.resolve(msg.result);
      }
    }
  });

  child.on("error", (err) => {
    closed = true;
    for (const [, handler] of pending) {
      handler.reject(new McpError("process_error", err.message));
    }
    pending.clear();
  });
  child.on("close", () => {
    closed = true;
    for (const [, handler] of pending) {
      handler.reject(new McpError("process_closed", "MCP server process closed"));
    }
    pending.clear();
  });

  const sendRpc = <T = unknown>(
    method: string,
    params: Record<string, unknown> | undefined,
    timeoutMs: number
  ): Promise<T> => {
    if (closed || !child.stdin) {
      return Promise.reject(new McpError("closed", "MCP connection is closed"));
    }
    const id = nextId++;
    const req: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new McpError("timeout", `${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value as T);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      try {
        child.stdin!.write(`${JSON.stringify(req)}\n`);
      } catch (e) {
        clearTimeout(timer);
        pending.delete(id);
        reject(
          new McpError(
            "write_failed",
            e instanceof Error ? e.message : String(e)
          )
        );
      }
    });
  };

  // Send a notification (no id, no response expected)
  const sendNotification = (method: string, params?: Record<string, unknown>) => {
    if (closed || !child.stdin) return;
    const note = {
      jsonrpc: "2.0",
      method,
      params,
    };
    try {
      child.stdin.write(`${JSON.stringify(note)}\n`);
    } catch {
      /* ignore — server may have died mid-handshake */
    }
  };

  // ── Handshake ──
  try {
    await sendRpc(
      "initialize",
      {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        clientInfo: { name: "agent-studio", version: "0.1.0" },
      },
      HANDSHAKE_TIMEOUT_MS
    );
  } catch (e) {
    try {
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    throw e;
  }
  sendNotification("notifications/initialized");

  // ── Discover tools ──
  let tools: McpTool[] = [];
  try {
    const toolsResult = await sendRpc<{ tools?: McpTool[] }>(
      "tools/list",
      undefined,
      TOOLS_LIST_TIMEOUT_MS
    );
    if (toolsResult && Array.isArray(toolsResult.tools)) {
      tools = toolsResult.tools;
    }
  } catch (e) {
    // tools/list failure is non-fatal — server might not implement it
    // (some MCP servers only expose resources/prompts)
    tools = [];
  }

  return {
    serverId: input.serverId,
    transport: "stdio",
    tools,
    close: async () => {
      closed = true;
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    },
    callTool: async (name: string, args: Record<string, unknown>) => {
      return sendRpc(
        "tools/call",
        { name, arguments: args },
        30_000
      );
    },
  };
}
