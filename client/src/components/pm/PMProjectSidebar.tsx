/**
 * PMProjectSidebar — 7-section project sidebar with ProjectSwitcher + ControlStrip
 *
 * Sections: Project, Plan, Execute, Follow-up, Control, Collaboration, Governance
 * Collapsible: defaults to collapsed (icon-only) mode.
 *
 * Status dot logic (governed priority):
 *   BLOCK: freeze active OR required gate failed
 *   WARN:  overdue tasks > 0 OR pending approvals OR high risks OR critical issues
 *   OK:    none of the above
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  LayoutDashboard, FileText, Network, Flag,
  Calendar, DollarSign, Users, Lock,
  CheckSquare, Package, Clock, Repeat,
  Bell, ListChecks, Stamp, FileBarChart,
  AlertTriangle, AlertCircle, GitBranch, ShieldCheck,
  MessageSquare, FolderOpen, ShieldAlert,
  ChevronLeft, ChevronDown, ChevronRight, Inbox,
  Wand2, PanelLeftClose, PanelLeftOpen, Bot,
} from "lucide-react";
import ProjectSwitcher from "./ProjectSwitcher";
import ProjectControlStrip from "./ProjectStatusStrip";
import AttentionQueue from "./AttentionQueue";
import QuickCreate from "./QuickCreate";

// ── NavSection ──────────────────────────────────────────────────────────────

interface NavSectionProps {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: number;
  collapsed?: boolean;
}

function NavSection({ label, children, defaultOpen = true, badge, collapsed }: NavSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (collapsed) {
    // In collapsed mode, always show children (icon-only items)
    return <div className="py-1">{children}</div>;
  }

  return (
    <div className="py-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        <div className="flex items-center gap-1">
          {open ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
          {label}
        </div>
        {badge !== undefined && badge > 0 && (
          <span className="bg-destructive text-destructive-foreground text-[9px] px-1 rounded-full min-w-[14px] text-center">
            {badge}
          </span>
        )}
      </button>
      {open && <div className="mt-0.5">{children}</div>}
    </div>
  );
}

// ── NavItem ─────────────────────────────────────────────────────────────────

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  href: string;
  badge?: number;
  statusDot?: "ok" | "warn" | "block";
  meta?: string;
  active?: boolean;
  collapsed?: boolean;
}

function NavItem({ icon, label, href, badge, statusDot, meta, active, collapsed }: NavItemProps) {
  const [, setLocation] = useLocation();

  const dotColors = {
    ok: "bg-green-500",
    warn: "bg-yellow-500",
    block: "bg-red-500",
  };

  if (collapsed) {
    return (
      <button
        onClick={() => setLocation(href)}
        title={label}
        className={`flex items-center justify-center w-full py-1.5 rounded-sm transition-colors relative ${
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        }`}
      >
        <span className="opacity-70">{icon}</span>
        {statusDot && (
          <div className={`absolute top-1 right-1 h-1.5 w-1.5 rounded-full ${dotColors[statusDot]}`} />
        )}
        {badge !== undefined && badge > 0 && (
          <div className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[8px] px-1 rounded-full min-w-[12px] text-center leading-tight">
            {badge}
          </div>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={() => setLocation(href)}
      className={`flex items-center justify-between w-full px-3 py-1.5 text-xs rounded-sm transition-colors ${
        active
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {statusDot && <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColors[statusDot]}`} />}
        <span className="shrink-0 opacity-70">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {meta && <span className="text-[10px] text-muted-foreground">{meta}</span>}
        {badge !== undefined && badge > 0 && (
          <span className="bg-muted text-muted-foreground text-[10px] px-1 rounded min-w-[16px] text-center">
            {badge}
          </span>
        )}
      </div>
    </button>
  );
}

// ── Status dot logic ────────────────────────────────────────────────────────

type DotLevel = "ok" | "warn" | "block" | undefined;

function computeOverallDot(s: any): DotLevel {
  if (!s) return undefined;
  // BLOCK: freeze active
  if (s.freezeActive) return "block";
  // WARN: any attention item > 0
  if (s.overdueTasksCount > 0 || s.approvalsPendingCount > 0 ||
      s.highRisksCount > 0 || s.openIssuesCount > 0) return "warn";
  return "ok";
}

// ── Main Sidebar ────────────────────────────────────────────────────────────

interface PMProjectSidebarProps {
  projectId: number;
  activeTool: string;
}

export default function PMProjectSidebar({ projectId, activeTool }: PMProjectSidebarProps) {
  const [, setLocation] = useLocation();
  const [collapsed, setCollapsed] = useState(true);
  const base = `/pm-central/p/${projectId}`;

  // Fetch sidebar summary
  const summaryQuery = trpc.modules.pmt.shell.tools.sidebarSummary.get.useQuery(
    { projectId },
    { refetchInterval: 30000 }
  );
  const s = summaryQuery.data;

  const projectState = s?.projectState || "draft_shell";
  const projectName = s?.projectName || `Project #${projectId}`;
  const freezeActive = s?.freezeActive || false;

  // Gate status label
  const gateLabel = projectState === "intake_review" ? "G0 pending"
    : projectState === "plan_gate_pending" ? "G1 pending"
    : projectState === "close_gate_pending" ? "G4 pending"
    : projectState === "change_pending" ? "G2 pending"
    : undefined;

  // Section-level badges
  const controlBadge = (s?.highRisksCount || 0) + (s?.openIssuesCount || 0) + (s?.changesPendingCount || 0);
  const followupBadge = (s?.openActionItemsCount || 0) + (s?.approvalsPendingCount || 0);

  // Status dot computations
  const overallDot = computeOverallDot(s);
  const tasksDot: DotLevel = s && s.overdueTasksCount > 0 ? "block" : undefined;
  const risksDot: DotLevel = s && s.highRisksCount > 0 ? "warn" : s ? "ok" : undefined;
  const issuesDot: DotLevel = s && s.openIssuesCount > 0 ? "block" : s ? "ok" : undefined;
  const approvalsDot: DotLevel = s && s.approvalsPendingCount > 0 ? "warn" : undefined;
  const gateDot: DotLevel = freezeActive ? "block" : gateLabel ? "warn" : s ? "ok" : undefined;

  return (
    <div className={`border-r bg-background flex flex-col h-full transition-all duration-200 shrink-0 ${collapsed ? "w-12" : "w-56"}`}>
      {/* Toggle button */}
      <div className={`flex items-center border-b ${collapsed ? "justify-center py-1.5" : "justify-between px-2 py-1.5"}`}>
        {!collapsed && (
          <span className="text-xs font-semibold text-muted-foreground truncate">Project</span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 shrink-0"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>

      {/* Project Switcher — expanded only */}
      {!collapsed && (
        <div className="px-2 py-1.5 border-b">
          <ProjectSwitcher currentProjectId={projectId} currentProjectName={projectName} />
        </div>
      )}

      {/* Control Strip — expanded only */}
      {!collapsed && (
        <ProjectControlStrip
          projectId={projectId}
          projectName={projectName}
          projectState={projectState}
          freezeActive={freezeActive}
          gateStatus={gateLabel}
        />
      )}

      {/* Attention queue — expanded only */}
      {!collapsed && s && (
        <AttentionQueue
          overdueTasksCount={s.overdueTasksCount}
          approvalsPendingCount={s.approvalsPendingCount}
          highRisksCount={s.highRisksCount}
          openIssuesCount={s.openIssuesCount}
          changesPendingCount={s.changesPendingCount}
          openActionItemsCount={s.openActionItemsCount}
          pendingDeliverablesCount={s.pendingDeliverablesCount}
        />
      )}

      {/* Quick create — expanded only */}
      {!collapsed && (
        <QuickCreate projectId={projectId} onSelect={(type) => {
          const toolMap: Record<string, string> = {
            task: "tasks", risk: "risks", issue: "issues",
            change: "changes", decision: "decisions",
            action_item: "action-items", status_update: "status-updates",
            meeting: "meetings", deliverable: "deliverables",
          };
          setLocation(`${base}/${toolMap[type] || "overview"}`);
        }} />
      )}

      {/* Navigation sections — 7 sections */}
      <ScrollArea className="flex-1">
        <div className={collapsed ? "px-1" : ""}>
          {/* 1. Project */}
          <NavSection label="Project" collapsed={collapsed}>
            <NavItem icon={<LayoutDashboard className="h-3.5 w-3.5" />} label="Overview" href={`${base}/overview`} active={activeTool === "overview"} statusDot={overallDot} collapsed={collapsed} />
            <NavItem icon={<Wand2 className="h-3.5 w-3.5" />} label="PMI Wizard" href={`${base}/wizard/start`} active={activeTool === "wizard"} collapsed={collapsed} />
            <NavItem icon={<FileText className="h-3.5 w-3.5" />} label="Charter / Intake" href={`${base}/charter`} active={activeTool === "charter"} collapsed={collapsed} />
            <NavItem icon={<Network className="h-3.5 w-3.5" />} label="Scope & WBS" href={`${base}/wbs`} active={activeTool === "wbs"} collapsed={collapsed} />
            <NavItem icon={<Flag className="h-3.5 w-3.5" />} label="Milestones" href={`${base}/milestones`} active={activeTool === "milestones"} collapsed={collapsed} />
          </NavSection>

          {/* 2. Plan */}
          <NavSection label="Plan" collapsed={collapsed}>
            <NavItem icon={<Calendar className="h-3.5 w-3.5" />} label="Timeline" href={`${base}/timeline`} active={activeTool === "timeline"} collapsed={collapsed} />
            <NavItem icon={<DollarSign className="h-3.5 w-3.5" />} label="Budget" href={`${base}/budget`} active={activeTool === "budget"} collapsed={collapsed} />
            <NavItem icon={<Users className="h-3.5 w-3.5" />} label="Resources" href={`${base}/resources`} active={activeTool === "resources"} collapsed={collapsed} />
            <NavItem icon={<Lock className="h-3.5 w-3.5" />} label="Baselines" href={`${base}/baselines`} active={activeTool === "baselines"} collapsed={collapsed} />
          </NavSection>

          {/* 3. Execute */}
          <NavSection label="Execute" collapsed={collapsed}>
            <NavItem icon={<CheckSquare className="h-3.5 w-3.5" />} label="Tasks Board" href={`${base}/tasks`} active={activeTool === "tasks"} statusDot={tasksDot} meta={!collapsed && s && s.overdueTasksCount > 0 ? `${s.overdueTasksCount} overdue` : undefined} collapsed={collapsed} />
            <NavItem icon={<Package className="h-3.5 w-3.5" />} label="Deliverables" href={`${base}/deliverables`} active={activeTool === "deliverables"} badge={s?.pendingDeliverablesCount} collapsed={collapsed} />
            <NavItem icon={<Clock className="h-3.5 w-3.5" />} label="Worklog" href={`${base}/worklog`} active={activeTool === "worklog"} collapsed={collapsed} />
            <NavItem icon={<Repeat className="h-3.5 w-3.5" />} label="Iterations" href={`${base}/iterations`} active={activeTool === "iterations"} collapsed={collapsed} />
          </NavSection>

          {/* 4. Follow-up */}
          <NavSection label="Follow-up" badge={followupBadge > 0 ? followupBadge : undefined} collapsed={collapsed}>
            <NavItem icon={<Bell className="h-3.5 w-3.5" />} label="My Follow-ups" href={`${base}/follow-ups`} active={activeTool === "follow-ups"} collapsed={collapsed} />
            <NavItem icon={<ListChecks className="h-3.5 w-3.5" />} label="Action Items" href={`${base}/action-items`} active={activeTool === "action-items"} badge={s?.openActionItemsCount} collapsed={collapsed} />
            <NavItem icon={<FileBarChart className="h-3.5 w-3.5" />} label="Status Updates" href={`${base}/status-updates`} active={activeTool === "status-updates"} collapsed={collapsed} />
            <NavItem icon={<Stamp className="h-3.5 w-3.5" />} label="Decisions" href={`${base}/decisions`} active={activeTool === "decisions"} collapsed={collapsed} />
          </NavSection>

          {/* 5. Control */}
          <NavSection label="Control" badge={controlBadge > 0 ? controlBadge : undefined} collapsed={collapsed}>
            <NavItem icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Risks" href={`${base}/risks`} active={activeTool === "risks"} badge={s?.highRisksCount} statusDot={risksDot} collapsed={collapsed} />
            <NavItem icon={<AlertCircle className="h-3.5 w-3.5" />} label="Issues" href={`${base}/issues`} active={activeTool === "issues"} badge={s?.openIssuesCount} statusDot={issuesDot} collapsed={collapsed} />
            <NavItem icon={<GitBranch className="h-3.5 w-3.5" />} label="Changes (CRs)" href={`${base}/changes`} active={activeTool === "changes"} badge={s?.changesPendingCount} collapsed={collapsed} />
            <NavItem icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Approvals Inbox" href={`${base}/approvals`} active={activeTool === "approvals"} badge={s?.approvalsPendingCount} statusDot={approvalsDot} collapsed={collapsed} />
          </NavSection>

          {/* 6. Collaboration */}
          <NavSection label="Collaboration" defaultOpen={false} collapsed={collapsed}>
            <NavItem icon={<MessageSquare className="h-3.5 w-3.5" />} label="Threads" href={`${base}/threads`} active={activeTool === "threads"} collapsed={collapsed} />
            <NavItem icon={<FolderOpen className="h-3.5 w-3.5" />} label="Docs Hub" href={`${base}/docs`} active={activeTool === "docs"} collapsed={collapsed} />
            <NavItem icon={<Calendar className="h-3.5 w-3.5" />} label="Meetings" href={`${base}/meetings`} active={activeTool === "meetings"} collapsed={collapsed} />
            <NavItem icon={<Users className="h-3.5 w-3.5" />} label="Participants" href={`${base}/participants`} active={activeTool === "participants"} collapsed={collapsed} />
          </NavSection>

          {/* 7. AI Agents */}
          <NavSection label="AI Agents" defaultOpen={false} collapsed={collapsed}>
            <NavItem icon={<Bot className="h-3.5 w-3.5" />} label="Agent Runs" href={`${base}/agent-runs`} active={activeTool === "agent-runs"} collapsed={collapsed} />
          </NavSection>

          {/* 8. Governance */}
          <NavSection label="Governance" defaultOpen={false} collapsed={collapsed}>
            <NavItem icon={<ShieldAlert className="h-3.5 w-3.5" />} label="Gate Center" href={`${base}/gates`} active={activeTool === "gates"} statusDot={gateDot} collapsed={collapsed} />
            <NavItem icon={<Lock className="h-3.5 w-3.5" />} label="Freeze / Holds" href={`${base}/freeze-holds`} active={activeTool === "freeze-holds"} statusDot={freezeActive ? "block" : undefined} collapsed={collapsed} />
            <NavItem icon={<Package className="h-3.5 w-3.5" />} label="Evidence Packs" href={`${base}/evidence`} active={activeTool === "evidence"} collapsed={collapsed} />
            <NavItem icon={<FileBarChart className="h-3.5 w-3.5" />} label="Scorecard" href={`${base}/scorecard`} active={activeTool === "scorecard"} collapsed={collapsed} />
          </NavSection>

          {/* PM Inbox link */}
          <div className="py-1 border-t mt-1">
            <NavItem icon={<Inbox className="h-3.5 w-3.5" />} label="PM Inbox (all)" href="/pm-central/inbox" active={false} collapsed={collapsed} />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
