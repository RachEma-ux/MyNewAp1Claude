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

/**
 * Phase 0c: Real openllm-agent2 tool catalog — 51 tools (36 core + 15 feature-gated).
 *
 * Source: openllm-agent2 `SkillsTools.md` + `src/tools/` directory inspection.
 * Each entry uses the openllm-agent2 tool name as the key (capitalized) so
 * imported agent definitions match 1:1.
 *
 * The previous 12 generic placeholders (http_request, db_query, file_read,
 * etc.) remain at the bottom as **legacy aliases** so any pre-existing tool
 * bindings keep resolving — they're marked with a `(legacy)` suffix in the
 * description so it's obvious in the catalog UI which to prefer.
 */
const CATALOG: ToolCatalogEntry[] = [
  // ── Core tools (always available) — 36 tools ──

  // Filesystem
  {
    key: "Read",
    name: "Read",
    description: "Read a file from the local filesystem",
    category: "filesystem",
    destructive: false,
    defaultAllowedActions: ["read"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "Write",
    name: "Write",
    description: "Write/create a file on the local filesystem",
    category: "filesystem",
    destructive: true,
    defaultAllowedActions: ["write"],
    hardBlockedActions: [],
    defaultRequiresApproval: true,
  },
  {
    key: "Edit",
    name: "Edit",
    description: "Modify existing files with diff-based replacements",
    category: "filesystem",
    destructive: true,
    defaultAllowedActions: ["edit"],
    hardBlockedActions: [],
    defaultRequiresApproval: true,
  },
  {
    key: "Glob",
    name: "Glob",
    description: "Fast file pattern matching (e.g. `**/*.ts`)",
    category: "filesystem",
    destructive: false,
    defaultAllowedActions: ["match"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "NotebookEdit",
    name: "NotebookEdit",
    description: "Edit cells in a Jupyter notebook",
    category: "filesystem",
    destructive: true,
    defaultAllowedActions: ["edit_cell"],
    hardBlockedActions: [],
    defaultRequiresApproval: true,
  },
  {
    key: "EnterWorktree",
    name: "EnterWorktree",
    description: "Create an isolated git worktree for safe changes",
    category: "filesystem",
    destructive: false,
    defaultAllowedActions: ["create_worktree"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "ExitWorktree",
    name: "ExitWorktree",
    description: "Exit worktree and restore original directory",
    category: "filesystem",
    destructive: false,
    defaultAllowedActions: ["exit_worktree"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },

  // Compute
  {
    key: "Bash",
    name: "Bash",
    description: "Execute shell commands in the local environment",
    category: "compute",
    destructive: true,
    defaultAllowedActions: ["execute"],
    hardBlockedActions: ["execute_root", "execute_sudo"],
    defaultRequiresApproval: true,
  },
  {
    key: "Agent",
    name: "Agent",
    description: "Launch a new sub-agent for parallel/complex tasks",
    category: "compute",
    destructive: false,
    defaultAllowedActions: ["spawn"],
    hardBlockedActions: [],
    defaultRequiresApproval: true,
  },
  {
    key: "TeamCreate",
    name: "TeamCreate",
    description: "Create a team for coordinating multiple agents",
    category: "compute",
    destructive: false,
    defaultAllowedActions: ["create_team"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "TeamDelete",
    name: "TeamDelete",
    description: "Clean up a team when the swarm is complete",
    category: "compute",
    destructive: true,
    defaultAllowedActions: ["delete_team"],
    hardBlockedActions: [],
    defaultRequiresApproval: true,
  },
  {
    key: "TaskCreate",
    name: "TaskCreate",
    description: "Create a new task in the task list",
    category: "compute",
    destructive: false,
    defaultAllowedActions: ["create"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "TaskList",
    name: "TaskList",
    description: "List all tasks",
    category: "compute",
    destructive: false,
    defaultAllowedActions: ["list"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "TaskGet",
    name: "TaskGet",
    description: "Get a task by ID",
    category: "compute",
    destructive: false,
    defaultAllowedActions: ["get"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "TaskUpdate",
    name: "TaskUpdate",
    description: "Update a task's status or content",
    category: "compute",
    destructive: false,
    defaultAllowedActions: ["update"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "TaskStop",
    name: "TaskStop",
    description: "Stop a running background task",
    category: "compute",
    destructive: true,
    defaultAllowedActions: ["stop"],
    hardBlockedActions: [],
    defaultRequiresApproval: true,
  },
  {
    key: "TaskOutput",
    name: "TaskOutput",
    description: "Access the output file of a task",
    category: "compute",
    destructive: false,
    defaultAllowedActions: ["read_output"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "EnterPlanMode",
    name: "EnterPlanMode",
    description: "Enter plan mode for complex multi-step tasks",
    category: "compute",
    destructive: false,
    defaultAllowedActions: ["enter_plan"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "ExitPlanMode",
    name: "ExitPlanMode",
    description: "Exit plan mode and proceed with execution",
    category: "compute",
    destructive: false,
    defaultAllowedActions: ["exit_plan"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "Config",
    name: "Config",
    description: "Get or set Claude Code / OpenLLM configuration",
    category: "compute",
    destructive: true,
    defaultAllowedActions: ["get"],
    hardBlockedActions: [],
    defaultRequiresApproval: true,
  },
  {
    key: "Skill",
    name: "Skill",
    description: "Invoke a slash command or skill",
    category: "compute",
    destructive: false,
    defaultAllowedActions: ["invoke"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "SyntheticOutputTool",
    name: "SyntheticOutput",
    description: "Return structured output in a requested format",
    category: "compute",
    destructive: false,
    defaultAllowedActions: ["emit"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },

  // Communication
  {
    key: "SendMessage",
    name: "SendMessage",
    description: "Send a message to another running agent",
    category: "communication",
    destructive: false,
    defaultAllowedActions: ["send"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "AskUserQuestion",
    name: "AskUserQuestion",
    description: "Ask the user multiple choice questions",
    category: "communication",
    destructive: false,
    defaultAllowedActions: ["ask"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "Brief",
    name: "Brief",
    description: "Send a status update to the user",
    category: "communication",
    destructive: false,
    defaultAllowedActions: ["emit"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },

  // Network
  {
    key: "WebFetch",
    name: "WebFetch",
    description: "Fetch and analyze content from a URL",
    category: "network",
    destructive: false,
    defaultAllowedActions: ["GET"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "RemoteTrigger",
    name: "RemoteTrigger",
    description: "Manage scheduled remote agents via API",
    category: "network",
    destructive: true,
    defaultAllowedActions: ["list", "trigger"],
    hardBlockedActions: ["delete_all"],
    defaultRequiresApproval: true,
  },
  {
    key: "CronCreate",
    name: "CronCreate",
    description: "Create a cron-scheduled recurring task",
    category: "compute",
    destructive: false,
    defaultAllowedActions: ["create"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "CronDelete",
    name: "CronDelete",
    description: "Delete a cron-scheduled task",
    category: "compute",
    destructive: true,
    defaultAllowedActions: ["delete"],
    hardBlockedActions: [],
    defaultRequiresApproval: true,
  },
  {
    key: "CronList",
    name: "CronList",
    description: "List all cron-scheduled tasks",
    category: "compute",
    destructive: false,
    defaultAllowedActions: ["list"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },

  // Search
  {
    key: "Grep",
    name: "Grep",
    description: "Search file contents using ripgrep regex",
    category: "search",
    destructive: false,
    defaultAllowedActions: ["search"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "WebSearch",
    name: "WebSearch",
    description: "Search the internet for current information",
    category: "search",
    destructive: false,
    defaultAllowedActions: ["search"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "LSP",
    name: "LSP",
    description: "Language Server Protocol — code intelligence (go-to-def, references)",
    category: "search",
    destructive: false,
    defaultAllowedActions: ["lookup"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "ListMcpResources",
    name: "ListMcpResources",
    description: "List available resources from MCP servers",
    category: "search",
    destructive: false,
    defaultAllowedActions: ["list"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "ReadMcpResource",
    name: "ReadMcpResource",
    description: "Read a specific resource from an MCP server",
    category: "search",
    destructive: false,
    defaultAllowedActions: ["read"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "ToolSearch",
    name: "ToolSearch",
    description: "Search for deferred/lazy-loaded tools by keyword",
    category: "search",
    destructive: false,
    defaultAllowedActions: ["search"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },

  // ── Feature-gated tools (when enabled) — 15 tools ──
  {
    key: "PowerShell",
    name: "PowerShell",
    description: "Execute PowerShell commands (Windows)",
    category: "compute",
    destructive: true,
    defaultAllowedActions: ["execute"],
    hardBlockedActions: ["execute_admin"],
    defaultRequiresApproval: true,
  },
  {
    key: "REPL",
    name: "REPL",
    description: "Run code in an interactive REPL environment",
    category: "compute",
    destructive: true,
    defaultAllowedActions: ["execute"],
    hardBlockedActions: [],
    defaultRequiresApproval: true,
  },
  {
    key: "WebBrowser",
    name: "WebBrowser",
    description: "Web browser automation",
    category: "network",
    destructive: true,
    defaultAllowedActions: ["navigate", "click", "type"],
    hardBlockedActions: [],
    defaultRequiresApproval: true,
  },
  {
    key: "Sleep",
    name: "Sleep",
    description: "Pause execution for a duration",
    category: "compute",
    destructive: false,
    defaultAllowedActions: ["sleep"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "Monitor",
    name: "Monitor",
    description: "Monitor tool for background observation",
    category: "compute",
    destructive: false,
    defaultAllowedActions: ["watch"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "PushNotification",
    name: "PushNotification",
    description: "Send push notifications to the user",
    category: "communication",
    destructive: false,
    defaultAllowedActions: ["send"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "SendUserFile",
    name: "SendUserFile",
    description: "Send a file to the user",
    category: "communication",
    destructive: false,
    defaultAllowedActions: ["send"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "SubscribePR",
    name: "SubscribePR",
    description: "Subscribe to GitHub PR webhooks",
    category: "network",
    destructive: false,
    defaultAllowedActions: ["subscribe"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "TerminalCapture",
    name: "TerminalCapture",
    description: "Capture terminal output",
    category: "compute",
    destructive: false,
    defaultAllowedActions: ["capture"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "Snip",
    name: "Snip",
    description: "Snip/compact conversation history",
    category: "compute",
    destructive: false,
    defaultAllowedActions: ["snip"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "ListPeers",
    name: "ListPeers",
    description: "List peer agents in a swarm",
    category: "search",
    destructive: false,
    defaultAllowedActions: ["list"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "Workflow",
    name: "Workflow",
    description: "Execute workflow scripts",
    category: "compute",
    destructive: true,
    defaultAllowedActions: ["execute"],
    hardBlockedActions: [],
    defaultRequiresApproval: true,
  },
  {
    key: "VerifyPlanExecution",
    name: "VerifyPlanExecution",
    description: "Verify plan was executed correctly",
    category: "compute",
    destructive: false,
    defaultAllowedActions: ["verify"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "SuggestBackgroundPR",
    name: "SuggestBackgroundPR",
    description: "Suggest background PR changes",
    category: "communication",
    destructive: false,
    defaultAllowedActions: ["suggest"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "CtxInspect",
    name: "CtxInspect",
    description: "Inspect context window state",
    category: "compute",
    destructive: false,
    defaultAllowedActions: ["inspect"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },

  // ── Legacy aliases (12 generic entries from Phase 1) ──
  // Kept so any pre-existing tool bindings continue to resolve. Marked
  // "(legacy)" so the catalog UI can recommend the openllm equivalents.
  {
    key: "http_request",
    name: "HTTP Request (legacy)",
    description: "Generic HTTP GET — prefer WebFetch",
    category: "network",
    destructive: false,
    defaultAllowedActions: ["GET"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "http_request_write",
    name: "HTTP Request Write (legacy)",
    description: "Generic HTTP POST — prefer dedicated tools",
    category: "network",
    destructive: true,
    defaultAllowedActions: ["POST"],
    hardBlockedActions: [],
    defaultRequiresApproval: true,
  },
  {
    key: "db_query",
    name: "Database Query (legacy)",
    description: "Read-only DB query — prefer dedicated DB tools",
    category: "data",
    destructive: false,
    defaultAllowedActions: ["SELECT"],
    hardBlockedActions: ["DROP", "TRUNCATE", "DELETE", "ALTER"],
    defaultRequiresApproval: false,
  },
  {
    key: "db_mutate",
    name: "Database Mutation (legacy)",
    description: "DB write — prefer dedicated DB tools",
    category: "data",
    destructive: true,
    defaultAllowedActions: ["INSERT", "UPDATE"],
    hardBlockedActions: ["DROP", "TRUNCATE"],
    defaultRequiresApproval: true,
  },
  {
    key: "file_read",
    name: "File Read (legacy)",
    description: "Generic file read — prefer Read",
    category: "filesystem",
    destructive: false,
    defaultAllowedActions: ["read"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "file_write",
    name: "File Write (legacy)",
    description: "Generic file write — prefer Write",
    category: "filesystem",
    destructive: true,
    defaultAllowedActions: ["write"],
    hardBlockedActions: [],
    defaultRequiresApproval: true,
  },
  {
    key: "send_email",
    name: "Send Email (legacy)",
    description: "Generic email — no openllm equivalent",
    category: "communication",
    destructive: false,
    defaultAllowedActions: ["send"],
    hardBlockedActions: ["bulk_send"],
    defaultRequiresApproval: false,
  },
  {
    key: "send_chat",
    name: "Send Chat Message (legacy)",
    description: "Generic chat message — prefer SendMessage",
    category: "communication",
    destructive: false,
    defaultAllowedActions: ["post"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "code_exec",
    name: "Code Execution (legacy)",
    description: "Generic code exec — prefer Bash or REPL",
    category: "compute",
    destructive: false,
    defaultAllowedActions: ["exec_python", "exec_bash"],
    hardBlockedActions: ["exec_root"],
    defaultRequiresApproval: true,
  },
  {
    key: "vector_search",
    name: "Vector Search (legacy)",
    description: "Generic vector search — no direct openllm equivalent",
    category: "search",
    destructive: false,
    defaultAllowedActions: ["query"],
    hardBlockedActions: [],
    defaultRequiresApproval: false,
  },
  {
    key: "graph_query",
    name: "Graph Query (legacy)",
    description: "Generic graph query — no direct openllm equivalent",
    category: "search",
    destructive: false,
    defaultAllowedActions: ["match"],
    hardBlockedActions: ["delete", "create"],
    defaultRequiresApproval: false,
  },
  {
    key: "web_search",
    name: "Web Search (legacy)",
    description: "Generic web search — prefer WebSearch",
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
