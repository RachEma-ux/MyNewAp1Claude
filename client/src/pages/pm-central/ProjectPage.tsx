/**
 * ProjectPage — Project-level layout with 7-section sidebar + tool panels
 *
 * Route: /pm-central/p/:id/:tool
 * Renders PMProjectSidebar + the active tool panel side by side.
 */

import { useRoute } from "wouter";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
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
// -- Legacy aliases --
const ProjectReportsPanel = lazy(() => import("./project/ProjectReportsPanel"));
const PolicyPanel = lazy(() => import("./project/PolicyPanel"));

function ToolPanel({ tool, projectId }: { tool: string; projectId: number }) {
  const fallback = (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

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
      <ToolPanel tool={tool} projectId={projectId} />
    </PmCentralSidebarLayout>
  );
}
