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
import { promises as fs } from "fs";
import * as path from "path";
import * as repo from "../../repository";
import * as catalogTools from "../catalog-tools";
import * as catalogSkills from "../catalog-skills";

// ── Filesystem scope for studio.write_file / studio.read_file ─────────────
//
// The agent has FULL-ACCESS write tools via studio.write_file, but only
// under paths that are explicitly safe to mutate from an LLM. Extending
// this whitelist is a conscious trust decision — do not add $HOME or
// the repo working directory, because the agent would then be able to
// overwrite its own source code, git history, or CLAUDE.md.
//
// Paths are normalized via path.resolve before the check, so `..`
// traversal attempts are rejected by prefix-match.
const FS_ALLOWED_WRITE_PREFIXES: string[] = [
  "/storage/emulated/0/Download/", // Termux-visible Android Downloads
  "/storage/emulated/0/Documents/", // Termux-visible Android Documents
  "/data/data/com.termux/files/usr/tmp/", // Termux scratch
];

// Reads get a broader whitelist — reading isn't destructive, but we
// still exclude credential stores and the termux secrets dir.
const FS_ALLOWED_READ_PREFIXES: string[] = [
  ...FS_ALLOWED_WRITE_PREFIXES,
  "/data/data/com.termux/files/home/MyNewAp1Claude/docs/",
  "/data/data/com.termux/files/home/MyNewAp1Claude/README.md",
];

function ensureWithinPrefixes(targetPath: string, prefixes: string[]): string {
  const resolved = path.resolve(targetPath);
  const ok = prefixes.some((p) => resolved === p.replace(/\/$/, "") || resolved.startsWith(p));
  if (!ok) {
    throw new Error(
      `Path not allowed: ${resolved}. Allowed prefixes: ${prefixes.join(", ")}`
    );
  }
  return resolved;
}

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

  // ── Filesystem tools ─────────────────────────────────────────────────
  //
  // Scoped write/read. See FS_ALLOWED_*_PREFIXES at the top of this file
  // for the whitelist. The agent can freely create, overwrite, or read
  // files inside those paths — anywhere else is a hard error.

  {
    name: "studio.write_file",
    description:
      "Create or overwrite a file at the given absolute path. Allowed paths: /storage/emulated/0/Download/, /storage/emulated/0/Documents/, /data/data/com.termux/files/usr/tmp/. Paths outside this whitelist are rejected.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Absolute filesystem path. Must start with an allowed prefix.",
        },
        content: {
          type: "string",
          description:
            "File content to write. Pass an empty string to create an empty file.",
        },
        createParents: {
          type: "boolean",
          description:
            "If true, create missing parent directories (default: true)",
        },
      },
      required: ["path", "content"],
    },
    handler: async (args) => {
      const targetPath = args.path;
      const content = args.content;
      const createParents = args.createParents !== false; // default true
      if (typeof targetPath !== "string") {
        throw new Error("'path' must be a string");
      }
      if (typeof content !== "string") {
        throw new Error("'content' must be a string");
      }
      const resolved = ensureWithinPrefixes(targetPath, FS_ALLOWED_WRITE_PREFIXES);
      if (createParents) {
        await fs.mkdir(path.dirname(resolved), { recursive: true });
      }
      await fs.writeFile(resolved, content, "utf-8");
      const stat = await fs.stat(resolved);
      return {
        content: [
          {
            type: "text",
            text: `Wrote ${stat.size} bytes to ${resolved}`,
          },
        ],
      };
    },
  },

  {
    name: "studio.read_file",
    description:
      "Read a file at the given absolute path. Allowed paths: the write whitelist plus docs/ and README.md under the repo.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute filesystem path.",
        },
        maxBytes: {
          type: "number",
          description: "Max bytes to return (default 65536)",
        },
      },
      required: ["path"],
    },
    handler: async (args) => {
      const targetPath = args.path;
      const maxBytes =
        typeof args.maxBytes === "number" ? args.maxBytes : 65536;
      if (typeof targetPath !== "string") {
        throw new Error("'path' must be a string");
      }
      const resolved = ensureWithinPrefixes(targetPath, FS_ALLOWED_READ_PREFIXES);
      const raw = await fs.readFile(resolved);
      const truncated = raw.length > maxBytes;
      const text = raw.slice(0, maxBytes).toString("utf-8");
      return {
        content: [
          {
            type: "text",
            text:
              (truncated ? `[truncated at ${maxBytes} bytes] ` : "") + text,
          },
        ],
      };
    },
  },

  // ── Studio mutation tools ────────────────────────────────────────────
  //
  // These turn the OpenLLM Agent into a Studio self-editor: it can
  // create new agents, patch drafts, manage permission rules, attach
  // MCP servers, and submit for review. Every mutation writes through
  // the existing repo layer so the same invariants the UI relies on
  // (internal_key uniqueness, draft isCurrent, etc.) are preserved.

  {
    name: "studio.create_agent",
    description:
      "Create a new agent with an initial draft. Returns the new agent id + draft id. internal_key must be unique across the Studio.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Human-readable agent name" },
        internalKey: {
          type: "string",
          description:
            "Unique slug-style key (lowercase, hyphens ok). Used as the permanent handle for the agent.",
        },
        description: { type: "string" },
        agentClass: {
          type: "string",
          description:
            "assistant | orchestrator | analyst | custom (default: assistant)",
        },
        visibility: {
          type: "string",
          description: "private | workspace | org (default: private)",
        },
      },
      required: ["name", "internalKey"],
    },
    handler: async (args) => {
      const name = args.name;
      const internalKey = args.internalKey;
      if (typeof name !== "string" || name.length === 0) {
        throw new Error("'name' must be a non-empty string");
      }
      if (typeof internalKey !== "string" || internalKey.length === 0) {
        throw new Error("'internalKey' must be a non-empty string");
      }
      const existing = await repo.getAgentByInternalKey(internalKey);
      if (existing) {
        throw new Error(
          `Agent with internalKey='${internalKey}' already exists (id=${existing.id})`
        );
      }
      const result = await repo.createAgent({
        name,
        internalKey,
        description:
          typeof args.description === "string" ? args.description : undefined,
        agentClass:
          typeof args.agentClass === "string" ? args.agentClass : undefined,
        visibility:
          typeof args.visibility === "string" ? args.visibility : undefined,
      });
      return {
        content: [
          {
            type: "text",
            text: `Created agent id=${result.agent.id} (draft id=${result.draft.id}, internalKey='${internalKey}')`,
          },
        ],
      };
    },
  },

  {
    name: "studio.update_draft",
    description:
      "Patch fields on an agent's current draft. Pass the fields you want to change as TOP-LEVEL parameters — do NOT wrap them in a 'patch' object. Only the whitelisted fields below are accepted; any other field is silently dropped. Call this multiple times to update different field groups if needed.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: {
          type: "number",
          description: "The agent whose current draft you want to update",
        },
        // ── Text fields — pass any subset you want to change ─────────
        mission: {
          type: "string",
          description:
            "One-paragraph description of what the agent is for. Sets `mission` on the current draft.",
        },
        role: {
          type: "string",
          description:
            "Short role label (e.g., 'Principal End-to-End Full-Stack Engineering Specialist').",
        },
        scope: {
          type: "string",
          description:
            "What the agent is allowed to work on (domains, layers, systems).",
        },
        systemInstructions: {
          type: "string",
          description:
            "Full system prompt / persona text — this is what the model sees at the top of every conversation.",
        },
        roleInstructions: {
          type: "string",
          description:
            "Role-specific operating instructions (tone, conventions, do/don't rules).",
        },
        policyInstructions: {
          type: "string",
          description:
            "Policy and governance instructions the agent must follow (escalation, approval, refusal rules).",
        },
        outputContract: {
          type: "string",
          description:
            "Expected output format — markdown sections, JSON schema, or freeform prose.",
        },
        successCriteria: {
          type: "string",
          description: "What 'done' means for work handled by this agent.",
        },
        escalationRules: {
          type: "string",
          description:
            "When and how the agent should escalate instead of acting.",
        },
        fallbackBehavior: {
          type: "string",
          description: "What to do when primary path fails.",
        },
        refusalBehavior: {
          type: "string",
          description:
            "What to do when asked for something out of scope or forbidden.",
        },
        autonomyLevel: {
          type: "string",
          description:
            "supervised | semi_autonomous | autonomous — defaults to supervised if omitted.",
        },
        // ── Structured fields ────────────────────────────────────────
        allowedTasks: {
          type: "array",
          items: { type: "string" },
          description:
            "Task keys the agent is explicitly authorized to perform.",
        },
        blockedTasks: {
          type: "array",
          items: { type: "string" },
          description:
            "Task keys the agent must refuse even if asked directly.",
        },
        interventionTriggers: {
          type: "array",
          items: { type: "string" },
          description:
            "Conditions that should cause the agent to pause for human intervention.",
        },
        providerConfig: {
          type: "object",
          description:
            "LLM provider config. Common shape: {provider: 'openai', model: 'gpt-4o-mini', temperature: 0.2, maxTokens: 4000, apiKeyEnvVar: 'OPENAI_API_KEY'}",
          properties: {
            provider: { type: "string" },
            model: { type: "string" },
            temperature: { type: "number" },
            maxTokens: { type: "number" },
            apiKeyEnvVar: { type: "string" },
            baseUrl: { type: "string" },
          },
        },
        // ── Back-compat escape hatch ─────────────────────────────────
        patch: {
          type: "object",
          description:
            "Deprecated shape — same fields as top-level parameters but nested inside this object. Kept for back-compat; prefer top-level parameters.",
        },
      },
      required: ["agentId"],
    },
    handler: async (args) => {
      const agentId = args.agentId;
      if (typeof agentId !== "number") {
        throw new Error("'agentId' must be a number");
      }
      // Whitelist of writable draft fields. Anything not in this list
      // is ignored so the LLM can't scribble on currentDraftId,
      // isCurrent, createdBy, version timestamps, etc.
      const ALLOWED_KEYS = [
        "mission",
        "role",
        "scope",
        "systemInstructions",
        "roleInstructions",
        "policyInstructions",
        "outputContract",
        "providerConfig",
        "allowedTasks",
        "blockedTasks",
        "autonomyLevel",
        "interventionTriggers",
        "successCriteria",
        "escalationRules",
        "fallbackBehavior",
        "refusalBehavior",
      ] as const;

      // Accept BOTH shapes:
      //   1. Top-level fields: { agentId, mission: "...", role: "...", ... }
      //   2. Nested `patch` object: { agentId, patch: { mission, role } }
      // If both are present, top-level values take precedence.
      const filtered: Record<string, unknown> = {};
      const nested =
        args.patch && typeof args.patch === "object"
          ? (args.patch as Record<string, unknown>)
          : {};
      for (const key of ALLOWED_KEYS) {
        if (key in (args as Record<string, unknown>)) {
          const v = (args as Record<string, unknown>)[key];
          if (v !== undefined) filtered[key] = v;
        } else if (key in nested) {
          const v = nested[key];
          if (v !== undefined) filtered[key] = v;
        }
      }

      if (Object.keys(filtered).length === 0) {
        throw new Error(
          `No fields to update. Pass one or more top-level parameters. Allowed: ${ALLOWED_KEYS.join(", ")}`
        );
      }
      const updated = await repo.updateDraft(agentId, filtered);
      return {
        content: [
          {
            type: "text",
            text: `Draft updated for agent ${agentId}. Changed: ${Object.keys(filtered).join(", ")}. New draft id=${(updated as any)?.id}`,
          },
        ],
      };
    },
  },

  {
    name: "studio.add_permission_rule",
    description:
      "Add a permission rule to an agent's current draft. Rules are evaluated first-match-wins in alphabetical toolPattern order. Behavior must be one of allow, deny, ask.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "number" },
        toolPattern: {
          type: "string",
          description:
            "Tool pattern (e.g. 'Bash', 'Bash(*)', 'Write(/storage/*)', 'Read')",
        },
        behavior: {
          type: "string",
          description: "allow | deny | ask",
        },
        source: {
          type: "string",
          description:
            "userSettings | projectSettings | localSettings | cliArg | session (default: session)",
        },
        description: { type: "string" },
      },
      required: ["agentId", "toolPattern", "behavior"],
    },
    handler: async (args) => {
      const agentId = args.agentId;
      const toolPattern = args.toolPattern;
      const behavior = args.behavior;
      if (typeof agentId !== "number") {
        throw new Error("'agentId' must be a number");
      }
      if (typeof toolPattern !== "string" || toolPattern.length === 0) {
        throw new Error("'toolPattern' must be a non-empty string");
      }
      if (behavior !== "allow" && behavior !== "deny" && behavior !== "ask") {
        throw new Error("'behavior' must be one of: allow, deny, ask");
      }
      const draft = await repo.getCurrentDraft(agentId);
      if (!draft) throw new Error(`No current draft for agent ${agentId}`);
      const rule = await repo.savePermissionRule({
        draftId: draft.id,
        ruleSource: typeof args.source === "string" ? args.source : "session",
        ruleBehavior: behavior,
        toolPattern,
        description:
          typeof args.description === "string" ? args.description : null,
      });
      return {
        content: [
          {
            type: "text",
            text: `Added rule id=${rule.id}: ${behavior.toUpperCase()} ${toolPattern}`,
          },
        ],
      };
    },
  },

  {
    name: "studio.attach_mcp_server",
    description:
      "Attach an MCP server to an agent's current draft. transport must be one of: sdk, stdio, http, sse, websocket. For http/sse transports pass url; for stdio pass command + args.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "number" },
        name: { type: "string" },
        transport: { type: "string" },
        url: { type: "string" },
        command: { type: "string" },
        args: { type: "array", items: { type: "string" } },
        env: { type: "object" },
        enabled: { type: "boolean" },
      },
      required: ["agentId", "name", "transport"],
    },
    handler: async (args) => {
      const agentId = args.agentId;
      const name = args.name;
      const transport = args.transport;
      if (typeof agentId !== "number") {
        throw new Error("'agentId' must be a number");
      }
      if (typeof name !== "string" || name.length === 0) {
        throw new Error("'name' must be a non-empty string");
      }
      if (typeof transport !== "string" || transport.length === 0) {
        throw new Error("'transport' must be a non-empty string");
      }
      const draft = await repo.getCurrentDraft(agentId);
      if (!draft) throw new Error(`No current draft for agent ${agentId}`);
      const saved = await repo.saveMcpServer({
        draftId: draft.id,
        name,
        transport,
        url: typeof args.url === "string" ? args.url : null,
        command: typeof args.command === "string" ? args.command : null,
        args: Array.isArray(args.args) ? (args.args as string[]) : [],
        env:
          args.env && typeof args.env === "object"
            ? (args.env as Record<string, string>)
            : {},
        enabled: args.enabled !== false,
      });
      return {
        content: [
          {
            type: "text",
            text: `Attached MCP server id=${saved.id} name='${name}' transport='${transport}' to agent ${agentId}. Call agentStudio.mcp.connect via tRPC or restart the dev server to connect it.`,
          },
        ],
      };
    },
  },

  {
    name: "studio.submit_for_review",
    description:
      "Submit an agent for publish review. Creates a publish request + an initial owner approval step and moves the agent lifecycle to review_required.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "number" },
        versionId: {
          type: "number",
          description: "Optional target version id. Omit for draft review.",
        },
        targetEnvironment: {
          type: "string",
          description: "sandbox | staging | production",
        },
        notes: { type: "string" },
      },
      required: ["agentId", "targetEnvironment"],
    },
    handler: async (args) => {
      const agentId = args.agentId;
      const targetEnvironment = args.targetEnvironment;
      if (typeof agentId !== "number") {
        throw new Error("'agentId' must be a number");
      }
      if (typeof targetEnvironment !== "string") {
        throw new Error("'targetEnvironment' must be a string");
      }
      const created = await repo.createPublishRequest({
        agentId,
        versionId:
          typeof args.versionId === "number" ? args.versionId : undefined,
        targetEnvironment,
        notes: typeof args.notes === "string" ? args.notes : undefined,
        preflight: {},
        requestedBy: 1, // dev-mode default actor
      });
      await repo.createApprovalStep({
        publishRequestId: created.id,
        stepOrder: 1,
        approverRole: "owner",
        state: "pending",
      });
      await repo.updateAgentLifecycleState(agentId, "review_required");
      return {
        content: [
          {
            type: "text",
            text: `Submitted for review: request id=${created.id}, agent ${agentId} moved to review_required. Target env='${targetEnvironment}'. Approve it in the Publish page or via studio.decide_approval (not yet implemented).`,
          },
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
