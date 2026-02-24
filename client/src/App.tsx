import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl, isOAuthConfigured } from "./const";
import MainLayout from "./components/MainLayout";
import { Loader2 } from "lucide-react";

// Lazy-loaded page components (code splitting)
const Home = lazy(() => import("./pages/Home"));
const Workspaces = lazy(() => import("./pages/Workspaces"));
const WorkspaceDetail = lazy(() => import("./pages/WorkspaceDetail"));
const WorkspaceHome = lazy(() => import("./pages/WorkspaceHome"));
const Models = lazy(() => import("./pages/Models"));
const Documents = lazy(() => import("./pages/Documents"));
// Agents page replaced by AgentsPage (governance-aware)
const AgentChat = lazy(() => import("./pages/AgentChat"));
const Chat = lazy(() => import("./pages/Chat"));
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
const DocumentUpload = lazy(() => import("./pages/DocumentUpload"));
const CodeEditor = lazy(() => import("./pages/CodeEditor"));
const EmbeddingsManagement = lazy(() => import("./pages/EmbeddingsManagement"));
const VectorDBManagement = lazy(() => import("./pages/VectorDBManagement"));
const Conversations = lazy(() => import("./pages/Conversations"));
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
const AutoRemediationPage = lazy(() => import("@/pages/AutoRemediationPage"));
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
const WorkspaceShell = lazy(() => import("@/pages/WorkspaceShell"));
const LLMPromotions = lazy(() => import("@/pages/LLMPromotions"));
const LLMDetailPage = lazy(() => import("@/pages/LLMDetailPage"));
const LLMTrainingDashboard = lazy(() => import("@/pages/LLMTrainingDashboard"));
const DeploymentStatus = lazy(() => import("@/pages/DeploymentStatus"));
const DeployPage = lazy(() => import("@/pages/DeployPage"));
const CatalogManagePage = lazy(() => import("@/pages/CatalogManagePage"));
const CandidatePage = lazy(() => import("@/pages/CandidatePage"));
const ProviderConnectionsPage = lazy(() => import("@/pages/ProviderConnectionsPage"));
const UIShowcasePage = lazy(() => import("@/pages/UIShowcasePage"));
const GovernanceScorecard = lazy(() => import("@/pages/GovernanceScorecard"));
const AITypesPage = lazy(() => import("@/pages/AITypesPage"));
const DigitalHQPage = lazy(() => import("@/pages/DigitalHQPage"));
const GovernanceCenterPage = lazy(() => import("@/pages/GovernanceCenterPage"));

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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <ProtectedRoute component={Home} />} />
      <Route path="/workspaces" component={() => <ProtectedRoute component={Workspaces} />} />
      <Route path="/workspaces/:id/home" component={() => <ProtectedRoute component={WorkspaceHome} />} />
      <Route path="/workspaces/:id" component={() => <ProtectedRoute component={WorkspaceDetail} />} />
      {/* Workspace Shell — module-bound execution container */}
      <Route path="/w/:workspaceId/:rest*" component={() => <ProtectedRoute component={WorkspaceShell} />} />
      <Route path="/w/:workspaceId" component={() => <ProtectedRoute component={WorkspaceShell} />} />
      <Route path="/models" component={() => <ProtectedRoute component={Models} />} />
      <Route path="/hardware" component={() => <ProtectedRoute component={HardwareProfile} />} />
          <Route path="/analytics/downloads" component={() => <ProtectedRoute component={DownloadAnalytics} />} />
          <Route path="/inference" component={() => <ProtectedRoute component={LocalInference} />} />
          <Route path="/documents/dashboard" component={() => <ProtectedRoute component={DocumentsDashboard} />} />
          <Route path="/documents/upload" component={() => <ProtectedRoute component={DocumentUpload} />} />
          <Route path="/code" component={() => <ProtectedRoute component={CodeEditor} />} />
      <Route path="/embeddings" component={() => <ProtectedRoute component={EmbeddingsManagement} />} />
      <Route path="/vectordb" component={() => <ProtectedRoute component={VectorDBManagement} />} />
      {/* Redirect /agents/dashboard to governance-aware dashboard */}
      <Route path="/agents/dashboard" component={() => <ProtectedRoute component={AgentDashboardPage} />} />
      <Route path="/agents/templates" component={() => <ProtectedRoute component={AgentTemplates} />} />
      <Route path="/automation/builder" component={() => <ProtectedRoute component={AutomationBuilder} />} />
      <Route path="/automation/executions/:id" component={() => <ProtectedRoute component={AutomationExecutionDetails} />} />
      <Route path="/automation/executions" component={() => <ProtectedRoute component={AutomationExecutions} />} />
      <Route path="/automation/triggers" component={() => <ProtectedRoute component={TriggersStore} />} />
      <Route path="/automation/actions" component={() => <ProtectedRoute component={ActionsStore} />} />
      <Route path="/automation/settings" component={() => <ProtectedRoute component={AutomationSettings} />} />
        <Route path="/automation/secrets" component={() => <ProtectedRoute component={SecretsPage} />} />
        <Route path="/templates" component={() => <ProtectedRoute component={TemplatesPage} />} />
        <Route path="/agents" component={() => <ProtectedRoute component={AgentsPage} />} />
        <Route path="/agents/create" component={() => <ProtectedRoute component={AgentsPage} />} />
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
      <Route path="/setup/ollama" component={() => <ProtectedRoute component={OllamaSetup} />} />
      <Route path="/chat" component={() => <ProtectedRoute component={Chat} />} />
      <Route path="/conversations" component={() => <ProtectedRoute component={Conversations} />} />
      <Route path="/automation" component={() => <ProtectedRoute component={Automation} />} />
      <Route path="/wcp/workflows" component={() => <ProtectedRoute component={WCPWorkflowsList} />} />
      <Route path="/wcp/workflows/builder" component={() => <ProtectedRoute component={WCPWorkflowBuilder} />} />
      <Route path="/wcp/executions" component={() => <ProtectedRoute component={WCPExecutions} />} />
      <Route path="/wcp/executions/:id" component={() => <ProtectedRoute component={WCPExecutionDetails} />} />
            <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
            <Route path="/resources" component={() => <ProtectedRoute component={ResourceMonitor} />} />
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
      {/* Redirect stale /agent-detail/:id to canonical /agents/:id */}
      <Route path="/agent-detail/:id">{(params) => <Redirect to={`/agents/${params.id}`} />}</Route>
      {/* Governance agent routes — consolidated under /governance/agents */}
      <Route path="/governance/agents" component={() => <ProtectedRoute component={AgentList} />} />
      <Route path="/governance/agents/create" component={() => <ProtectedRoute component={() => <AgentEditor />} />} />
      <Route path="/governance/agents/:agentId/edit" component={({ agentId }) => <ProtectedRoute component={() => <AgentEditor agentId={agentId} />} />} />
      <Route path="/wiki" component={() => <ProtectedRoute component={WikiPage} />} />
      <Route path="/wiki/:slug" component={() => <ProtectedRoute component={WikiArticle} />} />
      <Route path="/wiki/edit/:id" component={() => <ProtectedRoute component={WikiEditor} />} />
      {/* LLM Control Plane Routes */}
      <Route path="/llm" component={() => <ProtectedRoute component={LLMDashboard} />} />
      <Route path="/llm/control-plane" component={() => <ProtectedRoute component={LLMControlPlane} />} />
      <Route path="/llm/wizard" component={() => <ProtectedRoute component={LLMWizard} />} />
      <Route path="/llm/create" component={() => <ProtectedRoute component={LLMCreationWizard} />} />
      <Route path="/llm/training" component={() => <ProtectedRoute component={LLMTrainingDashboard} />} />
      <Route path="/llm/promotions" component={() => <ProtectedRoute component={LLMPromotions} />} />
      {/* Provider Configuration Wizard */}
      <Route path="/llm/provider-wizard" component={() => <ProtectedRoute component={LLMProviderConfigWizard} />} />
      <Route path="/llm/new-provider" component={() => <ProtectedRoute component={NewProviderPage} />} />
      <Route path="/llm/catalogue/manage" component={() => <ProtectedRoute component={CatalogManagePage} />} />
      <Route path="/llm/catalogue/candidate" component={() => <ProtectedRoute component={CandidatePage} />} />
      <Route path="/llm/catalogue" component={() => <ProtectedRoute component={LLMCataloguePage} />} />
      {/* Deployment Status Page */}
      <Route path="/deployment-status" component={() => <ProtectedRoute component={DeploymentStatus} />} />
      {/* Deploy Page */}
      <Route path="/deploy" component={() => <ProtectedRoute component={DeployPage} />} />
      <Route path="/llm/:id" component={() => <ProtectedRoute component={LLMDetailPage} />} />
      {/* Governance Scorecard — CGT v2 automated compliance engine */}
      <Route path="/governance/scorecard" component={() => <ProtectedRoute component={GovernanceScorecard} />} />
      {/* AI Types — stub pages */}
      <Route path="/ai-types/:type" component={() => <ProtectedRoute component={AITypesPage} />} />
      {/* Backward-compatibility redirects for old namespaces */}
      <Route path="/digital-hq/:item">{(params) => <Redirect to={`/hq/${params.item}`} />}</Route>
      <Route path="/governance-center/:item">{(params) => <Redirect to={`/governance/${params.item}`} />}</Route>
      {/* Digital HQ — collaboration & authority pages */}
      <Route path="/hq/:item" component={() => <ProtectedRoute component={DigitalHQPage} />} />
      {/* Governance Center — governance enforcement pages */}
      <Route path="/governance/:item" component={() => <ProtectedRoute component={GovernanceCenterPage} />} />
      {/* UI Showcase — living documentation for shared components */}
      <Route path="/ui-showcase" component={() => <ProtectedRoute component={UIShowcasePage} />} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          }>
            <Router />
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
