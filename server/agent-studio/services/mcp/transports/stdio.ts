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
  McpOnCloseCallback,
  McpPrompt,
  McpResource,
  McpTool,
} from "../types";
import { McpError } from "../types";
// L2-c5 (cycle-5 audit closure §L2-c5): graceful → forced child
// shutdown so a hung child doesn't strand orphaned processes.
import { gracefulCloseChild } from "./graceful-child-close";

const PROTOCOL_VERSION = "2024-11-05";
// Phase 19 follow-up: bumped from 10s → 30s. The most common stdio
// MCP servers in the ecosystem are launched via `npx <package>` which
// downloads the package on first use. On slow connections (Termux on
// metered data, CI runners with cold caches) the npm package fetch +
// install can easily take 15-25 seconds before the server emits its
// first JSON-RPC frame. The pre-19 10s ceiling killed every npx-based
// server before it could finish initializing, surfacing as "MCP server
// process closed" with no useful diagnostic.
const HANDSHAKE_TIMEOUT_MS = 30_000;
const TOOLS_LIST_TIMEOUT_MS = 10_000;
// Phase 19 follow-up: cap stderr capture so a chatty server can't
// blow up memory. We only need the last few KB for diagnostics.
const STDERR_CAPTURE_MAX_BYTES = 8_192;

export interface StdioConnectInput {
  serverId: number;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  /**
   * MCP hardening Phase 1.1: invoked when the child process dies
   * (close/error). Fired exactly once per connection, regardless of
   * which event triggers first. The mcp-manager closure handles the
   * connecting-vs-connected discrimination via FSM state.
   */
  onClose?: McpOnCloseCallback;
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
  // Phase 19 follow-up: capture stderr so close-during-handshake errors
  // include the actual subprocess output instead of just "process closed".
  // Bounded to STDERR_CAPTURE_MAX_BYTES to prevent memory blowup if the
  // server is chatty.
  let stderrBuf = "";
  let exitCode: number | null = null;
  let exitSignal: NodeJS.Signals | null = null;
  // RPC id → resolver map
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (err: Error) => void }
  >();
  let nextId = 1;
  let closed = false;
  // MCP hardening Phase 1.1: ensure onClose fires at most once even if
  // both `error` and `close` events arrive (Node typically emits
  // `error` then `close` on a spawn failure).
  let notifiedClose = false;
  const fireOnClose = (reason: string) => {
    if (notifiedClose) return;
    notifiedClose = true;
    try {
      input.onClose?.(reason);
    } catch {
      /* never let an onClose handler crash the close path */
    }
  };

  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf-8");
    stderrBuf += text;
    if (stderrBuf.length > STDERR_CAPTURE_MAX_BYTES) {
      // Keep the tail — when servers crash, the last lines are usually
      // the most informative
      stderrBuf = stderrBuf.slice(-STDERR_CAPTURE_MAX_BYTES);
    }
  });

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
    fireOnClose(`process error: ${err.message}`);
  });
  child.on("close", (code, signal) => {
    closed = true;
    exitCode = code;
    exitSignal = signal;
    // Phase 19 follow-up: build a diagnostic message that tells the
    // user WHY the process died. The pre-19 "MCP server process closed"
    // was useless. Now we include exit code, signal, and the tail of
    // stderr so the user can see the real error (e.g., "command not
    // found", "module not installed", "permission denied").
    const stderrTail = stderrBuf.trim().slice(-1024);
    const reasonParts: string[] = [];
    if (exitCode !== null) reasonParts.push(`exit code ${exitCode}`);
    if (exitSignal) reasonParts.push(`signal ${exitSignal}`);
    if (reasonParts.length === 0) reasonParts.push("unknown reason");
    const reason = reasonParts.join(", ");
    const message = stderrTail
      ? `MCP server process closed (${reason})\nstderr:\n${stderrTail}`
      : `MCP server process closed (${reason}, no stderr captured — server may have died before writing anything)`;
    for (const [, handler] of pending) {
      handler.reject(new McpError("process_closed", message));
    }
    pending.clear();
    fireOnClose(message);
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

  // ── Phase 17b: Discover prompts (non-fatal) ──
  let prompts: McpPrompt[] = [];
  try {
    const promptsResult = await sendRpc<{ prompts?: McpPrompt[] }>(
      "prompts/list",
      undefined,
      TOOLS_LIST_TIMEOUT_MS
    );
    if (promptsResult && Array.isArray(promptsResult.prompts)) {
      prompts = promptsResult.prompts;
    }
  } catch {
    // Non-fatal — most MCP servers don't implement prompts
    prompts = [];
  }

  // ── Phase 17d: Discover resources (non-fatal) ──
  let resources: McpResource[] = [];
  try {
    const resourcesResult = await sendRpc<{ resources?: McpResource[] }>(
      "resources/list",
      undefined,
      TOOLS_LIST_TIMEOUT_MS
    );
    if (resourcesResult && Array.isArray(resourcesResult.resources)) {
      resources = resourcesResult.resources;
    }
  } catch {
    // Non-fatal
    resources = [];
  }

  return {
    serverId: input.serverId,
    transport: "stdio",
    tools,
    prompts,
    resources,
    close: async () => {
      closed = true;
      // L2-c5: was `child.kill("SIGTERM")` + return immediately. If
      // the child ignored SIGTERM (broken cleanup, signal-blocking
      // syscall) the orphan stayed around indefinitely. Now: SIGTERM
      // → wait 2s → SIGKILL → wait 500ms. Always resolves; never
      // throws.
      await gracefulCloseChild(child);
    },
    callTool: async (name: string, args: Record<string, unknown>) => {
      return sendRpc(
        "tools/call",
        { name, arguments: args },
        30_000
      );
    },
    getPrompt: async (name: string, args?: Record<string, string>) => {
      return sendRpc(
        "prompts/get",
        { name, arguments: args ?? {} },
        TOOLS_LIST_TIMEOUT_MS
      );
    },
    readResource: async (uri: string) => {
      return sendRpc("resources/read", { uri }, TOOLS_LIST_TIMEOUT_MS);
    },
  };
}
