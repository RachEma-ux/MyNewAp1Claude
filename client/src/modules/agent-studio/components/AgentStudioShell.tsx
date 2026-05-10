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
import { parseRoute } from "./agent-studio-route";

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
// ── Phase 19 follow-up: Multi-turn Chat (per-agent) ──
const AgentChatPage = lazy(() => import("../pages/AgentChatPage"));

// `parseRoute` + `ParsedRoute` are imported from
// `./agent-studio-route` so the URL grammar can be unit-tested
// without dragging in React, wouter, tRPC, or the lazy-loaded page
// modules. See `agent-studio-route.ts` for the canonical rules.

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
    // Shell summary query failed. We distinguish between:
    //   - NOT_FOUND: the agent row truly does not exist. Show "Agent not
    //     found" — this is the only case where that label is honest.
    //   - any other error code (INTERNAL_SERVER_ERROR, network FetchError,
    //     zod parse, etc.): the row may well exist, the call just failed.
    //     Surface the underlying TRPC error code + message so the user
    //     gets a specific diagnostic rather than a misleading banner.
    if (agentContext && shellQuery.error) {
      const trpcCode = shellQuery.error.data?.code;
      const isNotFound = trpcCode === "NOT_FOUND";
      const title = isNotFound ? "Agent not found" : "Failed to load agent shell";
      return (
        <div className="p-12 text-center space-y-2">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">
            {shellQuery.error.message}
          </p>
          {!isNotFound && trpcCode && (
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
              code · {trpcCode}
            </p>
          )}
          <div className="flex items-center justify-center gap-3 pt-2">
            {!isNotFound && (
              <button
                onClick={() => shellQuery.refetch()}
                className="text-xs underline text-primary"
              >
                Retry
              </button>
            )}
            <button
              onClick={() => navigate("/agent-studio")}
              className="text-xs underline text-primary"
            >
              ← Back to all agents
            </button>
          </div>
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

        {/* Partial-failure banner — agent loaded but a subcomponent
            (draft / readiness / governance / latest sim / latest test)
            threw. We render the page anyway with whatever data we did
            get, and surface a specific diagnostic so the user sees the
            real failure instead of a generic "Failed to fetch". */}
        {agentContext && shell?.warnings && shell.warnings.length > 0 && (
          <div className="bg-yellow-500/10 border-b border-yellow-500/30 px-4 py-2 text-[11px]">
            <div className="font-semibold text-yellow-700 dark:text-yellow-400">
              Partial shell data — {shell.warnings.length} subcomponent
              {shell.warnings.length === 1 ? "" : "s"} failed
            </div>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {shell.warnings.map((w, i) => (
                <li key={i} className="font-mono">
                  <span className="uppercase tracking-wider text-yellow-700/80 dark:text-yellow-400/80">
                    {w.subcomponent}
                  </span>
                  {" — "}
                  {w.message}
                </li>
              ))}
            </ul>
          </div>
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
