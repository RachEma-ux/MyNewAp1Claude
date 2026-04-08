/**
 * AI Agent Studio — Tool Catalog Adapter
 *
 * Returns the list of tools an agent can attach. This adapter is the SINGLE
 * point where the AI Agent Studio module talks to the platform's tool
 * registry. Today the catalog is static; a future revision can swap the body
 * of `listToolCatalog()` to query the platform tool registry (e.g. via an
 * `aiTypes` adapter or a dedicated registry) without changing any caller.
 *
 * Adapter contract — DO NOT change without updating callers:
 *   listToolCatalog(): Promise<ToolCatalogEntry[]>
 *   getToolCatalogEntry(key): Promise<ToolCatalogEntry | null>
 *   simulateToolCall(key, payload): Promise<SimulatedToolResult>
 */

export type ToolKind =
  | "network"
  | "data"
  | "filesystem"
  | "communication"
  | "compute"
  | "search";

export interface ToolCatalogEntry {
  key: string;
  name: string;
  description: string;
  category: ToolKind;
  /** Whether the tool can perform destructive actions (drives risk scoring) */
  destructive: boolean;
  /** Default action set if the user attaches the tool with no config */
  defaultAllowedActions: string[];
  /** Actions that can never be enabled for this tool */
  hardBlockedActions: string[];
  /** Whether the tool requires approval by default */
  defaultRequiresApproval: boolean;
}

export interface SimulatedToolResult {
  ok: boolean;
  toolKey: string;
  kind: ToolKind;
  mocked: true;
  /** Plausible structured response in the shape the real tool would return */
  result: Record<string, unknown>;
  /** Latency the real tool would have in ms (deterministic, derived from key) */
  latencyMs: number;
}

const CATALOG: ToolCatalogEntry[] = [
  {
    key: "http_request",
    name: "HTTP Request",
    description: "Make outbound HTTP calls to external APIs",
    category: "network",
    destructive: false,
    defaultAllowedActions: ["GET"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "http_request_write",
    name: "HTTP Request (Write)",
    description: "POST/PUT/PATCH/DELETE to external APIs (destructive)",
    category: "network",
    destructive: true,
    defaultAllowedActions: ["POST"],
    hardBlockedActions: [],
    defaultRequiresApproval: true,
  },
  {
    key: "db_query",
    name: "Database Query",
    description: "Read-only database queries against approved datasets",
    category: "data",
    destructive: false,
    defaultAllowedActions: ["SELECT"],
    hardBlockedActions: ["DROP", "TRUNCATE", "DELETE", "ALTER"],
    defaultRequiresApproval: false,
  },
  {
    key: "db_mutate",
    name: "Database Mutation",
    description: "Insert / update rows in approved tables (destructive)",
    category: "data",
    destructive: true,
    defaultAllowedActions: ["INSERT", "UPDATE"],
    hardBlockedActions: ["DROP", "TRUNCATE"],
    defaultRequiresApproval: true,
  },
  {
    key: "file_read",
    name: "File Read",
    description: "Read files from the workspace filesystem",
    category: "filesystem",
    destructive: false,
    defaultAllowedActions: ["read"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "file_write",
    name: "File Write",
    description: "Write files to the workspace filesystem (destructive)",
    category: "filesystem",
    destructive: true,
    defaultAllowedActions: ["write"],
    hardBlockedActions: [],
    defaultRequiresApproval: true,
  },
  {
    key: "send_email",
    name: "Send Email",
    description: "Dispatch notification emails via the platform mailer",
    category: "communication",
    destructive: false,
    defaultAllowedActions: ["send"],
    hardBlockedActions: ["bulk_send"],
    defaultRequiresApproval: false,
  },
  {
    key: "send_chat",
    name: "Send Chat Message",
    description: "Post a message to a workspace chat channel",
    category: "communication",
    destructive: false,
    defaultAllowedActions: ["post"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "code_exec",
    name: "Code Execution",
    description: "Execute code in a sandboxed runtime (compute-intensive)",
    category: "compute",
    destructive: false,
    defaultAllowedActions: ["exec_python", "exec_bash"],
    hardBlockedActions: ["exec_root"],
    defaultRequiresApproval: true,
  },
  {
    key: "vector_search",
    name: "Vector Search",
    description: "Semantic search over embedded knowledge base",
    category: "search",
    destructive: false,
    defaultAllowedActions: ["query"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "graph_query",
    name: "Graph Query",
    description: "Run a graph-DB query against the knowledge graph",
    category: "search",
    destructive: false,
    defaultAllowedActions: ["match"],
    hardBlockedActions: ["delete", "create"],
    defaultRequiresApproval: false,
  },
  {
    key: "web_search",
    name: "Web Search",
    description: "Public web search via approved search provider",
    category: "search",
    destructive: false,
    defaultAllowedActions: ["search"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
];

export async function listToolCatalog(): Promise<ToolCatalogEntry[]> {
  return CATALOG;
}

export async function getToolCatalogEntry(
  key: string
): Promise<ToolCatalogEntry | null> {
  return CATALOG.find((t) => t.key === key) ?? null;
}

/**
 * Deterministic simulated tool call. Returns a tool-kind-aware payload so
 * the simulation timeline can show the user what the real tool would
 * roughly produce. NOT a real network call.
 */
export async function simulateToolCall(
  key: string,
  payload: Record<string, unknown>
): Promise<SimulatedToolResult> {
  const entry = await getToolCatalogEntry(key);
  if (!entry) {
    return {
      ok: false,
      toolKey: key,
      kind: "compute",
      mocked: true,
      result: { error: `unknown tool: ${key}` },
      latencyMs: 0,
    };
  }
  // Deterministic latency derived from key length
  const latencyMs = 10 + (key.length * 7) % 80;
  let result: Record<string, unknown>;
  switch (entry.category) {
    case "network":
      result = {
        status: 200,
        headers: { "content-type": "application/json" },
        body: { ok: true, echo: payload },
      };
      break;
    case "data":
      result = {
        rowCount: 3,
        rows: [
          { id: 1, label: "row-1" },
          { id: 2, label: "row-2" },
          { id: 3, label: "row-3" },
        ],
      };
      break;
    case "filesystem":
      result = {
        path: (payload as any).path ?? "/sandbox/example.txt",
        bytes: 256,
        encoding: "utf8",
      };
      break;
    case "communication":
      result = { delivered: true, recipientCount: 1 };
      break;
    case "compute":
      result = {
        exitCode: 0,
        stdout: "(simulated stdout)",
        stderr: "",
      };
      break;
    case "search":
      result = {
        hitCount: 4,
        hits: [
          { id: "h1", score: 0.92, snippet: "(simulated match)" },
          { id: "h2", score: 0.81, snippet: "(simulated match)" },
          { id: "h3", score: 0.74, snippet: "(simulated match)" },
          { id: "h4", score: 0.66, snippet: "(simulated match)" },
        ],
      };
      break;
  }
  return {
    ok: true,
    toolKey: key,
    kind: entry.category,
    mocked: true,
    result,
    latencyMs,
  };
}
