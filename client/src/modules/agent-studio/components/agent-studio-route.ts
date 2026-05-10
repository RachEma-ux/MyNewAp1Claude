/**
 * AI Agent Studio — URL grammar.
 *
 * Pure helpers for parsing `/agent-studio/...` paths. Extracted from
 * AgentStudioShell.tsx so the grammar can be unit-tested without
 * dragging in React, wouter, tRPC, or any of the lazy-loaded page
 * modules.
 *
 * Routing rules (mirrors AgentStudioShell JSDoc):
 *   /agent-studio                       → home
 *   /agent-studio/new                   → new agent page
 *   /agent-studio/templates             → home with templates filter
 *   /agent-studio/import                → home with import dialog
 *   /agent-studio/:id                   → redirects to /:id/overview
 *   /agent-studio/:id/<section>         → agent detail pages
 *
 * The canonical click target from the AS LIST is
 *   `/agent-studio/${agent.id}/overview`
 * The bare-id form is also accepted but flagged with
 * `needsOverviewRedirect` so the shell pushes the canonical URL.
 */

/**
 * View identifiers used by the AS sidebar + URL grammar. Mirrors
 * `AgentStudioSidebar.AgentStudioView`. We define the union locally to
 * keep this module pure-TS — pulling the type from the sidebar would
 * drag the React/lucide module into vitest's transform, slowing test
 * boot for no benefit.
 */
export type AgentStudioView =
  | "home"
  | "new"
  | "overview"
  | "identity"
  | "behavior"
  | "prompts"
  | "tools"
  | "knowledge"
  | "memory"
  | "workflows"
  | "governance"
  | "chat"
  | "simulation"
  | "testing"
  | "runs"
  | "versions"
  | "publish"
  | "runtime"
  | "binding"
  | "hooks"
  | "mcp"
  | "subagents"
  | "rac"
  | "retrofit"
  | "catalog-skills"
  | "catalog-tools"
  | "marketplace"
  | "mcp-manager";

export interface ParsedRoute {
  agentId: number | null;
  view: AgentStudioView;
  /** When view is "runs" and a specific run is selected via /runs/:runId */
  runId: number | null;
  /** When view is "versions" and the user is on /versions/compare */
  versionsSubview: "list" | "compare" | null;
  /** When view is "home" and the user requested templates or import landing */
  homeMode: "list" | "templates" | "import" | null;
  /**
   * True when the URL was bare `/agent-studio/:id` (no /section). The shell
   * uses this to push a redirect to /overview so the URL is always canonical
   * and shareable.
   */
  needsOverviewRedirect: boolean;
  /**
   * True when the URL had an `/agent-studio/:something/...` segment but
   * `:something` was not a valid numeric agent id. The shell renders a
   * not-found message instead of silently routing to home.
   */
  invalidAgentSegment: boolean;
}

const VALID_AGENT_VIEWS: AgentStudioView[] = [
  "overview",
  "identity",
  "behavior",
  "prompts",
  "tools",
  "knowledge",
  "memory",
  "workflows",
  "governance",
  "chat",
  "simulation",
  "testing",
  "runs",
  "versions",
  "publish",
  "runtime",
  "binding",
  "hooks",
  "mcp",
  "subagents",
  "rac",
  "retrofit",
];

export function parseRoute(path: string): ParsedRoute {
  const empty: ParsedRoute = {
    agentId: null,
    view: "home",
    runId: null,
    versionsSubview: null,
    homeMode: null,
    needsOverviewRedirect: false,
    invalidAgentSegment: false,
  };

  if (path === "/agent-studio" || path === "/agent-studio/") {
    return { ...empty, homeMode: "list" };
  }
  if (path.startsWith("/agent-studio/new")) {
    return { ...empty, view: "new", homeMode: null };
  }
  if (path.startsWith("/agent-studio/templates")) {
    return { ...empty, homeMode: "templates" };
  }
  if (path.startsWith("/agent-studio/import")) {
    return { ...empty, homeMode: "import" };
  }
  if (path.startsWith("/agent-studio/catalog/skills")) {
    return { ...empty, view: "catalog-skills", homeMode: null };
  }
  if (path.startsWith("/agent-studio/catalog/tools")) {
    return { ...empty, view: "catalog-tools", homeMode: null };
  }
  if (path.startsWith("/agent-studio/catalog")) {
    return { ...empty, view: "catalog-skills", homeMode: null };
  }
  if (path.startsWith("/agent-studio/marketplace")) {
    return { ...empty, view: "marketplace", homeMode: null };
  }
  if (path.startsWith("/agent-studio/mcp-manager")) {
    return { ...empty, view: "mcp-manager", homeMode: null };
  }

  const m = path.match(/^\/agent-studio\/(\d+)(?:\/([a-z-]+))?(?:\/([a-zA-Z0-9-]+))?/);
  if (!m) {
    if (/^\/agent-studio\/[^/]+/.test(path)) {
      return { ...empty, invalidAgentSegment: true };
    }
    return empty;
  }

  const id = parseInt(m[1], 10);
  const sectionRaw = m[2];
  const extra = m[3];
  const sectionFromUrl = sectionRaw ?? "overview";
  const section = VALID_AGENT_VIEWS.includes(sectionFromUrl as AgentStudioView)
    ? (sectionFromUrl as AgentStudioView)
    : "overview";
  const needsOverviewRedirect = sectionRaw === undefined;

  if (section === "runs" && extra && /^\d+$/.test(extra)) {
    return {
      agentId: id,
      view: "runs",
      runId: parseInt(extra, 10),
      versionsSubview: null,
      homeMode: null,
      needsOverviewRedirect: false,
      invalidAgentSegment: false,
    };
  }

  if (section === "versions" && extra === "compare") {
    return {
      agentId: id,
      view: "versions",
      runId: null,
      versionsSubview: "compare",
      homeMode: null,
      needsOverviewRedirect: false,
      invalidAgentSegment: false,
    };
  }
  if (section === "versions") {
    return {
      agentId: id,
      view: "versions",
      runId: null,
      versionsSubview: "list",
      homeMode: null,
      needsOverviewRedirect: false,
      invalidAgentSegment: false,
    };
  }

  return {
    agentId: id,
    view: section,
    runId: null,
    versionsSubview: null,
    homeMode: null,
    needsOverviewRedirect,
    invalidAgentSegment: false,
  };
}
