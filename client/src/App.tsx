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
import InstallPrompt from "./components/InstallPrompt";
import { Loader2 } from "lucide-react";
import { useHrRole } from "@/hooks/useHrRole";

// Lazy-loaded page components (code splitting)
const Home = lazy(() => import("./pages/Home"));
// Old workspace pages removed — use WorkspaceExecutionShell via /w/:id
const Models = lazy(() => import("./pages/Models"));
const Documents = lazy(() => import("./pages/Documents"));
// Agents page replaced by AgentsPage (governance-aware)
const AgentChat = lazy(() => import("./pages/AgentChat"));
const CatalogAgentChat = lazy(() => import("./pages/CatalogAgentChat"));
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
// HR Module — Phase 2 Section Landing Pages (reusable component)
const HRSectionLandingPage = lazy(() => import("@/pages/hr/HRSectionLandingPage"));
// HR Module — Phase 1 pages
const HRHomePage = lazy(() => import("@/pages/hr/HRHomePage"));
const HRDirectoryPage = lazy(() => import("@/pages/hr/HRDirectoryPage"));
const HROrganizationPage = lazy(() => import("@/pages/hr/HROrganizationPage"));
const HRPositionsPage = lazy(() => import("@/pages/hr/HRPositionsPage"));
const HRStaffingPage = lazy(() => import("@/pages/hr/HRStaffingPage"));
const HRSkillsPage = lazy(() => import("@/pages/hr/HRSkillsPage"));
const HRReportsPage = lazy(() => import("@/pages/hr/HRReportsPage"));
const HRSettingsPage = lazy(() => import("@/pages/hr/HRSettingsPage"));
// HR Module — Phase 2 pages (Lifecycle Workflows)
const HRRecruitmentPage = lazy(() => import("@/pages/hr/HRRecruitmentPage"));
const HROnboardingPage = lazy(() => import("@/pages/hr/HROnboardingPage"));
const HROffboardingPage = lazy(() => import("@/pages/hr/HROffboardingPage"));
// HR Module — Phase 3 pages (Workforce Operations)
const HRTimesheetPage = lazy(() => import("@/pages/hr/HRTimesheetPage"));
const HRLeavePage = lazy(() => import("@/pages/hr/HRLeavePage"));
const HROvertimePage = lazy(() => import("@/pages/hr/HROvertimePage"));
const HRShiftPlanningPage = lazy(() => import("@/pages/hr/HRShiftPlanningPage"));
const HRTrainingPage = lazy(() => import("@/pages/hr/HRTrainingPage"));
const HRCertificationsPage = lazy(() => import("@/pages/hr/HRCertificationsPage"));
const HRGoalsPage = lazy(() => import("@/pages/hr/HRGoalsPage"));
const HRPerformanceReviewsPage = lazy(() => import("@/pages/hr/HRPerformanceReviewsPage"));
// HR Module — Phase 4 pages (Compensation, Relations, Engagement, Compliance, Analytics, Talent)
const HRCompensationPage = lazy(() => import("@/pages/hr/HRCompensationPage"));
const HRBenefitsPage = lazy(() => import("@/pages/hr/HRBenefitsPage"));
const HRPoliciesPage = lazy(() => import("@/pages/hr/HRPoliciesPage"));
const HRGrievancesPage = lazy(() => import("@/pages/hr/HRGrievancesPage"));
const HRSurveysPage = lazy(() => import("@/pages/hr/HRSurveysPage"));
const HREngagementPage = lazy(() => import("@/pages/hr/HREngagementPage"));
const HRIncidentsPage = lazy(() => import("@/pages/hr/HRIncidentsPage"));
const HRComplianceMgmtPage = lazy(() => import("@/pages/hr/HRComplianceMgmtPage"));
const HRAnalyticsDashboardPage = lazy(() => import("@/pages/hr/HRAnalyticsDashboardPage"));
const HRTalentPage = lazy(() => import("@/pages/hr/HRTalentPage"));
// HR Module — Phase 4 expansion pages (Job Architecture, Work Permits, Letters, Risk, Audit, Access)
const HRJobArchitecturePage = lazy(() => import("@/pages/hr/HRJobArchitecturePage"));
const HRWorkPermitsPage = lazy(() => import("@/pages/hr/HRWorkPermitsPage"));
const HRLettersCertificatesPage = lazy(() => import("@/pages/hr/HRLettersCertificatesPage"));
const HRRiskManagementPage = lazy(() => import("@/pages/hr/HRRiskManagementPage"));
const HRAuditLogsPage = lazy(() => import("@/pages/hr/HRAuditLogsPage"));
const HRAccessControlsPage = lazy(() => import("@/pages/hr/HRAccessControlsPage"));
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
const ProviderConnectionsPage = lazy(() => import("@/pages/ProviderConnectionsPage"));
const UIShowcasePage = lazy(() => import("@/pages/UIShowcasePage"));
const GovernanceScorecard = lazy(() => import("@/pages/GovernanceScorecard"));
const AITypesPage = lazy(() => import("@/pages/AITypesPage"));
const DigitalHQPage = lazy(() => import("@/pages/DigitalHQPage"));
const GovernanceCenterPage = lazy(() => import("@/pages/GovernanceCenterPage"));
const RunConsolePage = lazy(() => import("@/pages/RunConsolePage"));
const CollaborationPage = lazy(() => import("@/pages/CollaborationPage"));
const PMCentralPage = lazy(() => import("@/pages/PMCentralPage"));
const ProjectPage = lazy(() => import("@/pages/pm-central/ProjectPage"));
const ShellNewPage = lazy(() => import("@/pages/pm-central/ShellNewPage"));
const InboxPage = lazy(() => import("@/pages/pm-central/InboxPage"));
const WizardPage = lazy(() => import("@/pages/pm-central/WizardPage"));
const MethodesPage = lazy(() => import("@/pages/pm-central/MethodesPage"));
const ShellClonePage = lazy(() => import("@/pages/pm-central/ShellClonePage"));
const AgentRunDetailPanel = lazy(() => import("@/pages/pm-central/AgentRunDetailPanel"));
const IdeaBuilderWizard = lazy(() => import("@/pages/pm-central/IdeaBuilderWizard"));

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

/** HR role gate — shows access-denied if user lacks the required HR action */
function HrGate({ action, children }: { action: string; children: React.ReactNode }) {
  const { can, isLoading } = useHrRole();
  if (isLoading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!can(action)) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <h2 className="text-lg font-semibold mb-2">Access Restricted</h2>
        <p className="text-sm text-muted-foreground">You don't have permission to view this HR section.</p>
      </div>
    );
  }
  return <>{children}</>;
}

/** Helper: wrap an HR page component with role gating */
function hrGated(Component: React.ComponentType, action: string) {
  return function HrGatedPage() {
    return <HrGate action={action}><Component /></HrGate>;
  };
}

// HR role-gated page wrappers for sensitive areas
const HrOrganizationGated = hrGated(HROrganizationPage, "hr.organization.read");
const HrPositionsGated = hrGated(HRPositionsPage, "hr.staffing.read");
const HrStaffingGated = hrGated(HRStaffingPage, "hr.staffing.read");
const HrRecruitmentGated = hrGated(HRRecruitmentPage, "hr.recruiting.read");
const HrOnboardingGated = hrGated(HROnboardingPage, "hr.onboarding.read");
const HrOffboardingGated = hrGated(HROffboardingPage, "hr.offboarding.read");
const HrOvertimeGated = hrGated(HROvertimePage, "hr.overtime.read");
const HrShiftPlanningGated = hrGated(HRShiftPlanningPage, "hr.shift.read");
const HrCompensationGated = hrGated(HRCompensationPage, "hr.compensation.read");
const HrGrievancesGated = hrGated(HRGrievancesPage, "hr.relations.read");
const HrIncidentsGated = hrGated(HRIncidentsPage, "hr.incident.read");
const HrComplianceMgmtGated = hrGated(HRComplianceMgmtPage, "hr.compliance.read");
const HrAnalyticsGated = hrGated(HRAnalyticsDashboardPage, "hr.analytics.read");
const HrTalentGated = hrGated(HRTalentPage, "hr.talent.read");
const HrReportsGated = hrGated(HRReportsPage, "hr.analytics.read");
const HrSettingsGated = hrGated(HRSettingsPage, "hr.analytics.manage");
const HrJobArchitectureGated = hrGated(HRJobArchitecturePage, "hr.organization.read");
const HrWorkPermitsGated = hrGated(HRWorkPermitsPage, "hr.compliance.read");
const HrLettersCertificatesGated = hrGated(HRLettersCertificatesPage, "hr.directory.read");
const HrRiskManagementGated = hrGated(HRRiskManagementPage, "hr.risk.read");
const HrAuditLogsGated = hrGated(HRAuditLogsPage, "hr.analytics.manage");
const HrAccessControlsGated = hrGated(HRAccessControlsPage, "hr.analytics.manage");

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <ProtectedRoute component={Home} />} />
      {/* WS Sandbox — workspace management surfaces */}
      <Route path="/ws/dashboard" component={() => <ProtectedRoute component={WSDashboardPage} />} />
      <Route path="/ws/control-panel" component={() => <ProtectedRoute component={WSControlPanelPage} />} />
      <Route path="/ws/wizard" component={() => <ProtectedRoute component={WSWizardPage} />} />
      <Route path="/ws/list" component={() => <ProtectedRoute component={WSListPage} />} />
      <Route path="/ws/catalog" component={() => <ProtectedRoute component={WSCatalogPage} />} />
      {/* HR Module — Phase 2 Section Landing Pages (grouped entry points) */}
      <Route path="/hr/workforce-planning" component={() => <ProtectedRoute component={() => <HRSectionLandingPage sectionId="workforce-planning" />} />} />
      <Route path="/hr/talent-acquisition" component={() => <ProtectedRoute component={() => <HRSectionLandingPage sectionId="talent-acquisition" />} />} />
      <Route path="/hr/lifecycle" component={() => <ProtectedRoute component={() => <HRSectionLandingPage sectionId="onboarding-offboarding" />} />} />
      <Route path="/hr/employee-records" component={() => <ProtectedRoute component={() => <HRSectionLandingPage sectionId="employee-records" />} />} />
      <Route path="/hr/compensation-benefits" component={() => <ProtectedRoute component={() => <HRSectionLandingPage sectionId="compensation-benefits" />} />} />
      <Route path="/hr/time-attendance" component={() => <ProtectedRoute component={() => <HRSectionLandingPage sectionId="time-attendance" />} />} />
      <Route path="/hr/learning-development" component={() => <ProtectedRoute component={() => <HRSectionLandingPage sectionId="learning-development" />} />} />
      <Route path="/hr/performance-talent" component={() => <ProtectedRoute component={() => <HRSectionLandingPage sectionId="performance-talent" />} />} />
      <Route path="/hr/employee-relations" component={() => <ProtectedRoute component={() => <HRSectionLandingPage sectionId="employee-relations" />} />} />
      <Route path="/hr/wellbeing-engagement" component={() => <ProtectedRoute component={() => <HRSectionLandingPage sectionId="wellbeing-engagement" />} />} />
      <Route path="/hr/analytics-reporting" component={() => <ProtectedRoute component={() => <HRSectionLandingPage sectionId="analytics-reporting" />} />} />
      <Route path="/hr/security-access" component={() => <ProtectedRoute component={() => <HRSectionLandingPage sectionId="security-access" />} />} />
      <Route path="/hr/compliance" component={() => <ProtectedRoute component={() => <HRSectionLandingPage sectionId="compliance" />} />} />
      {/* HR Module — Employee self-service (all authenticated users, existing flat routes preserved) */}
      <Route path="/hr/directory" component={() => <ProtectedRoute component={HRDirectoryPage} />} />
      <Route path="/hr/timesheet" component={() => <ProtectedRoute component={HRTimesheetPage} />} />
      <Route path="/hr/leave" component={() => <ProtectedRoute component={HRLeavePage} />} />
      <Route path="/hr/goals" component={() => <ProtectedRoute component={HRGoalsPage} />} />
      <Route path="/hr/reviews" component={() => <ProtectedRoute component={HRPerformanceReviewsPage} />} />
      <Route path="/hr/training" component={() => <ProtectedRoute component={HRTrainingPage} />} />
      <Route path="/hr/certifications" component={() => <ProtectedRoute component={HRCertificationsPage} />} />
      <Route path="/hr/benefits" component={() => <ProtectedRoute component={HRBenefitsPage} />} />
      <Route path="/hr/policies" component={() => <ProtectedRoute component={HRPoliciesPage} />} />
      <Route path="/hr/surveys" component={() => <ProtectedRoute component={HRSurveysPage} />} />
      <Route path="/hr/engagement" component={() => <ProtectedRoute component={HREngagementPage} />} />
      <Route path="/hr/skills" component={() => <ProtectedRoute component={HRSkillsPage} />} />
      {/* HR Module — Role-gated routes (require specific HR permissions) */}
      <Route path="/hr/organization" component={() => <ProtectedRoute component={HrOrganizationGated} />} />
      <Route path="/hr/positions" component={() => <ProtectedRoute component={HrPositionsGated} />} />
      <Route path="/hr/staffing" component={() => <ProtectedRoute component={HrStaffingGated} />} />
      <Route path="/hr/recruitment" component={() => <ProtectedRoute component={HrRecruitmentGated} />} />
      <Route path="/hr/onboarding" component={() => <ProtectedRoute component={HrOnboardingGated} />} />
      <Route path="/hr/offboarding" component={() => <ProtectedRoute component={HrOffboardingGated} />} />
      <Route path="/hr/overtime" component={() => <ProtectedRoute component={HrOvertimeGated} />} />
      <Route path="/hr/shifts" component={() => <ProtectedRoute component={HrShiftPlanningGated} />} />
      <Route path="/hr/compensation" component={() => <ProtectedRoute component={HrCompensationGated} />} />
      <Route path="/hr/grievances" component={() => <ProtectedRoute component={HrGrievancesGated} />} />
      <Route path="/hr/incidents" component={() => <ProtectedRoute component={HrIncidentsGated} />} />
      <Route path="/hr/compliance-mgmt" component={() => <ProtectedRoute component={HrComplianceMgmtGated} />} />
      <Route path="/hr/analytics" component={() => <ProtectedRoute component={HrAnalyticsGated} />} />
      <Route path="/hr/talent" component={() => <ProtectedRoute component={HrTalentGated} />} />
      <Route path="/hr/reports" component={() => <ProtectedRoute component={HrReportsGated} />} />
      <Route path="/hr/settings" component={() => <ProtectedRoute component={HrSettingsGated} />} />
      <Route path="/hr" component={() => <ProtectedRoute component={HRHomePage} />} />
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
      {/* Models — governed model registry */}
      <Route path="/models/dashboard" component={() => <ProtectedRoute component={ModelsComingSoonPage} />} />
      <Route path="/models/control-panel" component={() => <ProtectedRoute component={ModelsComingSoonPage} />} />
      <Route path="/models/wizard" component={() => <ProtectedRoute component={ModelsComingSoonPage} />} />
      <Route path="/models" component={() => <ProtectedRoute component={Models} />} />
      <Route path="/hardware" component={() => <ProtectedRoute component={HardwareProfile} />} />
      <Route path="/analytics/downloads" component={() => <ProtectedRoute component={DownloadAnalytics} />} />
      <Route path="/inference" component={() => <ProtectedRoute component={LocalInference} />} />
      <Route path="/documents/dashboard" component={() => <ProtectedRoute component={DocumentsDashboard} />} />
      <Route path="/documents/upload" component={() => <ProtectedRoute component={DocumentUpload} />} />
      <Route path="/code" component={() => <ProtectedRoute component={CodeEditor} />} />
      <Route path="/embeddings" component={() => <ProtectedRoute component={EmbeddingsManagement} />} />
      <Route path="/vectordb" component={() => <ProtectedRoute component={VectorDBManagement} />} />
      {/* Agents — governed agent lifecycle */}
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
      <Route path="/agents/wizard" component={() => <ProtectedRoute component={AgentsPage} />} />
      <Route path="/agents/control-panel" component={() => <ProtectedRoute component={AgentControlPanelPage} />} />
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
      <Route path="/chat" component={() => <ProtectedRoute component={Chat} />} />
      <Route path="/conversations" component={() => <ProtectedRoute component={Conversations} />} />
      <Route path="/automation" component={() => <ProtectedRoute component={Automation} />} />
      <Route path="/wcp/workflows" component={() => <ProtectedRoute component={WCPWorkflowsList} />} />
      <Route path="/wcp/workflows/builder" component={() => <ProtectedRoute component={WCPWorkflowBuilder} />} />
      <Route path="/wcp/executions" component={() => <ProtectedRoute component={WCPExecutions} />} />
      <Route path="/wcp/executions/:id" component={() => <ProtectedRoute component={WCPExecutionDetails} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
      <Route path="/resources" component={() => <ProtectedRoute component={ResourceMonitor} />} />
      {/* Providers — governed provider lifecycle */}
      <Route path="/providers/control-panel" component={() => <ProtectedRoute component={ProviderControlPanelPage} />} />
      <Route path="/providers/dashboard" component={() => <ProtectedRoute component={ProvidersComingSoonPage} />} />
      <Route path="/providers/wizard" component={() => <ProtectedRoute component={ProviderWizardPage} />} />
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
      {/* /list/llms — real LLM inventory list page */}
      <Route path="/list/llms" component={() => <ProtectedRoute component={LLMListPage} />} />
      {/* /list/models — real model inventory list page */}
      <Route path="/list/models" component={() => <ProtectedRoute component={ModelListPage} />} />
      {/* /list/bots — real bot inventory list page */}
      <Route path="/list/bots" component={() => <ProtectedRoute component={BotListPage} />} />
      {/* /list/providers — real provider inventory list page */}
      <Route path="/list/providers" component={() => <ProtectedRoute component={ProviderListPage} />} />
      {/* Coming Soon list pages */}
      <Route path="/list/:type" component={() => <ProtectedRoute component={ComingSoonListPage} />} />
      {/* Bots — governed bot lifecycle */}
      <Route path="/bots/dashboard" component={() => <ProtectedRoute component={BotsComingSoonPage} />} />
      <Route path="/bots/control-panel" component={() => <ProtectedRoute component={BotsComingSoonPage} />} />
      <Route path="/bots/wizard" component={() => <ProtectedRoute component={BotsComingSoonPage} />} />
      <Route path="/bots" component={() => <ProtectedRoute component={BotsComingSoonPage} />} />
      {/* Redirect stale /agent-detail/:id to canonical /agents/:id */}
      <Route path="/agent-detail/:id">{(params) => <Redirect to={`/agents/${params.id}`} />}</Route>
      {/* Governance agent routes — consolidated under /governance/agents */}
      <Route path="/governance/agents" component={() => <ProtectedRoute component={AgentList} />} />
      <Route path="/governance/agents/create" component={() => <ProtectedRoute component={() => <AgentEditor />} />} />
      <Route path="/governance/agents/:agentId/edit" component={({ agentId }) => <ProtectedRoute component={() => <AgentEditor agentId={agentId} />} />} />
      <Route path="/wiki" component={() => <ProtectedRoute component={WikiPage} />} />
      <Route path="/wiki/:slug" component={() => <ProtectedRoute component={WikiArticle} />} />
      <Route path="/wiki/edit/:id" component={() => <ProtectedRoute component={WikiEditor} />} />
      {/* LLMs — governed LLM lifecycle */}
      <Route path="/llm" component={() => <ProtectedRoute component={LLMDashboard} />} />
      <Route path="/llm/control-panel" component={() => <ProtectedRoute component={LLMControlPlane} />} />
      <Route path="/llm/control-plane">{() => <Redirect to="/llm/control-panel" />}</Route>
      <Route path="/llm/register" component={() => <ProtectedRoute component={LLMWizard} />} />
      <Route path="/llm/create">{() => <Redirect to="/llm/register" />}</Route>
      <Route path="/llm/wizard" component={() => <ProtectedRoute component={LLMCreationWizard} />} />
      <Route path="/llm/training" component={() => <ProtectedRoute component={LLMTrainingDashboard} />} />
      <Route path="/llm/promotions" component={() => <ProtectedRoute component={LLMPromotions} />} />
      {/* Provider configuration wizards (legacy LLM-scoped, redirect to /providers/wizard for new usage) */}
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
      <Route path="/governance" component={() => <Redirect to="/governance/overview" />} />
      <Route path="/governance/:item" component={() => <ProtectedRoute component={GovernanceCenterPage} />} />
      {/* Operator Runtime — Multi-Operator Autonomous Platform */}
      <Route path="/run-console" component={() => <ProtectedRoute component={RunConsolePage} />} />
      {/* Collaboration */}
      <Route path="/collaboration" component={() => <ProtectedRoute component={CollaborationPage} />} />
      {/* PM Central — Project creation, clone + inbox (must be before :id catch-all) */}
      <Route path="/pm-central/shell/clone/:sourceId" component={() => <ProtectedRoute component={ShellClonePage} />} />
      <Route path="/pm-central/shell/new" component={() => <ProtectedRoute component={ShellNewPage} />} />
      <Route path="/pm-central/inbox" component={() => <ProtectedRoute component={InboxPage} />} />
      {/* PM Central — Méthodes (nested routes before generic :item catch-all) */}
      <Route path="/pm-central/methodes/detail/:methodId" component={() => <ProtectedRoute component={MethodesPage} />} />
      <Route path="/pm-central/methodes/:categoryId" component={() => <ProtectedRoute component={MethodesPage} />} />
      <Route path="/pm-central/methodes" component={() => <ProtectedRoute component={MethodesPage} />} />
      {/* PM Central — Wizard routes (must be before generic /p/:id/:tool) */}
      <Route path="/pm-central/p/:id/wizard/:step" component={() => <ProtectedRoute component={WizardPage} />} />
      <Route path="/pm-central/p/:id/wizard" component={() => <ProtectedRoute component={WizardPage} />} />
      {/* PM Central — Project-level views /pm-central/p/:id/:tool */}
      <Route path="/pm-central/p/:id/:tool" component={() => <ProtectedRoute component={ProjectPage} />} />
      <Route path="/pm-central/p/:id" component={() => <ProtectedRoute component={ProjectPage} />} />
      {/* PM Central — Legacy route compat (/pm-central/project/:id/:tool) */}
      <Route path="/pm-central/project/:id/:tool" component={() => <ProtectedRoute component={ProjectPage} />} />
      <Route path="/pm-central/project/:id" component={() => <ProtectedRoute component={ProjectPage} />} />
      {/* PM Central — Agent Engine run detail (must be before :item catch-all) */}
      <Route path="/pm-central/agent-engine/run/:id" component={() => <ProtectedRoute component={AgentRunDetailPanel} />} />
      <Route path="/pm-central/idea-builder" component={() => <ProtectedRoute component={IdeaBuilderWizard} />} />
      {/* PM Central — Top-level views */}
      <Route path="/pm-central/:item" component={() => <ProtectedRoute component={PMCentralPage} />} />
      <Route path="/pm-central" component={() => <ProtectedRoute component={PMCentralPage} />} />
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
          <InstallPrompt />
          <Suspense fallback={null}>
            <Router />
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
