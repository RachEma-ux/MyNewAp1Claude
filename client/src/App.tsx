import { lazy, Suspense, useMemo } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect, Router as WouterRouter, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl, isOAuthConfigured } from "./const";
import MainLayout from "./components/MainLayout";
import InstallPrompt from "./components/InstallPrompt";
import { trpc } from "@/lib/trpc";
import { PMCentralChatWindow } from "./components/pm/PMCentralChatWindow";
import { AgentStudioChatWindow } from "@/modules/agent-studio";
// Frontend module manifests — side-effectful registration into the
// client module registry. Compat mode: <ModuleRoutes /> is appended
// after the existing Switch entries, so existing routes win and
// modules just contribute additional metadata + nav.
import "@/modules";
import { ModuleRoutes } from "@/platform/modules";

// Lazy-loaded page components (code splitting)
const Home = lazy(() => import("./pages/Home"));
// Old workspace pages removed — use WorkspaceExecutionShell via /w/:id
const Models = lazy(() => import("./pages/Models"));
const Documents = lazy(() => import("./pages/Documents"));
// Agents page replaced by AgentsPage (governance-aware)
const AgentChat = lazy(() => import("./pages/AgentChat"));
const CatalogAgentChat = lazy(() => import("./pages/CatalogAgentChat"));
// Communication is a Module Client Capsule. App.tsx no longer imports
// Communication private pages — the capsule is mounted by
// <ModuleRoutes /> via `client/src/modules/communication/client.ts`.
// Only the legacy `/chat`, `/conversations`, `/video-meeting` paths
// remain in App.tsx, as Wouter <Redirect> compatibility shims.
const Automation = lazy(() => import("./pages/Automation"));
const Settings = lazy(() => import("./pages/Settings"));
const Providers = lazy(() => import("./pages/Providers"));
const ProviderDetail = lazy(() => import("./pages/ProviderDetail"));
const Analytics = lazy(() => import("./pages/Analytics"));
const OllamaSetup = lazy(() => import("./pages/OllamaSetup"));
const ProviderAnalytics = lazy(() => import("./pages/ProviderAnalytics"));
const ModelBrowser = lazy(() => import("./pages/ModelBrowser"));
const HardwareProfile = lazy(() => import("./pages/HardwareProfile"));
const DownloadAnalytics = lazy(() => import("./pages/DownloadAnalytics"));
const LocalInference = lazy(() => import("./pages/LocalInference"));
// AgentDashboard removed — consolidated into AgentDashboardPage
const AutomationBuilder = lazy(() => import("./pages/AutomationBuilder"));
const AgentTemplates = lazy(() => import("./pages/AgentTemplates"));
const AutomationExecutions = lazy(() => import("./pages/AutomationExecutions"));
const AutomationExecutionDetails = lazy(() => import("./pages/AutomationExecutionDetails"));
const TriggersStore = lazy(() => import("./pages/TriggersStore"));
const ActionsStore = lazy(() => import("./pages/ActionsStore"));
const AutomationSettings = lazy(() => import("./pages/AutomationSettings"));
const FlowChartPage = lazy(() => import("./pages/FlowChartPage"));
const AirflowPage = lazy(() => import("./pages/AirflowPage"));
const AirbytePage = lazy(() => import("./pages/AirbytePage"));
// Sandbox WF — migrated to capsule (PR #74). Mounted by <ModuleRoutes />
// from `client/src/modules/sandbox-wf/`.
const DocumentUpload = lazy(() => import("./pages/DocumentUpload"));
const CodeEditor = lazy(() => import("./pages/CodeEditor"));
const EmbeddingsManagement = lazy(() => import("./pages/EmbeddingsManagement"));
const VectorDBManagement = lazy(() => import("./pages/VectorDBManagement"));
const DocumentsDashboard = lazy(() => import("./pages/DocumentsDashboard"));
const ResourceMonitor = lazy(() => import("./pages/ResourceMonitor"));
const HardwarePage = lazy(() => import("./pages/infrastructure/HardwarePage"));
const SoftwarePage = lazy(() => import("./pages/infrastructure/SoftwarePage"));
const SecretsPage = lazy(() => import("./pages/SecretsPage"));
const TemplatesPage = lazy(() => import("./pages/TemplatesPage"));
const AgentsPage = lazy(() => import("./pages/AgentsPage"));
const AgentEditorPage = lazy(() => import("@/pages/AgentEditorPage"));
const AgentDashboardPage = lazy(() => import("@/pages/AgentDashboardPage"));
const ProtocolsPage = lazy(() => import("@/pages/ProtocolsPage"));
const WCPWorkflowBuilder = lazy(() => import("@/pages/WCPWorkflowBuilder"));
const WCPWorkflowsList = lazy(() => import("@/pages/WCPWorkflowsList"));
const WCPExecutions = lazy(() => import("@/pages/WCPExecutions"));
const WCPExecutionDetails = lazy(() => import("@/pages/WCPExecutionDetails"));
const PromotionRequestsPage = lazy(() => import("@/pages/PromotionRequestsPage"));
const DriftDetectionPage = lazy(() => import("@/pages/DriftDetectionPage"));
const ComplianceExportPage = lazy(() => import("@/pages/ComplianceExportPage"));
const ErrorAnalysisDashboard = lazy(() => import("@/pages/ErrorAnalysisDashboard"));
const PolicyManagement = lazy(() => import("@/pages/PolicyManagement"));
const AgentDetailPage = lazy(() => import("@/pages/AgentDetailPage"));
const AgentList = lazy(() => import("@/pages/AgentList").then(m => ({ default: m.AgentList })));
const AgentEditor = lazy(() => import("@/pages/AgentEditor").then(m => ({ default: m.AgentEditor })));
const AgentControlPanelPage = lazy(() => import("@/pages/AgentControlPanelPage"));
const ComingSoonListPage = lazy(() => import("@/pages/ComingSoonListPage"));
const BotsComingSoonPage = lazy(() => import("@/pages/BotsComingSoonPage"));
const ProviderControlPanelPage = lazy(() => import("@/pages/ProviderControlPanelPage"));
const ProvidersComingSoonPage = lazy(() => import("@/pages/ProvidersComingSoonPage"));
const ProviderWizardPage = lazy(() => import("@/pages/ProviderWizardPage"));
const ModelsComingSoonPage = lazy(() => import("@/pages/ModelsComingSoonPage"));
const LLMListPage = lazy(() => import("@/pages/LLMListPage"));
const ModelListPage = lazy(() => import("@/pages/ModelListPage"));
const BotListPage = lazy(() => import("@/pages/BotListPage"));
const ProviderListPage = lazy(() => import("@/pages/ProviderListPage"));
const AutoRemediationPage = lazy(() => import("@/pages/AutoRemediationPage"));
// Shell pages for AI Type entity modules
const ProvidersShellPage = lazy(() => import("@/pages/ProvidersShellPage"));
const LLMShellPage = lazy(() => import("@/pages/LLMShellPage"));
const ModelsShellPage = lazy(() => import("@/pages/ModelsShellPage"));
const AgentsShellPage = lazy(() => import("@/pages/AgentsShellPage"));
const BotsShellPage = lazy(() => import("@/pages/BotsShellPage"));
const ToolsManagementPage = lazy(() => import("@/pages/ToolsManagementPage"));
const WikiPage = lazy(() => import("@/pages/WikiPage"));
const WikiArticle = lazy(() => import("@/pages/WikiArticle"));
const WikiEditor = lazy(() => import("@/pages/WikiEditor"));
const LLMDashboard = lazy(() => import("@/pages/LLMDashboard"));
const LLMControlPlane = lazy(() => import("@/pages/LLMControlPlane"));
const LLMWizard = lazy(() => import("@/pages/LLMWizard"));
const LLMCreationWizard = lazy(() => import("@/pages/LLMCreationWizard"));
const LLMProviderConfigWizard = lazy(() => import("@/pages/LLMProviderConfigWizard"));
const NewProviderPage = lazy(() => import("@/pages/NewProviderPage"));
const LLMCataloguePage = lazy(() => import("@/pages/LLMCataloguePage"));
// HR — migrated to capsule (PR #68). Mounted by <ModuleRoutes />
// from `client/src/modules/hr/`.
// OM — migrated to capsule (PR #69). Mounted by <ModuleRoutes />
// from `client/src/modules/organization-management/`.
// CV — migrated to capsule (PR #70). Mounted by <ModuleRoutes />
// from `client/src/modules/culture-values/`.
// PRM — migrated to capsule (PR #65). Mounted by <ModuleRoutes />
// from `client/src/modules/prm/`.
// PSM — migrated to capsule (PR #67). Mounted by <ModuleRoutes />
// from `client/src/modules/psm/`.
// Code Studio — migrated to capsule (PR #62). Mounted by <ModuleRoutes />
// from `client/src/modules/code-studio/`.
// Projects System — migrated to capsule (PR #63). Mounted by <ModuleRoutes />
// from `client/src/modules/ps/`.
const SimpleShellPage = lazy(() => import("@/pages/components/SimpleShellPage"));
const DoubleShellPage = lazy(() => import("@/pages/components/DoubleShellPage"));
const HomeTemplatePage = lazy(() => import("@/pages/components/HomeTemplatePage"));
const AICatalogPage = lazy(() => import("@/pages/components/AICatalogPage"));
const OpenCodeChatPage = lazy(() => import("@/pages/components/OpenCodeChatPage"));
const OpenCodeHomePage = lazy(() => import("@/pages/components/OpenCodeHomePage"));
// Legacy shell preserved in codebase but no longer mounted as primary
const WorkspaceExecutionShell = lazy(() => import("@/components/workspace-shell/WorkspaceExecutionShell"));
const WSSandboxPage = lazy(() => import("@/pages/WSSandboxPage"));
const WSDashboardPage = lazy(() => import("@/pages/WSDashboardPage"));
const WSControlPanelPage = lazy(() => import("@/pages/WSControlPanelPage"));
const WSWizardPage = lazy(() => import("@/pages/WSWizardPage"));
const WSListPage = lazy(() => import("@/pages/WSListPage"));
const WSCatalogPage = lazy(() => import("@/pages/WSCatalogPage"));
// Legacy template shells — replaced by WorkspaceExecutionShell
const LLMPromotions = lazy(() => import("@/pages/LLMPromotions"));
const LLMDetailPage = lazy(() => import("@/pages/LLMDetailPage"));
const LLMTrainingDashboard = lazy(() => import("@/pages/LLMTrainingDashboard"));
const DeploymentStatus = lazy(() => import("@/pages/DeploymentStatus"));
const DeployPage = lazy(() => import("@/pages/DeployPage"));
const CatalogManagePage = lazy(() => import("@/pages/CatalogManagePage"));
const CandidatePage = lazy(() => import("@/pages/CandidatePage"));
const ASCandidatePage = lazy(() => import("@/pages/ASCandidatePage"));
const ProviderConnectionsPage = lazy(() => import("@/pages/ProviderConnectionsPage"));
const UIShowcasePage = lazy(() => import("@/pages/UIShowcasePage"));
const GovernanceScorecard = lazy(() => import("@/pages/GovernanceScorecard"));
// AI Types — migrated to capsule (PR #71). Mounted by <ModuleRoutes />
// from `client/src/modules/ai-types/`.
const DigitalHQPage = lazy(() => import("@/pages/DigitalHQPage"));
const GovernanceCenterPage = lazy(() => import("@/pages/GovernanceCenterPage"));
const RunConsolePage = lazy(() => import("@/pages/RunConsolePage"));
const WorkConsoleShellPage = lazy(() => import("@/pages/work-console/WorkConsoleShellPage"));
const CollaborationPage = lazy(() => import("@/pages/CollaborationPage"));
const PMCentralPage = lazy(() => import("@/pages/PMCentralPage"));
const PMCentralShellPage = lazy(() => import("@/pages/pm-central/PMCentralShellPage"));
const ProjectPage = lazy(() => import("@/pages/pm-central/ProjectPage"));
const ShellNewPage = lazy(() => import("@/pages/pm-central/ShellNewPage"));
const InboxPage = lazy(() => import("@/pages/pm-central/InboxPage"));
const WizardPage = lazy(() => import("@/pages/pm-central/WizardPage"));
const MethodesPage = lazy(() => import("@/pages/pm-central/MethodesPage"));
const ShellClonePage = lazy(() => import("@/pages/pm-central/ShellClonePage"));
const AgentRunDetailPanel = lazy(() => import("@/pages/pm-central/AgentRunDetailPanel"));
const IdeaBuilderWizard = lazy(() => import("@/pages/pm-central/IdeaBuilderWizard"));
// PM Central RTLM — canonical at /pm/* via the Module Client Capsule
// (see client/src/modules/pm-central/). The capsule is mounted by
// <ModuleRoutes /> below; App.tsx no longer imports PM Central RTLM
// pages directly. The legacy /pm-central/rtlm/* paths are served
// as compatibility redirects to /pm/* (rendered just before the
// /pm-central/:item catch-all so they're matched first).
//
// The legacy /pm-central/* shell (PMCentralShellPage and friends
// imported above) is NOT a PM Central RTLM canonical surface and
// continues to be mounted directly here.
// Agent Studio — migrated to capsule (PR #73). Mounted by <ModuleRoutes />
// from `client/src/modules/agent-studio/`.
// KGIA — Knowledge Graph Interpretation Agent
const KGIAShellPage = lazy(() => import("@/pages/kgia/KGIAShellPage"));
// OpenRouter — migrated to capsule (PR #72). Mounted by <ModuleRoutes />
// from `client/src/modules/openrouter/`.
// Data Analysis — GraphRAG, Data Acquisition, and Data Warehouse pages
// are now mounted by the Data Analysis capsule via <ModuleRoutes />.
// See `client/src/modules/data-analysis/`.
//
// KGRA Agent — migrated to capsule (PR #75). Mounted by <ModuleRoutes />
// from `client/src/modules/kgra-agent/`. KGRA Agent's UI lives at
// `/data-analysis/kgra-agent` because that's the historical canonical
// path; KGRA is its own RTLM (separate from Data Analysis).

/**
 * Compatibility redirect for the legacy PM Central RTLM project
 * detail path `/pm-central/rtlm/projects/:id` → `/pm/projects/:id`.
 * Preserves the dynamic id segment. Defined as a named component so
 * the route ownership extractor can recognize the redirect target
 * (the extractor's regex does not understand JSX template-literal
 * `to={...}` expressions).
 */
function RtlmProjectRedirect() {
  const [pathname] = useLocation();
  const id = pathname.split("/").pop() ?? "";
  // Keep this string literal — the route ownership map regex looks
  // for `<Redirect to="/static/path">`. Encoding the id in the URL
  // happens via the dynamic concatenation below, but the redirectTo
  // metadata is recognized from the literal `<Redirect to="/pm/projects">`.
  if (!id) return <Redirect to="/pm/projects" />;
  return <Redirect to={"/pm/projects/" + id} />;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, loading } = useAuth();

  // If OAuth is not configured, bypass authentication and render the component
  // This allows the app to run in "demo mode" without OAuth/database
  if (!isOAuthConfigured()) {
    return (
      <MainLayout>
        <Component />
      </MainLayout>
    );
  }

  if (loading) {
    return null;
  }

  if (!isAuthenticated) {
    const loginUrl = getLoginUrl();
    if (loginUrl) {
      window.location.href = loginUrl;
    }
    return null;
  }

  return (
    <MainLayout>
      <Component />
    </MainLayout>
  );
}

/** Auth-only route — no MainLayout wrapper (for components with their own shell) */
function ShellRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, loading } = useAuth();

  if (!isOAuthConfigured()) {
    return <Component />;
  }

  if (loading) {
    return null;
  }

  if (!isAuthenticated) {
    const loginUrl = getLoginUrl();
    if (loginUrl) {
      window.location.href = loginUrl;
    }
    return null;
  }

  return <Component />;
}

// HR gating helpers (HrGate, hrGated) and gated wrappers — migrated
// to capsule (PR #68). They now live in
// `client/src/modules/hr/components/HrGate.tsx` and are wired by
// `client/src/modules/hr/mod.tsx`.

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <ProtectedRoute component={OpenCodeChatPage} />} />
      {/* Workspaces — workspace management surfaces */}
      <Route path="/ws/dashboard" component={() => <ProtectedRoute component={WSDashboardPage} />} />
      <Route path="/ws/control-panel" component={() => <ProtectedRoute component={WSControlPanelPage} />} />
      <Route path="/ws/wizard/:id?" component={() => <ProtectedRoute component={WSWizardPage} />} />
      <Route path="/ws/list" component={() => <ProtectedRoute component={WSListPage} />} />
      <Route path="/ws/catalog" component={() => <ProtectedRoute component={WSCatalogPage} />} />
      {/* HR — migrated to capsule (PR #68). Routes /hr/* now rendered
          by <ModuleRoutes /> via the capsule manifest. */}
      {/* OM — migrated to capsule (PR #69). Routes /om/* now rendered
          by <ModuleRoutes /> via the capsule manifest. */}
      {/* CV — migrated to capsule (PR #70). Routes /cv/* now rendered
          by <ModuleRoutes /> via the capsule manifest. */}
      {/* App Components — Shell demos */}
      <Route path="/components/simple-shell" component={() => <ProtectedRoute component={SimpleShellPage} />} />
      <Route path="/components/double-shell" component={() => <ProtectedRoute component={DoubleShellPage} />} />
      <Route path="/components/home-template" component={() => <ProtectedRoute component={HomeTemplatePage} />} />
      <Route path="/components/ai-catalog" component={() => <ProtectedRoute component={AICatalogPage} />} />
      <Route path="/components/opencode-chat" component={() => <ProtectedRoute component={OpenCodeChatPage} />} />
      <Route path="/components/opencode-home" component={() => <ProtectedRoute component={OpenCodeHomePage} />} />
      {/* PSM — migrated to capsule (PR #67). Routes /psm/* now rendered
          by <ModuleRoutes /> via the capsule manifest. */}
      {/* PRM — migrated to capsule (PR #65). Routes /prm/* now rendered
          by <ModuleRoutes /> via the capsule manifest. */}
      {/* Code Studio — migrated to capsule (PR #62). Routes /code-studio/*
          now rendered by <ModuleRoutes /> via the capsule manifest. */}
      {/* Agent Studio — migrated to capsule (PR #73). Routes /agent-studio/*
          now rendered by <ModuleRoutes /> via the capsule manifest. */}
      {/* Projects System — migrated to capsule (PR #63). Routes /ps/*
          now rendered by <ModuleRoutes /> via the capsule manifest. */}
      {/* KGIA — Knowledge Graph Interpretation Agent (shell handles internal routing) */}
      <Route path="/kgia/sources" component={() => <ProtectedRoute component={KGIAShellPage} />} />
      <Route path="/kgia/benchmarks" component={() => <ProtectedRoute component={KGIAShellPage} />} />
      <Route path="/kgia/governance" component={() => <ProtectedRoute component={KGIAShellPage} />} />
      <Route path="/kgia/oversight" component={() => <ProtectedRoute component={KGIAShellPage} />} />
      <Route path="/kgia" component={() => <ProtectedRoute component={KGIAShellPage} />} />
      {/* OpenRouter — migrated to capsule (PR #72). Routes /openrouter/*
          now rendered by <ModuleRoutes /> via the capsule manifest. */}
      {/* KGRA Agent — migrated to capsule (PR #75). Route /data-analysis/kgra-agent
          now rendered by <ModuleRoutes /> via the capsule manifest. */}
      {/* Workspace Execution Shell — NEW context-first shell architecture */}
      <Route path="/w/:workspaceId/*" component={() => <ProtectedRoute component={WorkspaceExecutionShell} />} />
      <Route path="/w/:workspaceId" component={() => <ProtectedRoute component={WorkspaceExecutionShell} />} />
      {/* Template workspace shells — all use new WorkspaceExecutionShell */}
      <Route path="/personal/:workspaceId/*" component={() => <ProtectedRoute component={WorkspaceExecutionShell} />} />
      <Route path="/personal/:workspaceId" component={() => <ProtectedRoute component={WorkspaceExecutionShell} />} />
      <Route path="/project/:workspaceId/*" component={() => <ProtectedRoute component={WorkspaceExecutionShell} />} />
      <Route path="/project/:workspaceId" component={() => <ProtectedRoute component={WorkspaceExecutionShell} />} />
      <Route path="/research/:workspaceId/*" component={() => <ProtectedRoute component={WorkspaceExecutionShell} />} />
      <Route path="/research/:workspaceId" component={() => <ProtectedRoute component={WorkspaceExecutionShell} />} />
      {/* Models — governed model registry (shell) */}
      <Route path="/models/dashboard" component={() => <ProtectedRoute component={ModelsShellPage} />} />
      <Route path="/models/control-panel" component={() => <ProtectedRoute component={ModelsShellPage} />} />
      <Route path="/models/wizard" component={() => <ProtectedRoute component={ModelsShellPage} />} />
      <Route path="/models/list" component={() => <ProtectedRoute component={ModelsShellPage} />} />
      <Route path="/models/browse" component={() => <ProtectedRoute component={ModelsShellPage} />} />
      <Route path="/models" component={() => <ProtectedRoute component={ModelsShellPage} />} />
      <Route path="/hardware" component={() => <ProtectedRoute component={HardwareProfile} />} />
      <Route path="/analytics/downloads" component={() => <ProtectedRoute component={DownloadAnalytics} />} />
      <Route path="/inference" component={() => <ProtectedRoute component={LocalInference} />} />
      <Route path="/documents/dashboard" component={() => <ProtectedRoute component={DocumentsDashboard} />} />
      <Route path="/documents/upload" component={() => <ProtectedRoute component={DocumentUpload} />} />
      <Route path="/code" component={() => <ProtectedRoute component={CodeEditor} />} />
      <Route path="/embeddings" component={() => <ProtectedRoute component={EmbeddingsManagement} />} />
      <Route path="/vectordb" component={() => <ProtectedRoute component={VectorDBManagement} />} />
      {/* Agents — governed agent lifecycle (shell) */}
      <Route path="/agents/dashboard" component={() => <ProtectedRoute component={AgentsShellPage} />} />
      <Route path="/agents/templates" component={() => <ProtectedRoute component={AgentTemplates} />} />
      <Route path="/automation/builder" component={() => <ProtectedRoute component={AutomationBuilder} />} />
      <Route path="/automation/executions/:id" component={() => <ProtectedRoute component={AutomationExecutionDetails} />} />
      <Route path="/automation/executions" component={() => <ProtectedRoute component={AutomationExecutions} />} />
      <Route path="/automation/triggers" component={() => <ProtectedRoute component={TriggersStore} />} />
      <Route path="/automation/actions" component={() => <ProtectedRoute component={ActionsStore} />} />
      <Route path="/automation/settings" component={() => <ProtectedRoute component={AutomationSettings} />} />
      <Route path="/automation/secrets" component={() => <ProtectedRoute component={SecretsPage} />} />
      <Route path="/automation/flowchart" component={() => <ProtectedRoute component={FlowChartPage} />} />
      <Route path="/automation/airflow" component={() => <ProtectedRoute component={AirflowPage} />} />
      <Route path="/automation/airbyte" component={() => <ProtectedRoute component={AirbytePage} />} />
      {/* Sandbox WF — migrated to capsule (PR #74). Routes /automation/sandbox-wf*
          now rendered by <ModuleRoutes /> via the capsule manifest. */}
      <Route path="/templates" component={() => <ProtectedRoute component={TemplatesPage} />} />
      <Route path="/agents" component={() => <ProtectedRoute component={AgentsPage} />} />
      <Route path="/agents/create" component={() => <ProtectedRoute component={AgentsPage} />} />
      <Route path="/agents/wizard" component={() => <ProtectedRoute component={AgentsShellPage} />} />
      <Route path="/agents/control-panel" component={() => <ProtectedRoute component={AgentsShellPage} />} />
      <Route path="/agents/list" component={() => <ProtectedRoute component={AgentsShellPage} />} />
      <Route path="/agents/:id" component={() => <ProtectedRoute component={AgentDetailPage} />} />
      <Route path="/agent-dashboard" component={() => <ProtectedRoute component={AgentDashboardPage} />} />
      <Route path="/protocols" component={() => <ProtectedRoute component={ProtocolsPage} />} />
      <Route path="/promotion-requests" component={() => <ProtectedRoute component={PromotionRequestsPage} />} />
      <Route path="/drift-detection" component={() => <ProtectedRoute component={DriftDetectionPage} />} />
      <Route path="/compliance-export" component={() => <ProtectedRoute component={ComplianceExportPage} />} />
      <Route path="/auto-remediation" component={() => <ProtectedRoute component={AutoRemediationPage} />} />
      <Route path="/tools-management" component={() => <ProtectedRoute component={ToolsManagementPage} />} />
      <Route path="/documents" component={() => <ProtectedRoute component={Documents} />} />
      <Route path="/agents/:agentId/chat" component={() => <ProtectedRoute component={AgentChat} />} />
      <Route path="/catalog/agents/:catalogEntryId/chat" component={() => <ProtectedRoute component={CatalogAgentChat} />} />
      <Route path="/setup/ollama" component={() => <ProtectedRoute component={OllamaSetup} />} />
      {/* Communication module — canonical /communication/* routes are
          mounted by <ModuleRoutes /> below via the Communication
          client capsule. App.tsx only keeps the legacy compatibility
          redirects so existing deep links keep working. */}
      <Route path="/chat"><Redirect to="/communication/chat" /></Route>
      <Route path="/conversations"><Redirect to="/communication/conversations" /></Route>
      <Route path="/video-meeting"><Redirect to="/communication/video-meeting" /></Route>
      <Route path="/automation" component={() => <ProtectedRoute component={Automation} />} />
      <Route path="/wcp/workflows" component={() => <ProtectedRoute component={WCPWorkflowsList} />} />
      <Route path="/wcp/workflows/builder" component={() => <ProtectedRoute component={WCPWorkflowBuilder} />} />
      <Route path="/wcp/executions" component={() => <ProtectedRoute component={WCPExecutions} />} />
      <Route path="/wcp/executions/:id" component={() => <ProtectedRoute component={WCPExecutionDetails} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
      <Route path="/resources" component={() => <ProtectedRoute component={ResourceMonitor} />} />
      {/* Providers — governed provider lifecycle (shell) */}
      <Route path="/providers/dashboard" component={() => <ProtectedRoute component={ProvidersShellPage} />} />
      <Route path="/providers/control-panel" component={() => <ProtectedRoute component={ProvidersShellPage} />} />
      <Route path="/providers/wizard" component={() => <ProtectedRoute component={ProvidersShellPage} />} />
      <Route path="/providers/list" component={() => <ProtectedRoute component={ProvidersShellPage} />} />
      <Route path="/providers/connections" component={() => <ProtectedRoute component={ProviderConnectionsPage} />} />
      <Route path="/providers" component={() => <ProtectedRoute component={Providers} />} />
      <Route path="/providers/:id" component={() => <ProtectedRoute component={ProviderDetail} />} />
      <Route path="/providers-analytics" component={() => <ProtectedRoute component={ProviderAnalytics} />} />
      <Route path="/models/browser" component={() => <ProtectedRoute component={ModelBrowser} />} />
      <Route path="/analytics" component={() => <ProtectedRoute component={Analytics} />} />
      <Route path="/infrastructure/hardware/:category" component={() => <ProtectedRoute component={HardwarePage} />} />
      <Route path="/infrastructure/software/:item" component={() => <ProtectedRoute component={SoftwarePage} />} />
      <Route path="/error-analysis" component={() => <ProtectedRoute component={ErrorAnalysisDashboard} />} />
      <Route path="/policies" component={() => <ProtectedRoute component={PolicyManagement} />} />
      {/* /list/* — redirect to shell-based list views */}
      <Route path="/list/llms">{() => <Redirect to="/llm/list" />}</Route>
      <Route path="/list/models">{() => <Redirect to="/models/list" />}</Route>
      <Route path="/list/bots">{() => <Redirect to="/bots/list" />}</Route>
      <Route path="/list/providers">{() => <Redirect to="/providers/list" />}</Route>
      {/* Coming Soon list pages */}
      <Route path="/list/:type" component={() => <ProtectedRoute component={ComingSoonListPage} />} />
      {/* Bots — governed bot lifecycle (shell) */}
      <Route path="/bots/dashboard" component={() => <ProtectedRoute component={BotsShellPage} />} />
      <Route path="/bots/control-panel" component={() => <ProtectedRoute component={BotsShellPage} />} />
      <Route path="/bots/wizard" component={() => <ProtectedRoute component={BotsShellPage} />} />
      <Route path="/bots/list" component={() => <ProtectedRoute component={BotsShellPage} />} />
      <Route path="/bots/analytics" component={() => <ProtectedRoute component={BotsShellPage} />} />
      <Route path="/bots" component={() => <ProtectedRoute component={BotsShellPage} />} />
      {/* Redirect stale /agent-detail/:id to canonical /agents/:id */}
      <Route path="/agent-detail/:id">{(params) => <Redirect to={`/agents/${params.id}`} />}</Route>
      {/* Governance agent routes — consolidated under /governance/agents */}
      <Route path="/governance/agents" component={() => <ProtectedRoute component={AgentList} />} />
      <Route path="/governance/agents/create" component={() => <ProtectedRoute component={() => <AgentEditor />} />} />
      <Route path="/governance/agents/:agentId/edit" component={({ agentId }) => <ProtectedRoute component={() => <AgentEditor agentId={agentId} />} />} />
      <Route path="/wiki" component={() => <ProtectedRoute component={WikiPage} />} />
      <Route path="/wiki/:slug" component={() => <ProtectedRoute component={WikiArticle} />} />
      <Route path="/wiki/edit/:id" component={() => <ProtectedRoute component={WikiEditor} />} />
      {/* LLMs — governed LLM lifecycle (shell) */}
      <Route path="/llm/dashboard" component={() => <ProtectedRoute component={LLMShellPage} />} />
      <Route path="/llm/control-panel" component={() => <ProtectedRoute component={LLMShellPage} />} />
      <Route path="/llm/control-plane">{() => <Redirect to="/llm/control-panel" />}</Route>
      <Route path="/llm/register" component={() => <ProtectedRoute component={LLMShellPage} />} />
      <Route path="/llm/create">{() => <Redirect to="/llm/register" />}</Route>
      <Route path="/llm/wizard" component={() => <ProtectedRoute component={LLMShellPage} />} />
      <Route path="/llm/list" component={() => <ProtectedRoute component={LLMShellPage} />} />
      <Route path="/llm/catalogue" component={() => <ProtectedRoute component={LLMShellPage} />} />
      <Route path="/llm" component={() => <ProtectedRoute component={LLMShellPage} />} />
      <Route path="/llm/training" component={() => <ProtectedRoute component={LLMTrainingDashboard} />} />
      <Route path="/llm/promotions" component={() => <ProtectedRoute component={LLMPromotions} />} />
      {/* Provider configuration wizards (legacy LLM-scoped, redirect to /providers/wizard for new usage) */}
      <Route path="/llm/provider-wizard" component={() => <ProtectedRoute component={LLMProviderConfigWizard} />} />
      <Route path="/llm/new-provider" component={() => <ProtectedRoute component={NewProviderPage} />} />
      <Route path="/llm/catalogue/manage" component={() => <ProtectedRoute component={CatalogManagePage} />} />
      <Route path="/llm/catalogue/candidate" component={() => <ProtectedRoute component={CandidatePage} />} />
      <Route path="/llm/catalogue/as-candidates" component={() => <ProtectedRoute component={ASCandidatePage} />} />
      {/* Deployment Status Page */}
      <Route path="/deployment-status" component={() => <ProtectedRoute component={DeploymentStatus} />} />
      {/* Deploy Page */}
      <Route path="/deploy" component={() => <ProtectedRoute component={DeployPage} />} />
      <Route path="/llm/:id" component={() => <ProtectedRoute component={LLMDetailPage} />} />
      {/* Governance Scorecard — CGT v2 automated compliance engine */}
      <Route path="/governance/scorecard" component={() => <ProtectedRoute component={GovernanceScorecard} />} />
      {/* AI Types Module — Shell handles internal routing */}
      {/* AI Types — migrated to capsule (PR #71). Routes /ai-types/*
          now rendered by <ModuleRoutes /> via the capsule manifest. */}
      {/* Backward-compatibility redirects for old namespaces */}
      <Route path="/digital-hq/:item">{(params) => <Redirect to={`/hq/${params.item}`} />}</Route>
      <Route path="/governance-center/:item">{(params) => <Redirect to={`/governance/${params.item}`} />}</Route>
      {/* Digital HQ — collaboration & authority pages */}
      <Route path="/hq/:item" component={() => <ProtectedRoute component={DigitalHQPage} />} />
      {/* Governance Center — governance enforcement pages */}
      <Route path="/governance" component={() => <Redirect to="/governance/overview" />} />
      <Route path="/governance/:item" component={() => <ProtectedRoute component={GovernanceCenterPage} />} />
      {/* Operator Runtime — Multi-Operator Autonomous Platform */}
      <Route path="/run-console" component={() => <ProtectedRoute component={RunConsolePage} />} />
      {/* AI Work Console — unified command-center. Single shell route
          handles sub-routes via internal URL parsing so sidebar/status
          bar stay persistent across tab transitions. */}
      <Route path="/work-console/:id/:tab" component={() => <ProtectedRoute component={WorkConsoleShellPage} />} />
      <Route path="/work-console/:id" component={() => <ProtectedRoute component={WorkConsoleShellPage} />} />
      <Route path="/work-console/new" component={() => <ProtectedRoute component={WorkConsoleShellPage} />} />
      <Route path="/work-console" component={() => <ProtectedRoute component={WorkConsoleShellPage} />} />
      {/* Collaboration */}
      <Route path="/collaboration" component={() => <ProtectedRoute component={CollaborationPage} />} />
      {/* PM Central — Dedicated sub-routes (must be before shell catch-all) */}
      <Route path="/pm-central/shell/clone/:sourceId" component={() => <ProtectedRoute component={PMCentralShellPage} />} />
      <Route path="/pm-central/shell/new" component={() => <ProtectedRoute component={PMCentralShellPage} />} />
      <Route path="/pm-central/methodes/detail/:methodId" component={() => <ProtectedRoute component={MethodesPage} />} />
      <Route path="/pm-central/methodes/:categoryId" component={() => <ProtectedRoute component={MethodesPage} />} />
      {/* PM Central — Wizard routes (must be before generic /p/:id/:tool) */}
      <Route path="/pm-central/p/:id/wizard/:step" component={() => <ProtectedRoute component={WizardPage} />} />
      <Route path="/pm-central/p/:id/wizard" component={() => <ProtectedRoute component={WizardPage} />} />
      {/* PM Central — Project-level views /pm-central/p/:id/:tool */}
      <Route path="/pm-central/p/:id/:tool" component={() => <ProtectedRoute component={ProjectPage} />} />
      <Route path="/pm-central/p/:id" component={() => <ProtectedRoute component={ProjectPage} />} />
      {/* PM Central — Legacy route compat (/pm-central/project/:id/:tool) */}
      <Route path="/pm-central/project/:id/:tool" component={() => <ProtectedRoute component={ProjectPage} />} />
      <Route path="/pm-central/project/:id" component={() => <ProtectedRoute component={ProjectPage} />} />
      {/* PM Central — Agent Engine run detail (must be before shell catch-all) */}
      <Route path="/pm-central/agent-engine/run/:id" component={() => <ProtectedRoute component={AgentRunDetailPanel} />} />
      {/* PM Central RTLM — capsule mode at /pm/*. The legacy
          /pm-central/rtlm/* canonical paths used before this PR are
          preserved here as compatibility redirects so deep links
          keep working. The redirect routes must be matched before
          the /pm-central/:item catch-all below. */}
      <Route path="/pm-central/rtlm/projects/:id" component={RtlmProjectRedirect} />
      <Route path="/pm-central/rtlm/projects" component={() => <Redirect to="/pm/projects" />} />
      <Route path="/pm-central/rtlm/tasks" component={() => <Redirect to="/pm/tasks" />} />
      <Route path="/pm-central/rtlm/milestones" component={() => <Redirect to="/pm/milestones" />} />
      <Route path="/pm-central/rtlm/risks" component={() => <Redirect to="/pm/risks" />} />
      <Route path="/pm-central/rtlm/issues" component={() => <Redirect to="/pm/issues" />} />
      <Route path="/pm-central/rtlm/decisions" component={() => <Redirect to="/pm/decisions" />} />
      <Route path="/pm-central/rtlm/handoffs" component={() => <Redirect to="/pm/handoffs" />} />
      <Route path="/pm-central/rtlm/settings" component={() => <Redirect to="/pm/settings" />} />
      <Route path="/pm-central/rtlm" component={() => <Redirect to="/pm" />} />
      {/* PM Central — Simple IBM Shell (sidebar + content) */}
      <Route path="/pm-central/dashboard" component={() => <ProtectedRoute component={PMCentralShellPage} />} />
      <Route path="/pm-central/projects" component={() => <ProtectedRoute component={PMCentralShellPage} />} />
      <Route path="/pm-central/plans" component={() => <ProtectedRoute component={PMCentralShellPage} />} />
      <Route path="/pm-central/execution" component={() => <ProtectedRoute component={PMCentralShellPage} />} />
      <Route path="/pm-central/changes" component={() => <ProtectedRoute component={PMCentralShellPage} />} />
      <Route path="/pm-central/risks" component={() => <ProtectedRoute component={PMCentralShellPage} />} />
      <Route path="/pm-central/reports" component={() => <ProtectedRoute component={PMCentralShellPage} />} />
      <Route path="/pm-central/collaboration" component={() => <ProtectedRoute component={PMCentralShellPage} />} />
      <Route path="/pm-central/methodes" component={() => <ProtectedRoute component={PMCentralShellPage} />} />
      <Route path="/pm-central/templates" component={() => <ProtectedRoute component={PMCentralShellPage} />} />
      <Route path="/pm-central/agent-engine" component={() => <ProtectedRoute component={PMCentralShellPage} />} />
      <Route path="/pm-central/idea-builder" component={() => <ProtectedRoute component={PMCentralShellPage} />} />
      <Route path="/pm-central/inbox" component={() => <ProtectedRoute component={PMCentralShellPage} />} />
      <Route path="/pm-central/shell" component={() => <ProtectedRoute component={PMCentralShellPage} />} />
      <Route path="/pm-central/:item" component={() => <ProtectedRoute component={PMCentralShellPage} />} />
      <Route path="/pm-central" component={() => <ProtectedRoute component={PMCentralShellPage} />} />
      {/* Data Analysis — capsule mode.
          /data-analysis, /data-analysis/graphrag,
          /data-analysis/data-acquisition[/...] and
          /data-analysis/data-warehouse are mounted by
          <ModuleRoutes /> below via the Data Analysis capsule's
          manifest (`client/src/modules/data-analysis/manifest.ts`).
          The bare /data-analysis path redirects to
          /data-analysis/graphrag inside the capsule itself.

          The /data-analysis/kgra-agent route is owned by the KGRA
          Agent RTLM (a separate module), not by Data Analysis — it
          is mounted by <ModuleRoutes /> via the KGRA Agent capsule
          manifest (`client/src/modules/kgra-agent/`). */}
      {/* UI Showcase — living documentation for shared components */}
      <Route path="/ui-showcase" component={() => <ProtectedRoute component={UIShowcasePage} />} />
      <Route path="/404" component={NotFound} />
      {/* Module-composed routes (compat mode): renders any routes that
          registered modules contribute and that aren't already matched
          above. Switch picks the first match, so existing routes always
          take precedence. New module-only routes flow through here. */}
      <ModuleRoutes />
      <Route component={NotFound} />
    </Switch>
  );
}

/** PM Chat FAB — lives at App level so it persists across all /pm-central/* routes */
function PMCentralChatFAB() {
  const [location] = useLocation();
  const isPmCentral = location.startsWith("/pm-central");

  const { data: availableAgents } = trpc.catalogManage.available.useQuery(
    { entryType: "agent" },
    { enabled: isPmCentral },
  );

  const catalogImports = useMemo(() => {
    if (!availableAgents) return [];
    return availableAgents.map((e: any) => ({
      id: e.id,
      catalogEntryId: e.id,
      entryType: e.sourceType,
      name: e.displayName || e.name,
      description: e.description || "",
      category: e.category || "",
      tags: e.tags || [],
      config: e.metadata?.config || {},
      status: e.status || "active",
      importedAt: new Date(),
    }));
  }, [availableAgents]);

  if (!isPmCentral) return null;
  return <PMCentralChatWindow catalogImports={catalogImports} />;
}

/** Studio Chat FAB — lives at App level so it persists across all /agent-studio/* routes */
function AgentStudioChatFAB() {
  const [location] = useLocation();
  const isAgentStudio = location.startsWith("/agent-studio");
  if (!isAgentStudio) return null;
  return <AgentStudioChatWindow />;
}

function App() {
  return (
    <ErrorBoundary>
      <WouterRouter>
        <ThemeProvider defaultTheme="dark">
          <TooltipProvider>
            <Toaster />
            <InstallPrompt />
            <Suspense fallback={null}>
              <Router />
            </Suspense>
            <PMCentralChatFAB />
            <AgentStudioChatFAB />
          </TooltipProvider>
        </ThemeProvider>
      </WouterRouter>
    </ErrorBoundary>
  );
}

export default App;
