/**
 * AI Agent Studio — Studio-as-MCP-server (Phase 19 follow-up)
 *
 * Exposes Agent Studio's own capabilities as a real MCP server over
 * HTTP JSON-RPC 2.0. Mounted at POST /api/mcp on the existing Express
 * app — no new process, no new port.
 *
 * Why this exists:
 *   Phase 7-19 built Studio as a pure MCP CLIENT — it connects OUT to
 *   external MCP servers (stdio, http, sse, websocket, sdk transports).
 *   But MCP is a symmetric protocol: every node can be both client AND
 *   server. By exposing Studio as a server, we get:
 *
 *     1. A REAL working MCP server we can point our own http transport
 *        at (the seeded `weather` row reseeded to http://127.0.0.1:3000/api/mcp).
 *        No more stub workarounds, no more broken example URLs.
 *     2. Interop with other MCP clients (Claude Desktop, openllm-agent2,
 *        future agent runtimes) — they can attach to Studio's catalog
 *        and use its tools/prompts/resources.
 *     3. A demonstration that MCP works both ways in one process —
 *        the dispatcher can theoretically dogfood the server side.
 *
 * Wire format: standard JSON-RPC 2.0. Single POST endpoint accepts a
 * single request OR a batch array. Notifications (no `id`) get no
 * response. Errors use the spec's reserved range (-32700 to -32603).
 *
 * Tools served (read-only for safety — no destructive operations
 * exposed via the public MCP surface):
 *   - studio.echo               — verbatim echo for connectivity tests
 *   - studio.ping               — returns "pong"
 *   - studio.list_agents        — list all agents in the studio
 *   - studio.list_catalog_tools — flatten the merged tool catalog
 *   - studio.get_runtime_run    — fetch a runtime trace by id
 *
 * Prompts served: every entry from `listMergedSkills` (read-only).
 * Resources served: every runtime run as `runtime-run://{id}` URIs.
 *
 * Auth: open by default. Add a token check at the route level if you
 * need to restrict access to local-only or per-token clients.
 */

import type { Request, Response } from "express";
import * as repo from "../../repository";
import * as catalogTools from "../catalog-tools";
import * as catalogSkills from "../catalog-skills";

// ── JSON-RPC envelope ──────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: number | string | null;
  result: unknown;
}

interface JsonRpcError {
  jsonrpc: "2.0";
  id: number | string | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

const ERR_PARSE = -32700;
const ERR_INVALID_REQUEST = -32600;
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_INVALID_PARAMS = -32602;
const ERR_INTERNAL = -32603;

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = {
  name: "agent-studio",
  version: "0.19.0",
};

// ── Tool handlers ──────────────────────────────────────────────────────────
//
// Each handler validates its args, executes, and returns the
// MCP-shaped result `{ content: [{ type: "text", text: "..." }] }`.
// Throws an Error on bad args — handleToolsCall maps that to a
// JSON-RPC error response.

interface StudioMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

const STUDIO_TOOLS: StudioMcpTool[] = [
  {
    name: "studio.echo",
    description: "Return the provided message verbatim — connectivity smoke test",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Text to echo back" },
      },
      required: ["message"],
    },
    handler: async (args) => {
      const message = args.message;
      if (typeof message !== "string") {
        throw new Error("'message' must be a string");
      }
      return {
        content: [{ type: "text", text: message }],
      };
    },
  },
  {
    name: "studio.ping",
    description: "Return 'pong' — liveness check",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: async () => ({
      content: [{ type: "text", text: "pong" }],
    }),
  },
  {
    name: "studio.list_agents",
    description: "List every agent registered in the Studio (id, name, lifecycle state)",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: async () => {
      const agents = await repo.listAgents({ limit: 100 });
      const summary = agents.map((a: any) => ({
        id: a.id,
        name: a.name,
        internalKey: a.internalKey,
        lifecycleState: a.lifecycleState,
        agentClass: a.agentClass,
      }));
      return {
        content: [
          {
            type: "text",
            text: `Studio has ${agents.length} agent(s):\n\n${JSON.stringify(summary, null, 2)}`,
          },
        ],
      };
    },
  },
  {
    name: "studio.list_catalog_tools",
    description: "List the merged catalog tools (built-in + DB) available in the Studio",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Optional category filter" },
        search: { type: "string", description: "Optional search term" },
      },
      required: [],
    },
    handler: async (args) => {
      const merged = await catalogTools.listMergedTools({
        category: typeof args.category === "string" ? args.category : undefined,
        search: typeof args.search === "string" ? args.search : undefined,
      });
      const summary = {
        builtinCount: merged.builtin.length,
        dbCount: merged.db.length,
        totalCount: merged.all.length,
        tools: merged.all.slice(0, 50).map((t) => ({
          key: t.key,
          name: t.name,
          category: t.category,
          source: t.source,
        })),
      };
      return {
        content: [
          { type: "text", text: JSON.stringify(summary, null, 2) },
        ],
      };
    },
  },
  {
    name: "studio.get_runtime_run",
    description: "Fetch a runtime run by its numeric id (returns trace metadata)",
    inputSchema: {
      type: "object",
      properties: {
        runId: { type: "number", description: "Runtime run id" },
      },
      required: ["runId"],
    },
    handler: async (args) => {
      const runId = args.runId;
      if (typeof runId !== "number") {
        throw new Error("'runId' must be a number");
      }
      const run = await repo.getRuntimeRunById(runId);
      if (!run) {
        return {
          content: [{ type: "text", text: `Run ${runId} not found` }],
          isError: true,
        };
      }
      return {
        content: [
          { type: "text", text: JSON.stringify(run, null, 2) },
        ],
      };
    },
  },
];

// ── Handlers per JSON-RPC method ──────────────────────────────────────────

async function handleInitialize(_params: Record<string, unknown> | undefined) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {
      tools: { listChanged: false },
      prompts: { listChanged: false },
      resources: { listChanged: false },
    },
    serverInfo: SERVER_INFO,
  };
}

async function handleToolsList() {
  return {
    tools: STUDIO_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  };
}

async function handleToolsCall(params: Record<string, unknown> | undefined) {
  const name = params?.name;
  const args = params?.arguments;
  if (typeof name !== "string") {
    throw makeRpcError(ERR_INVALID_PARAMS, "'name' must be a string");
  }
  const tool = STUDIO_TOOLS.find((t) => t.name === name);
  if (!tool) {
    throw makeRpcError(
      ERR_METHOD_NOT_FOUND,
      `Tool '${name}' not found. Available: ${STUDIO_TOOLS.map((t) => t.name).join(", ")}`
    );
  }
  try {
    return await tool.handler(
      (args ?? {}) as Record<string, unknown>
    );
  } catch (e) {
    throw makeRpcError(
      ERR_INTERNAL,
      `Tool '${name}' failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

async function handlePromptsList() {
  try {
    const merged = await catalogSkills.listMergedSkills();
    // listMergedSkills returns { builtin, db, all } shape; we want all
    const all = (merged as any).all ?? [];
    return {
      prompts: all.slice(0, 100).map((s: any) => ({
        name: s.skillKey ?? s.key ?? s.name ?? "unnamed",
        description: s.description ?? s.skillName ?? "",
        arguments: [],
      })),
    };
  } catch {
    // Catalog read failed — return empty list rather than 500
    return { prompts: [] };
  }
}

async function handlePromptsGet(params: Record<string, unknown> | undefined) {
  const name = params?.name;
  if (typeof name !== "string") {
    throw makeRpcError(ERR_INVALID_PARAMS, "'name' must be a string");
  }
  try {
    const merged = await catalogSkills.listMergedSkills();
    const all = (merged as any).all ?? [];
    const match = all.find(
      (s: any) =>
        s.skillKey === name || s.key === name || s.name === name
    );
    if (!match) {
      throw makeRpcError(ERR_METHOD_NOT_FOUND, `Prompt '${name}' not found`);
    }
    return {
      description: match.description ?? "",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: match.body ?? match.description ?? `(${name})`,
          },
        },
      ],
    };
  } catch (e) {
    if ((e as any)?._jsonRpcError) throw e;
    throw makeRpcError(
      ERR_INTERNAL,
      `prompts/get failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

async function handleResourcesList() {
  // Expose recent runtime runs as MCP resources. Cap at 20 so we don't
  // dump the whole table on every list request.
  try {
    const runs = await repo.listRecentRuntimeRunsAcrossAgents(20);
    return {
      resources: runs.map((r: any) => ({
        uri: `runtime-run://${r.id}`,
        name: `Runtime Run #${r.id}`,
        description: `Status: ${r.status ?? "unknown"}, Created: ${r.createdAt}`,
        mimeType: "application/json",
      })),
    };
  } catch {
    return { resources: [] };
  }
}

async function handleResourcesRead(params: Record<string, unknown> | undefined) {
  const uri = params?.uri;
  if (typeof uri !== "string") {
    throw makeRpcError(ERR_INVALID_PARAMS, "'uri' must be a string");
  }
  const m = uri.match(/^runtime-run:\/\/(\d+)$/);
  if (!m) {
    throw makeRpcError(
      ERR_INVALID_PARAMS,
      `Unsupported URI scheme. Expected runtime-run://<id>, got ${uri}`
    );
  }
  const runId = parseInt(m[1], 10);
  const run = await repo.getRuntimeRunById(runId);
  if (!run) {
    throw makeRpcError(ERR_INVALID_PARAMS, `Run ${runId} not found`);
  }
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(run, null, 2),
      },
    ],
  };
}

// ── Method dispatch table ──────────────────────────────────────────────────

const METHOD_HANDLERS: Record<
  string,
  (params: Record<string, unknown> | undefined) => Promise<unknown>
> = {
  initialize: handleInitialize,
  "tools/list": handleToolsList,
  "tools/call": handleToolsCall,
  "prompts/list": handlePromptsList,
  "prompts/get": handlePromptsGet,
  "resources/list": handleResourcesList,
  "resources/read": handleResourcesRead,
  // Notifications — no result, no response. We accept them to honor
  // the protocol but they're handled at the dispatcher level.
};

const NOTIFICATION_METHODS = new Set([
  "notifications/initialized",
  "notifications/cancelled",
  "notifications/progress",
]);

// ── Helpers ────────────────────────────────────────────────────────────────

function makeRpcError(code: number, message: string, data?: unknown): Error {
  const err = new Error(message) as Error & {
    _jsonRpcError: { code: number; message: string; data?: unknown };
  };
  err._jsonRpcError = { code, message, data };
  return err;
}

function isNotification(req: JsonRpcRequest): boolean {
  return req.id == null && NOTIFICATION_METHODS.has(req.method);
}

async function dispatchOne(
  req: JsonRpcRequest
): Promise<JsonRpcResponse | null> {
  // Notifications: process side-effects, return nothing
  if (isNotification(req)) {
    return null;
  }

  // Validate envelope
  if (req.jsonrpc !== "2.0" || typeof req.method !== "string") {
    return {
      jsonrpc: "2.0",
      id: req.id ?? null,
      error: { code: ERR_INVALID_REQUEST, message: "Invalid JSON-RPC envelope" },
    };
  }

  const handler = METHOD_HANDLERS[req.method];
  if (!handler) {
    return {
      jsonrpc: "2.0",
      id: req.id ?? null,
      error: {
        code: ERR_METHOD_NOT_FOUND,
        message: `Method '${req.method}' not found`,
      },
    };
  }

  try {
    const result = await handler(req.params);
    return { jsonrpc: "2.0", id: req.id ?? null, result };
  } catch (e) {
    const err = e as Error & {
      _jsonRpcError?: { code: number; message: string; data?: unknown };
    };
    if (err._jsonRpcError) {
      return {
        jsonrpc: "2.0",
        id: req.id ?? null,
        error: err._jsonRpcError,
      };
    }
    return {
      jsonrpc: "2.0",
      id: req.id ?? null,
      error: {
        code: ERR_INTERNAL,
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }
}

// ── Express handler ────────────────────────────────────────────────────────

/**
 * Express handler for POST /api/mcp. Accepts a single JSON-RPC request
 * OR a batch array. Returns 200 with the response (or 200 with no body
 * for pure notification batches).
 *
 * Wire this up in server/_core/index.ts:
 *   import { handleStudioMcpRequest } from "../agent-studio/services/mcp/studio-mcp-server";
 *   app.post("/api/mcp", handleStudioMcpRequest);
 */
export async function handleStudioMcpRequest(
  req: Request,
  res: Response
): Promise<void> {
  let body: unknown;
  try {
    body = req.body;
    if (!body || typeof body !== "object") {
      res.status(200).json({
        jsonrpc: "2.0",
        id: null,
        error: { code: ERR_PARSE, message: "Body must be a JSON object or array" },
      });
      return;
    }
  } catch (e) {
    res.status(200).json({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: ERR_PARSE,
        message: e instanceof Error ? e.message : String(e),
      },
    });
    return;
  }

  // Batch mode
  if (Array.isArray(body)) {
    if (body.length === 0) {
      res.status(200).json({
        jsonrpc: "2.0",
        id: null,
        error: { code: ERR_INVALID_REQUEST, message: "Empty batch" },
      });
      return;
    }
    const responses = await Promise.all(
      body.map((r) => dispatchOne(r as JsonRpcRequest))
    );
    const filtered = responses.filter((r): r is JsonRpcResponse => r !== null);
    if (filtered.length === 0) {
      // Pure notification batch — no response body
      res.status(204).end();
      return;
    }
    res.status(200).json(filtered);
    return;
  }

  // Single request mode
  const response = await dispatchOne(body as JsonRpcRequest);
  if (response === null) {
    // Notification — no body
    res.status(204).end();
    return;
  }
  res.status(200).json(response);
}
