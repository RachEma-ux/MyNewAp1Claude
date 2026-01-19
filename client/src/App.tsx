import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl, isOAuthConfigured } from "./const";
import MainLayout from "./components/MainLayout";
import Home from "./pages/Home";
import Workspaces from "./pages/Workspaces";
import WorkspaceDetail from "./pages/WorkspaceDetail";
import Models from "./pages/Models";
import Documents from "./pages/Documents";
import Agents from "./pages/Agents";
import AgentChat from "./pages/AgentChat";
import Chat from "./pages/Chat";
import Automation from "./pages/Automation";
import Settings from "./pages/Settings";
import Providers from "./pages/Providers";
import ProviderDetail from "./pages/ProviderDetail";
import Analytics from "./pages/Analytics";
import OllamaSetup from "./pages/OllamaSetup";
import ProviderAnalytics from "./pages/ProviderAnalytics";
import ModelBrowser from "./pages/ModelBrowser";
import HardwareProfile from "./pages/HardwareProfile";
import DownloadAnalytics from "./pages/DownloadAnalytics";
import LocalInference from "./pages/LocalInference";
import AgentDashboard from "./pages/AgentDashboard";
import AutomationBuilder from "./pages/AutomationBuilder";
import AgentTemplates from "./pages/AgentTemplates";
import AutomationExecutions from "./pages/AutomationExecutions";
import AutomationExecutionDetails from "./pages/AutomationExecutionDetails";
import TriggersStore from "./pages/TriggersStore";
import ActionsStore from "./pages/ActionsStore";
import AutomationSettings from "./pages/AutomationSettings";
import DocumentUpload from "./pages/DocumentUpload";
import CodeEditor from "./pages/CodeEditor";
import EmbeddingsManagement from "./pages/EmbeddingsManagement";
import VectorDBManagement from "./pages/VectorDBManagement";
import Conversations from "./pages/Conversations";
import DocumentsDashboard from "./pages/DocumentsDashboard";
import ResourceMonitor from "./pages/ResourceMonitor";
import HardwarePage from "./pages/infrastructure/HardwarePage";
import SoftwarePage from "./pages/infrastructure/SoftwarePage";
import SecretsPage from "./pages/SecretsPage";
import TemplatesPage from "./pages/TemplatesPage";
import AgentsPage from "./pages/AgentsPage";
import AgentEditorPage from "@/pages/AgentEditorPage";
import AgentDashboardPage from "@/pages/AgentDashboardPage";
import ProtocolsPage from "@/pages/ProtocolsPage";
import WCPWorkflowBuilder from "@/pages/WCPWorkflowBuilder";
import WCPWorkflowsList from "@/pages/WCPWorkflowsList";
import WCPExecutions from "@/pages/WCPExecutions";
import WCPExecutionDetails from "@/pages/WCPExecutionDetails";
import PromotionRequestsPage from "@/pages/PromotionRequestsPage";
import DriftDetectionPage from "@/pages/DriftDetectionPage";
import ComplianceExportPage from "@/pages/ComplianceExportPage";
import ErrorAnalysisDashboard from "@/pages/ErrorAnalysisDashboard";
import PolicyManagement from "@/pages/PolicyManagement";
import AgentDetailPage from "@/pages/AgentDetailPage";
import { AgentList } from "@/pages/AgentList";
import { AgentEditor } from "@/pages/AgentEditor";
import AutoRemediationPage from "@/pages/AutoRemediationPage";
import ToolsManagementPage from "@/pages/ToolsManagementPage";
import WikiPage from "@/pages/WikiPage";
import WikiArticle from "@/pages/WikiArticle";
import WikiEditor from "@/pages/WikiEditor";
import LLMDashboard from "@/pages/LLMDashboard";
import LLMControlPlane from "@/pages/LLMControlPlane";
import LLMWizard from "@/pages/LLMWizard";
import LLMCreationWizard from "@/pages/LLMCreationWizard";
import LLMProviderConfigWizard from "@/pages/LLMProviderConfigWizard";
import LLMPromotions from "@/pages/LLMPromotions";
import LLMDetailPage from "@/pages/LLMDetailPage";
import LLMTrainingDashboard from "@/pages/LLMTrainingDashboard";
import DeploymentStatus from "@/pages/DeploymentStatus";
import { Loader2 } from "lucide-react";

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
      <Route path="/workspaces/:id" component={() => <ProtectedRoute component={WorkspaceDetail} />} />
      <Route path="/models" component={() => <ProtectedRoute component={Models} />} />
      <Route path="/hardware" component={() => <ProtectedRoute component={HardwareProfile} />} />
          <Route path="/analytics/downloads" component={() => <ProtectedRoute component={DownloadAnalytics} />} />
          <Route path="/inference" component={() => <ProtectedRoute component={LocalInference} />} />
          <Route path="/documents/dashboard" component={() => <ProtectedRoute component={DocumentsDashboard} />} />
          <Route path="/documents/upload" component={() => <ProtectedRoute component={DocumentUpload} />} />
          <Route path="/code" component={() => <ProtectedRoute component={CodeEditor} />} />
      <Route path="/embeddings" component={() => <ProtectedRoute component={EmbeddingsManagement} />} />
      <Route path="/vectordb" component={() => <ProtectedRoute component={VectorDBManagement} />} />
      <Route path="/agents/dashboard" component={() => <ProtectedRoute component={AgentDashboard} />} />
      <Route path="/agents/templates" component={() => <ProtectedRoute component={AgentTemplates} />} />
      <Route path="/automation/builder" component={() => <ProtectedRoute component={AutomationBuilder} />} />
      <Route path="/automation/executions/:id" component={() => <ProtectedRoute component={AutomationExecutionDetails} />} />
      <Route path="/automation/executions" component={() => <ProtectedRoute component={AutomationExecutions} />} />
      <Route path="/automation/triggers" component={() => <ProtectedRoute component={TriggersStore} />} />
      <Route path="/automation/actions" component={() => <ProtectedRoute component={ActionsStore} />} />
      <Route path="/automation/settings" component={() => <ProtectedRoute component={AutomationSettings} />} />
        <Route path="/automation/secrets" component={SecretsPage} />
        <Route path="/templates" component={TemplatesPage} />
        <Route path="/agents" component={AgentsPage} />
        <Route path="/agents/create" component={AgentsPage} />
        <Route path="/agents/:id" component={AgentDetailPage} />
        <Route path="/agent-dashboard" component={AgentDashboardPage} />
        <Route path="/protocols" component={ProtocolsPage} />
        <Route path="/promotion-requests" component={PromotionRequestsPage} />
        <Route path="/drift-detection" component={() => <ProtectedRoute component={DriftDetectionPage} />} />
      <Route path="/compliance-export" component={() => <ProtectedRoute component={ComplianceExportPage} />} />
      <Route path="/auto-remediation" component={() => <ProtectedRoute component={AutoRemediationPage} />} />
      <Route path="/tools-management" component={() => <ProtectedRoute component={ToolsManagementPage} />} />
      <Route path="/documents" component={() => <ProtectedRoute component={Documents} />} />
      <Route path="/agents" component={() => <ProtectedRoute component={Agents} />} />
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
      <Route path="/providers" component={() => <ProtectedRoute component={Providers} />} />
      <Route path="/providers/:id" component={() => <ProtectedRoute component={ProviderDetail} />} />
              <Route path="/providers-analytics" component={() => <ProtectedRoute component={ProviderAnalytics} />} />
              <Route path="/models/browser" component={() => <ProtectedRoute component={ModelBrowser} />} />
      <Route path="/analytics" component={() => <ProtectedRoute component={Analytics} />} />
      <Route path="/infrastructure/hardware/:category" component={() => <ProtectedRoute component={HardwarePage} />} />
      <Route path="/infrastructure/software/:item" component={() => <ProtectedRoute component={SoftwarePage} />} />
      <Route path="/error-analysis" component={() => <ProtectedRoute component={ErrorAnalysisDashboard} />} />
      <Route path="/policies" component={() => <ProtectedRoute component={PolicyManagement} />} />
      <Route path="/agent-detail/:id" component={() => <ProtectedRoute component={AgentDetailPage} />} />
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
      {/* Deployment Status Page */}
      <Route path="/deployment-status" component={() => <ProtectedRoute component={DeploymentStatus} />} />
      <Route path="/llm/:id" component={() => <ProtectedRoute component={LLMDetailPage} />} />
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
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
