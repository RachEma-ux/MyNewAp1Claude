/**
 * ProjectPage — Project-level layout with 7-section sidebar + tool panels
 *
 * Route: /pm-central/p/:id/:tool
 * Renders PMProjectSidebar + the active tool panel side by side.
 */

import { useRoute, useLocation } from "wouter";
import { lazy, Suspense } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import PMProjectSidebar from "@/components/pm/PMProjectSidebar";
import PmCentralSidebarLayout from "@/components/pm/PmCentralSidebarLayout";

// Lazy-load all tool panels for code splitting
// -- Project section --
const OverviewPanel = lazy(() => import("./project/OverviewPanel"));
const CharterPanel = lazy(() => import("./project/CharterPanel"));
const ScopeWbsPanel = lazy(() => import("./project/ScopeWbsPanel"));
const MilestonesPanel = lazy(() => import("./project/MilestonesPanel"));
// -- Plan section --
const TimelinePanel = lazy(() => import("./project/TimelinePanel"));
const BudgetPanel = lazy(() => import("./project/BudgetPanel"));
const ResourcesPanel = lazy(() => import("./project/ResourcesPanel"));
const BaselinesPanel = lazy(() => import("./project/BaselinesPanel"));
// -- Execute section --
const TaskBoardPanel = lazy(() => import("./project/TaskBoardPanel"));
const DeliverablesPanel = lazy(() => import("./project/DeliverablesPanel"));
const WorklogPanel = lazy(() => import("./project/WorklogPanel"));
const IterationsPanel = lazy(() => import("./project/IterationsPanel"));
// -- Follow-up section --
const MyFollowupsPanel = lazy(() => import("./project/MyFollowupsPanel"));
const ActionItemsPanel = lazy(() => import("./project/ActionItemsPanel"));
const StatusUpdatesPanel = lazy(() => import("./project/StatusUpdatesPanel"));
const DecisionsPanel = lazy(() => import("./project/DecisionsPanel"));
// -- Control section --
const ProjectRisksPanel = lazy(() => import("./project/ProjectRisksPanel"));
const IssuesPanel = lazy(() => import("./project/IssuesPanel"));
const ProjectChangesPanel = lazy(() => import("./project/ProjectChangesPanel"));
const ApprovalsPanel = lazy(() => import("./project/ApprovalsPanel"));
// -- Collaboration section --
const ThreadsPanel = lazy(() => import("./project/ThreadsPanel"));
const DocsPanel = lazy(() => import("./project/DocsPanel"));
const MeetingsPanel = lazy(() => import("./project/MeetingsPanel"));
const ParticipantsPanel = lazy(() => import("./project/ParticipantsPanel"));
// -- Governance section --
const GateCenterPanel = lazy(() => import("./project/GateCenterPanel"));
const FreezeHoldsPanel = lazy(() => import("./project/FreezeHoldsPanel"));
const EvidencePanel = lazy(() => import("./project/EvidencePanel"));
const ScorecardPanel = lazy(() => import("./project/ScorecardPanel"));
// -- AI Agents section --
const ProjectAgentRunsPanel = lazy(() => import("./project/ProjectAgentRunsPanel"));
// -- Legacy aliases --
const ProjectReportsPanel = lazy(() => import("./project/ProjectReportsPanel"));
const PolicyPanel = lazy(() => import("./project/PolicyPanel"));

function ToolPanel({ tool, projectId }: { tool: string; projectId: number }) {
  const fallback = null;

  const panelMap: Record<string, React.ReactNode> = {
    // Project
    overview: <OverviewPanel projectId={projectId} />,
    charter: <CharterPanel projectId={projectId} />,
    wbs: <ScopeWbsPanel projectId={projectId} />,
    milestones: <MilestonesPanel projectId={projectId} />,
    // Plan
    timeline: <TimelinePanel projectId={projectId} />,
    budget: <BudgetPanel projectId={projectId} />,
    resources: <ResourcesPanel projectId={projectId} />,
    baselines: <BaselinesPanel projectId={projectId} />,
    // Execute
    tasks: <TaskBoardPanel projectId={projectId} />,
    deliverables: <DeliverablesPanel projectId={projectId} />,
    worklog: <WorklogPanel projectId={projectId} />,
    iterations: <IterationsPanel projectId={projectId} />,
    // Follow-up
    "follow-ups": <MyFollowupsPanel projectId={projectId} />,
    "action-items": <ActionItemsPanel projectId={projectId} />,
    "status-updates": <StatusUpdatesPanel projectId={projectId} />,
    decisions: <DecisionsPanel projectId={projectId} />,
    // Control
    risks: <ProjectRisksPanel projectId={projectId} />,
    issues: <IssuesPanel projectId={projectId} />,
    changes: <ProjectChangesPanel projectId={projectId} />,
    approvals: <ApprovalsPanel projectId={projectId} />,
    // Collaboration
    threads: <ThreadsPanel projectId={projectId} />,
    docs: <DocsPanel projectId={projectId} />,
    meetings: <MeetingsPanel projectId={projectId} />,
    participants: <ParticipantsPanel projectId={projectId} />,
    // AI Agents
    "agent-runs": <ProjectAgentRunsPanel projectId={projectId} />,
    // Governance
    gates: <GateCenterPanel projectId={projectId} />,
    "freeze-holds": <FreezeHoldsPanel projectId={projectId} />,
    evidence: <EvidencePanel projectId={projectId} />,
    scorecard: <ScorecardPanel projectId={projectId} />,
    // Legacy aliases
    reports: <ProjectReportsPanel projectId={projectId} />,
    policy: <PolicyPanel projectId={projectId} />,
  };

  return (
    <Suspense fallback={fallback}>
      {panelMap[tool] || <OverviewPanel projectId={projectId} />}
    </Suspense>
  );
}

function ProjectActions({ projectId }: { projectId: number }) {
  const [, navigate] = useLocation();
  const { data: project } = trpc.modules.pmt.shell.projects.get.useQuery(
    { id: projectId },
    { enabled: projectId > 0 },
  );

  // Only show clone for projects past draft_shell
  if (!project || project.status === "draft_shell") return null;

  return (
    <div className="flex justify-end px-4 pt-2 pb-1">
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate(`/pm-central/shell/clone/${projectId}`)}
      >
        <Copy className="h-3.5 w-3.5 mr-1.5" />
        Clone Project
      </Button>
    </div>
  );
}

export default function ProjectPage() {
  // Match /pm-central/p/:id/:tool (primary) and /pm-central/project/:id/:tool (legacy)
  const [, params] = useRoute("/pm-central/p/:id/:tool");
  const [, params2] = useRoute("/pm-central/p/:id");
  const [, params3] = useRoute("/pm-central/project/:id/:tool");
  const [, params4] = useRoute("/pm-central/project/:id");

  const id = params?.id || params2?.id || params3?.id || params4?.id;
  const tool = params?.tool || params3?.tool || "overview";
  const projectId = id ? parseInt(id, 10) : 0;

  if (!projectId || isNaN(projectId)) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Invalid project ID
      </div>
    );
  }

  return (
    <PmCentralSidebarLayout
      sidebar={<PMProjectSidebar projectId={projectId} activeTool={tool} />}
    >
      <ProjectActions projectId={projectId} />
      <ToolPanel tool={tool} projectId={projectId} />
    </PmCentralSidebarLayout>
  );
}
