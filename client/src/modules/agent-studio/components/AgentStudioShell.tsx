/**
 * AI Agent Studio — Main Shell (IBM-style standalone module)
 *
 * Layout zones:
 *   ┌──────────┬──────────────────────────────────┬──────────┐
 *   │          │  Top Action Bar                  │          │
 *   │          ├──────────────────────────────────┤          │
 *   │ Sidebar  │                                  │ Right    │
 *   │ (S1)     │  Center Workspace                │ Oversight│
 *   │          │                                  │ Drawer   │
 *   │          ├──────────────────────────────────┤          │
 *   │          │  Bottom Status Bar               │          │
 *   └──────────┴──────────────────────────────────┴──────────┘
 *
 * Routing model:
 *   /agent-studio                       → home (no agent context)
 *   /agent-studio/new                   → new agent page
 *   /agent-studio/templates             → home with templates filter
 *   /agent-studio/import                → home with import dialog
 *   /agent-studio/:id                   → redirects to /:id/overview
 *   /agent-studio/:id/<section>         → agent detail pages
 */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import AgentStudioSidebar, { type AgentStudioView } from "./AgentStudioSidebar";
import AgentStudioTopBar from "./AgentStudioTopBar";
import AgentStudioOversightDrawer from "./AgentStudioOversightDrawer";
import AgentStudioStatusBar from "./AgentStudioStatusBar";

const AgentStudioHomePage = lazy(() => import("../pages/AgentStudioHomePage"));
const AgentStudioNewPage = lazy(() => import("../pages/AgentStudioNewPage"));
const AgentOverviewPage = lazy(() => import("../pages/AgentOverviewPage"));
const AgentIdentityPage = lazy(() => import("../pages/AgentIdentityPage"));
const AgentBehaviorPage = lazy(() => import("../pages/AgentBehaviorPage"));
const AgentPromptsPage = lazy(() => import("../pages/AgentPromptsPage"));
const AgentToolsPage = lazy(() => import("../pages/AgentToolsPage"));
const AgentKnowledgePage = lazy(() => import("../pages/AgentKnowledgePage"));
const AgentMemoryPage = lazy(() => import("../pages/AgentMemoryPage"));
const AgentWorkflowsPage = lazy(() => import("../pages/AgentWorkflowsPage"));
const AgentGovernancePage = lazy(() => import("../pages/AgentGovernancePage"));
const AgentSimulationPage = lazy(() => import("../pages/AgentSimulationPage"));
const AgentTestingPage = lazy(() => import("../pages/AgentTestingPage"));
const AgentRunsPage = lazy(() => import("../pages/AgentRunsPage"));
const AgentVersionsPage = lazy(() => import("../pages/AgentVersionsPage"));
const AgentPublishPage = lazy(() => import("../pages/AgentPublishPage"));
// Phase 0d: openllm-agent2 native parity pages
const AgentRuntimePage = lazy(() => import("../pages/AgentRuntimePage"));
// Plan v3 Phase 14: provider/model binding picker
const AgentBindingPage = lazy(() => import("../pages/AgentBindingPage"));
// Phase 0e: openllm-agent2 native parity pages
const AgentHooksPage = lazy(() => import("../pages/AgentHooksPage"));
const AgentMcpPage = lazy(() => import("../pages/AgentMcpPage"));
const AgentSubagentsPage = lazy(() => import("../pages/AgentSubagentsPage"));
// RAC P11 — capability pack + retrieval-augmented context inspector
const RacPage = lazy(() => import("../pages/RacPage"));
const RetrofitPage = lazy(() => import("../pages/RetrofitPage"));
// ── Phase 13e: Catalog (global pages, no agent context) ──
const AgentSkillCatalogPage = lazy(() => import("../pages/AgentSkillCatalogPage"));
const AgentToolCatalogPage = lazy(() => import("../pages/AgentToolCatalogPage"));
// ── Phase 14c: Marketplace (global page, no agent context) ──
const AgentMarketplacePage = lazy(() => import("../pages/AgentMarketplacePage"));
// ── Phase 19 follow-up: Global MCP Manager (no agent context) ──
const AgentMcpManagerPage = lazy(() => import("../pages/AgentMcpManagerPage"));
const GraphWorkspacePage = lazy(() => import("../pages/GraphWorkspacePage"));
// V1+ 15-δ slice (PR-V1-83): Vault Attachments admin page.
const VaultAttachmentsPage = lazy(() => import("../pages/VaultAttachmentsPage"));
// V1+ 16-δ slice (PR-V1-85): Vault Saved Views admin page.
const VaultSavedViewsPage = lazy(() => import("../pages/VaultSavedViewsPage"));
// V1+ 17-γ slice (PR-V1-86): Canvas projection events drain page.
const CanvasProjectionEventsDrainPage = lazy(
  () => import("../pages/CanvasProjectionEventsDrainPage"),
);
// V2 Phase MR-1 Phase-2 (PR-V1-157): region admin page.
const RegionAdminPage = lazy(() => import("../pages/RegionAdminPage"));
// ── Phase 19 follow-up: Multi-turn Chat (per-agent) ──
const AgentChatPage = lazy(() => import("../pages/AgentChatPage"));

interface ParsedRoute {
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
  "simulation",
  "testing",
  "runs",
  "versions",
  "publish",
  // Phase 0d-f: openllm-agent2 native parity views
  "runtime",
  "hooks",
  "mcp",
  "subagents",
  // RAC P11
  "rac",
  // Retrofit P12
  "retrofit",
];

function parseRoute(path: string): ParsedRoute {
  const empty: ParsedRoute = {
    agentId: null,
    view: "home",
    runId: null,
    versionsSubview: null,
    homeMode: null,
    needsOverviewRedirect: false,
    invalidAgentSegment: false,
  };

  // /agent-studio
  if (path === "/agent-studio" || path === "/agent-studio/") {
    return { ...empty, homeMode: "list" };
  }
  // Literal home-mode sub-routes (no agent context)
  if (path.startsWith("/agent-studio/new")) {
    return { ...empty, view: "new", homeMode: null };
  }
  if (path.startsWith("/agent-studio/templates")) {
    return { ...empty, homeMode: "templates" };
  }
  if (path.startsWith("/agent-studio/import")) {
    return { ...empty, homeMode: "import" };
  }
  // ── Phase 13e: Catalog (global, no agent context) ──
  if (path.startsWith("/agent-studio/catalog/skills")) {
    return { ...empty, view: "catalog-skills" as any, homeMode: null };
  }
  if (path.startsWith("/agent-studio/catalog/tools")) {
    return { ...empty, view: "catalog-tools" as any, homeMode: null };
  }
  if (path.startsWith("/agent-studio/catalog")) {
    // Bare /catalog → redirect to skills as the default landing
    return { ...empty, view: "catalog-skills" as any, homeMode: null };
  }
  // ── Phase 14c: Marketplace (global, no agent context) ──
  if (path.startsWith("/agent-studio/marketplace")) {
    return { ...empty, view: "marketplace" as any, homeMode: null };
  }
  // ── Phase 19 follow-up: Global MCP Manager (no agent context) ──
  if (path.startsWith("/agent-studio/mcp-manager")) {
    return { ...empty, view: "mcp-manager" as any, homeMode: null };
  }
  // ── Phase 13 §7: Native Graph Workspace observability (no agent context) ──
  if (path.startsWith("/agent-studio/graph-workspace")) {
    return { ...empty, view: "graph-workspace" as any, homeMode: null };
  }
  // ── V1+ 15-δ slice (PR-V1-83): Vault Attachments admin (no agent context) ──
  if (path.startsWith("/agent-studio/vault-attachments")) {
    return { ...empty, view: "vault-attachments" as any, homeMode: null };
  }
  // ── V1+ 16-δ slice (PR-V1-85): Vault Saved Views admin (no agent context) ──
  if (path.startsWith("/agent-studio/vault-saved-views")) {
    return { ...empty, view: "vault-saved-views" as any, homeMode: null };
  }
  // ── V1+ 17-γ slice (PR-V1-86): Canvas projection drain status (no agent context) ──
  if (path.startsWith("/agent-studio/canvas-projection-events-drain")) {
    return {
      ...empty,
      view: "canvas-projection-events-drain" as any,
      homeMode: null,
    };
  }
  // ── V2 Phase MR-1 Phase-2 (PR-V1-157): region admin (no agent context) ──
  if (path.startsWith("/agent-studio/region-admin")) {
    return { ...empty, view: "region-admin" as any, homeMode: null };
  }

  // /agent-studio/:id[/<section>[/<extra>]]
  const m = path.match(/^\/agent-studio\/(\d+)(?:\/([a-z-]+))?(?:\/([a-zA-Z0-9-]+))?/);
  if (!m) {
    // Path doesn't match the numeric-id pattern but is under /agent-studio/.
    // Could be /agent-studio/abc — surface as "agent not found".
    if (/^\/agent-studio\/[^/]+/.test(path)) {
      return { ...empty, invalidAgentSegment: true };
    }
    return empty;
  }

  const id = parseInt(m[1], 10);
  const sectionRaw = m[2];
  const extra = m[3];
  // When section was missing from the URL, we render overview but flag the
  // redirect so the shell pushes /overview into the URL bar.
  const sectionFromUrl = sectionRaw ?? "overview";
  const section = VALID_AGENT_VIEWS.includes(sectionFromUrl as AgentStudioView)
    ? (sectionFromUrl as AgentStudioView)
    : "overview";
  const needsOverviewRedirect = sectionRaw === undefined;

  // /agent-studio/:id/runs/:runId
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

  // /agent-studio/:id/versions/compare
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

export default function AgentStudioShell() {
  const [location, navigate] = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const parsed = useMemo(() => parseRoute(location), [location]);
  const {
    agentId,
    view,
    runId,
    versionsSubview,
    homeMode,
    needsOverviewRedirect,
    invalidAgentSegment,
  } = parsed;

  // Spec requirement: /agent-studio/:agentId redirects to /overview so the
  // URL is canonical and shareable. We render the overview page anyway, but
  // the URL bar gets the explicit /overview suffix on next tick.
  useEffect(() => {
    if (needsOverviewRedirect && agentId !== null) {
      navigate(`/agent-studio/${agentId}/overview`, { replace: true });
    }
  }, [needsOverviewRedirect, agentId, navigate]);

  // Shell summary query (only when in agent context)
  const shellQuery = trpc.agentStudio.shell.getShellSummary.useQuery(
    { agentId: agentId ?? 0 },
    { enabled: agentId !== null }
  );

  const shell = shellQuery.data;
  const agentContext = agentId !== null;

  // Mutations for top-bar actions
  const createVersionMut = trpc.agentStudio.versions.create.useMutation({
    onSuccess: (v) => toast.success(`Version v${(v as any).versionNumber} created`),
    onError: (e) => toast.error(e.message),
  });
  const runSimMut = trpc.agentStudio.simulation.run.useMutation({
    onSuccess: () => {
      toast.success("Simulation completed");
      shellQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  // Publish is handled by navigating to the Publish page (which collects
  // version + environment and runs the mutation there). The shell does not
  // call publishVersion directly to avoid sending invalid versionId.

  const handleNavigate = (key: AgentStudioView) => {
    // Phase 13e: catalog routes are global (no agent context). Always
    // navigate to /agent-studio/catalog/* regardless of which view we
    // were in before — clicking "Skills Catalog" from inside an agent
    // detail page should still take you to the global catalog.
    if (key === "catalog-skills") {
      navigate("/agent-studio/catalog/skills");
      return;
    }
    if (key === "catalog-tools") {
      navigate("/agent-studio/catalog/tools");
      return;
    }
    if (key === "marketplace") {
      navigate("/agent-studio/marketplace");
      return;
    }
    if (key === "mcp-manager") {
      navigate("/agent-studio/mcp-manager");
      return;
    }
    // V1+ 15-δ slice (PR-V1-84): vault-attachments is a global view.
    if ((key as string) === "vault-attachments") {
      navigate("/agent-studio/vault-attachments");
      return;
    }
    // V1+ 16-δ slice (PR-V1-85): vault-saved-views is a global view.
    if ((key as string) === "vault-saved-views") {
      navigate("/agent-studio/vault-saved-views");
      return;
    }
    // V1+ 17-γ slice (PR-V1-86): canvas-projection-events-drain is global.
    if ((key as string) === "canvas-projection-events-drain") {
      navigate("/agent-studio/canvas-projection-events-drain");
      return;
    }
    if (!agentContext) {
      // Home-context nav
      if (key === "home") navigate("/agent-studio");
      else if (key === "new") navigate("/agent-studio/new");
      return;
    }
    navigate(`/agent-studio/${agentId}/${key}`);
  };

  const renderContent = () => {
    // Invalid agent segment in URL (e.g. /agent-studio/abc) — show clear
    // not-found state instead of silently rendering home.
    if (invalidAgentSegment) {
      return (
        <div className="p-12 text-center space-y-2">
          <h2 className="text-base font-semibold">Agent not found</h2>
          <p className="text-xs text-muted-foreground">
            The URL doesn't reference a valid agent id.
          </p>
          <button
            onClick={() => navigate("/agent-studio")}
            className="text-xs underline text-primary"
          >
            ← Back to all agents
          </button>
        </div>
      );
    }
    // Shell summary query returned NOT_FOUND (agent id is numeric but the
    // row doesn't exist).
    if (agentContext && shellQuery.error) {
      return (
        <div className="p-12 text-center space-y-2">
          <h2 className="text-base font-semibold">Agent not found</h2>
          <p className="text-xs text-muted-foreground">{shellQuery.error.message}</p>
          <button
            onClick={() => navigate("/agent-studio")}
            className="text-xs underline text-primary"
          >
            ← Back to all agents
          </button>
        </div>
      );
    }
    if (!agentContext) {
      switch (view) {
        case "new":
          return <AgentStudioNewPage />;
        // ── Phase 13e: global catalog pages ──
        case "catalog-skills" as any:
          return <AgentSkillCatalogPage />;
        case "catalog-tools" as any:
          return <AgentToolCatalogPage />;
        // ── Phase 14c: marketplace (global) ──
        case "marketplace" as any:
          return <AgentMarketplacePage />;
        // ── Phase 19 follow-up: MCP Manager (global) ──
        case "mcp-manager" as any:
          return <AgentMcpManagerPage />;
        // ── Phase 13 §7: Native Graph Workspace observability ──
        case "graph-workspace" as any:
          return <GraphWorkspacePage />;
        // ── V1+ 15-δ slice (PR-V1-83): Vault Attachments admin ──
        case "vault-attachments" as any:
          return <VaultAttachmentsPage />;
        // ── V1+ 16-δ slice (PR-V1-85): Vault Saved Views admin ──
        case "vault-saved-views" as any:
          return <VaultSavedViewsPage />;
        // ── V1+ 17-γ slice (PR-V1-86): Canvas projection drain ──
        case "canvas-projection-events-drain" as any:
          return <CanvasProjectionEventsDrainPage />;
        // ── V2 Phase MR-1 Phase-2 (PR-V1-157): region admin ──
        case "region-admin" as any:
          return <RegionAdminPage />;
        default:
          return <AgentStudioHomePage homeMode={homeMode ?? "list"} />;
      }
    }
    switch (view) {
      case "overview":
        return <AgentOverviewPage agentId={agentId!} />;
      case "identity":
        return <AgentIdentityPage agentId={agentId!} />;
      case "behavior":
        return <AgentBehaviorPage agentId={agentId!} />;
      case "prompts":
        return <AgentPromptsPage agentId={agentId!} />;
      case "tools":
        return <AgentToolsPage agentId={agentId!} />;
      case "knowledge":
        return <AgentKnowledgePage agentId={agentId!} />;
      case "memory":
        return <AgentMemoryPage agentId={agentId!} />;
      case "workflows":
        return <AgentWorkflowsPage agentId={agentId!} />;
      case "governance":
        return <AgentGovernancePage agentId={agentId!} />;
      case "chat":
        return <AgentChatPage agentId={agentId!} />;
      case "simulation":
        return <AgentSimulationPage agentId={agentId!} />;
      case "testing":
        return <AgentTestingPage agentId={agentId!} />;
      case "runs":
        return <AgentRunsPage agentId={agentId!} runId={runId} />;
      case "versions":
        return (
          <AgentVersionsPage
            agentId={agentId!}
            initialMode={versionsSubview ?? "list"}
          />
        );
      case "publish":
        return <AgentPublishPage agentId={agentId!} />;
      // ── Phase 0d: Runtime config page ──
      case "runtime":
        return <AgentRuntimePage agentId={agentId!} />;
      // Plan v3 Phase 14: provider/model binding picker
      case "binding":
        return <AgentBindingPage agentId={agentId!} />;
      // ── Phase 0e: Hooks / MCP / Subagents pages ──
      case "hooks":
        return <AgentHooksPage agentId={agentId!} />;
      case "mcp":
        return <AgentMcpPage agentId={agentId!} />;
      case "subagents":
        return <AgentSubagentsPage agentId={agentId!} />;
      // RAC P11 — capability pack + retrieval-augmented context.
      case "rac":
        return <RacPage agentId={agentId!} />;
      // Retrofit P12 — Universal KB / Tool Knowledge / Approvals.
      case "retrofit":
        return <RetrofitPage agentId={agentId!} />;
      default:
        return <AgentOverviewPage agentId={agentId!} />;
    }
  };

  /**
   * Top-bar Publish — navigates to the Publish page rather than firing the
   * mutation directly. Publishing requires picking a target version and
   * environment, which only the Publish page can collect safely.
   */
  const handlePublish = () => {
    if (!agentId) return;
    navigate(`/agent-studio/${agentId}/publish`);
  };

  return (
    <>
      {/* S1 Sidebar */}
      <AgentStudioSidebar
        active={view}
        onNavigate={handleNavigate}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        agentContext={agentContext}
        agentName={shell?.agent?.name}
      />

      {/* Center column: top bar + content + status bar */}
      <div className="flex-1 min-w-0 flex flex-col h-full">
        {agentContext && shell?.agent && (
          <AgentStudioTopBar
            agentName={shell.agent.name}
            agentClass={shell.agent.agentClass ?? "assistant"}
            lifecycleState={shell.agent.lifecycleState}
            environment={shell.agent.environment ?? "draft"}
            saving={runSimMut.isPending || createVersionMut.isPending}
            onSaveDraft={() => {
              // Sections auto-save on form submit; this button forces a
              // shell-summary refresh so the user gets visible confirmation
              // that the displayed state is current.
              shellQuery.refetch();
              toast.success("Refreshed");
            }}
            onRunSimulation={() =>
              runSimMut.mutate({ agentId, toggles: { mockedTools: true, sandboxMemory: true, strictPolicy: true } })
            }
            onRunTest={() => navigate(`/agent-studio/${agentId}/testing`)}
            onCompareVersion={() => navigate(`/agent-studio/${agentId}/versions/compare`)}
            onCreateVersion={() => {
              const label = prompt("Version label?");
              if (label) createVersionMut.mutate({ agentId, label });
            }}
            onPublish={handlePublish}
          />
        )}

        <div className="flex-1 min-h-0 overflow-auto">
          <Suspense
            fallback={
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            }
          >
            {renderContent()}
          </Suspense>
        </div>

        {agentContext && shell?.agent && (
          <AgentStudioStatusBar
            lastSaved={shell.draft?.updatedAt}
            validationState={
              shell.readiness?.blockers.length
                ? "error"
                : shell.readiness?.warnings.length
                  ? "warning"
                  : "ok"
            }
            simulationState={shell.latestSimulation?.status ?? "—"}
            version={`draft (#${shell.draft?.id ?? "—"})`}
            environment={shell.agent.environment ?? "draft"}
            policyState={(shell.governance?.verdict ?? "pass") as "pass" | "warning" | "blocked"}
            unsavedChanges={false}
          />
        )}
      </div>

      {/* Right Oversight Drawer (only in agent context) */}
      {agentContext && (
        <AgentStudioOversightDrawer
          readiness={shell?.readiness}
          governance={shell?.governance}
          latestSimulation={shell?.latestSimulation}
          latestTest={shell?.latestTest}
        />
      )}
    </>
  );
}
