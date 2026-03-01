/**
 * ProjectPage — Project-level layout with smart sidebar + tool panels
 *
 * Route: /pm-central/project/:id/:tool
 * Renders PMProjectSidebar + the active tool panel side by side.
 */

import { useRoute } from "wouter";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import PMProjectSidebar from "@/components/pm/PMProjectSidebar";

// Lazy-load tool panels for code splitting
const OverviewPanel = lazy(() => import("./project/OverviewPanel"));
const TaskBoardPanel = lazy(() => import("./project/TaskBoardPanel"));
const TimelinePanel = lazy(() => import("./project/TimelinePanel"));
const DeliverablesPanel = lazy(() => import("./project/DeliverablesPanel"));
const ProjectRisksPanel = lazy(() => import("./project/ProjectRisksPanel"));
const IssuesPanel = lazy(() => import("./project/IssuesPanel"));
const ProjectChangesPanel = lazy(() => import("./project/ProjectChangesPanel"));
const ApprovalsPanel = lazy(() => import("./project/ApprovalsPanel"));
const StatusUpdatesPanel = lazy(() => import("./project/StatusUpdatesPanel"));
const ActionItemsPanel = lazy(() => import("./project/ActionItemsPanel"));
const DecisionsPanel = lazy(() => import("./project/DecisionsPanel"));
const ProjectReportsPanel = lazy(() => import("./project/ProjectReportsPanel"));
const ThreadsPanel = lazy(() => import("./project/ThreadsPanel"));
const DocsPanel = lazy(() => import("./project/DocsPanel"));
const MeetingsPanel = lazy(() => import("./project/MeetingsPanel"));
const ParticipantsPanel = lazy(() => import("./project/ParticipantsPanel"));
const GateCenterPanel = lazy(() => import("./project/GateCenterPanel"));
const EvidencePanel = lazy(() => import("./project/EvidencePanel"));
const PolicyPanel = lazy(() => import("./project/PolicyPanel"));
const BudgetPanel = lazy(() => import("./project/BudgetPanel"));

function ToolPanel({ tool, projectId }: { tool: string; projectId: number }) {
  const fallback = (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  const panelMap: Record<string, React.ReactNode> = {
    overview: <OverviewPanel projectId={projectId} />,
    tasks: <TaskBoardPanel projectId={projectId} />,
    timeline: <TimelinePanel projectId={projectId} />,
    deliverables: <DeliverablesPanel projectId={projectId} />,
    risks: <ProjectRisksPanel projectId={projectId} />,
    issues: <IssuesPanel projectId={projectId} />,
    changes: <ProjectChangesPanel projectId={projectId} />,
    approvals: <ApprovalsPanel projectId={projectId} />,
    "status-updates": <StatusUpdatesPanel projectId={projectId} />,
    "action-items": <ActionItemsPanel projectId={projectId} />,
    decisions: <DecisionsPanel projectId={projectId} />,
    reports: <ProjectReportsPanel projectId={projectId} />,
    threads: <ThreadsPanel projectId={projectId} />,
    docs: <DocsPanel projectId={projectId} />,
    meetings: <MeetingsPanel projectId={projectId} />,
    participants: <ParticipantsPanel projectId={projectId} />,
    gates: <GateCenterPanel projectId={projectId} />,
    evidence: <EvidencePanel projectId={projectId} />,
    policy: <PolicyPanel projectId={projectId} />,
    budget: <BudgetPanel projectId={projectId} />,
  };

  return (
    <Suspense fallback={fallback}>
      {panelMap[tool] || <OverviewPanel projectId={projectId} />}
    </Suspense>
  );
}

export default function ProjectPage() {
  // Match /pm-central/project/:id/:tool
  const [, params] = useRoute("/pm-central/project/:id/:tool");
  const [, params2] = useRoute("/pm-central/project/:id");

  const id = params?.id || params2?.id;
  const tool = params?.tool || "overview";
  const projectId = id ? parseInt(id, 10) : 0;

  if (!projectId || isNaN(projectId)) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Invalid project ID
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] -mx-6 -mt-6">
      <PMProjectSidebar projectId={projectId} activeTool={tool} />
      <div className="flex-1 overflow-auto p-6">
        <ToolPanel tool={tool} projectId={projectId} />
      </div>
    </div>
  );
}
