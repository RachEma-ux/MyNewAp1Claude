/**
 * PMProjectSidebar — Smart project sidebar with live status, badges, sections
 *
 * Sections: A) Status Strip, B) Work, C) Control, D) Follow-up,
 * E) Collaboration, F) Governance
 * Plus: AttentionQueue + QuickCreate
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  LayoutDashboard, CheckSquare, Calendar, FileText,
  AlertTriangle, AlertCircle, GitBranch, ShieldCheck,
  FileBarChart, ListChecks, Stamp, MessageSquare,
  FolderOpen, Users, ShieldAlert, Package, ChevronLeft,
  ChevronDown, ChevronRight, DollarSign,
} from "lucide-react";
import ProjectStatusStrip from "./ProjectStatusStrip";
import AttentionQueue from "./AttentionQueue";
import QuickCreate from "./QuickCreate";

// ── NavSection ──────────────────────────────────────────────────────────────

interface NavSectionProps {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: number;
}

function NavSection({ label, children, defaultOpen = true, badge }: NavSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
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
  onClick?: () => void;
}

function NavItem({ icon, label, href, badge, statusDot, meta, active, onClick }: NavItemProps) {
  const [, setLocation] = useLocation();

  const dotColors = {
    ok: "bg-green-500",
    warn: "bg-yellow-500",
    block: "bg-red-500",
  };

  return (
    <button
      onClick={() => { onClick?.(); setLocation(href); }}
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

// ── Main Sidebar ────────────────────────────────────────────────────────────

interface PMProjectSidebarProps {
  projectId: number;
  activeTool: string;
  onBack?: () => void;
}

export default function PMProjectSidebar({ projectId, activeTool, onBack }: PMProjectSidebarProps) {
  const [, setLocation] = useLocation();
  const base = `/pm-central/project/${projectId}`;

  // Fetch sidebar summary
  const summaryQuery = trpc.modules.pmt.shell.tools.sidebarSummary.get.useQuery(
    { projectId },
    { refetchInterval: 30000 }
  );
  const s = summaryQuery.data;

  const projectState = s?.projectState || "draft_shell";
  const projectName = s?.projectName || `Project #${projectId}`;
  const freezeActive = s?.freezeActive || false;

  // Determine gate status label
  const gateLabel = projectState === "intake_review" ? "G0 pending"
    : projectState === "plan_gate_pending" ? "G1 pending"
    : projectState === "close_gate_pending" ? "G4 pending"
    : projectState === "change_pending" ? "G2 pending"
    : undefined;

  // Section-level badge sums for attention
  const controlBadge = (s?.highRisksCount || 0) + (s?.openIssuesCount || 0) + (s?.changesPendingCount || 0);
  const followupBadge = (s?.openActionItemsCount || 0) + (s?.approvalsPendingCount || 0);

  return (
    <div className="w-56 border-r bg-background flex flex-col h-full">
      {/* Back button */}
      <div className="px-2 py-1.5 border-b">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-1.5 text-xs h-7"
          onClick={() => setLocation("/pm-central/dashboard")}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          All Projects
        </Button>
      </div>

      {/* Status strip */}
      <ProjectStatusStrip
        projectName={projectName}
        projectState={projectState}
        freezeActive={freezeActive}
        gateStatus={gateLabel}
      />

      {/* Attention queue */}
      {s && (
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

      {/* Quick create */}
      <QuickCreate projectId={projectId} onSelect={(type) => {
        // Navigate to the relevant tool panel
        const toolMap: Record<string, string> = {
          task: "tasks", risk: "risks", issue: "issues",
          change: "changes", decision: "decisions",
          action_item: "action-items", status_update: "status-updates",
          meeting: "meetings", deliverable: "deliverables",
        };
        setLocation(`${base}/${toolMap[type] || "overview"}`);
      }} />

      {/* Navigation sections */}
      <ScrollArea className="flex-1">
        <NavSection label="Work">
          <NavItem icon={<LayoutDashboard className="h-3.5 w-3.5" />} label="Overview" href={`${base}/overview`} active={activeTool === "overview"} />
          <NavItem icon={<CheckSquare className="h-3.5 w-3.5" />} label="Tasks" href={`${base}/tasks`} active={activeTool === "tasks"} statusDot={s && s.overdueTasksCount > 0 ? "block" : undefined} meta={s && s.overdueTasksCount > 0 ? `${s.overdueTasksCount} overdue` : undefined} />
          <NavItem icon={<Calendar className="h-3.5 w-3.5" />} label="Timeline" href={`${base}/timeline`} active={activeTool === "timeline"} />
          <NavItem icon={<FileText className="h-3.5 w-3.5" />} label="Deliverables" href={`${base}/deliverables`} active={activeTool === "deliverables"} badge={s?.pendingDeliverablesCount} />
        </NavSection>

        <NavSection label="Control" badge={controlBadge > 0 ? controlBadge : undefined}>
          <NavItem icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Risks" href={`${base}/risks`} active={activeTool === "risks"} badge={s?.highRisksCount} statusDot={s && s.highRisksCount > 0 ? "warn" : "ok"} />
          <NavItem icon={<AlertCircle className="h-3.5 w-3.5" />} label="Issues" href={`${base}/issues`} active={activeTool === "issues"} badge={s?.openIssuesCount} statusDot={s && s.openIssuesCount > 0 ? "block" : "ok"} />
          <NavItem icon={<GitBranch className="h-3.5 w-3.5" />} label="Changes" href={`${base}/changes`} active={activeTool === "changes"} badge={s?.changesPendingCount} />
          <NavItem icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Approvals" href={`${base}/approvals`} active={activeTool === "approvals"} badge={s?.approvalsPendingCount} statusDot={s && s.approvalsPendingCount > 0 ? "warn" : undefined} />
        </NavSection>

        <NavSection label="Follow-up" badge={followupBadge > 0 ? followupBadge : undefined}>
          <NavItem icon={<FileBarChart className="h-3.5 w-3.5" />} label="Status Updates" href={`${base}/status-updates`} active={activeTool === "status-updates"} />
          <NavItem icon={<ListChecks className="h-3.5 w-3.5" />} label="Action Items" href={`${base}/action-items`} active={activeTool === "action-items"} badge={s?.openActionItemsCount} />
          <NavItem icon={<Stamp className="h-3.5 w-3.5" />} label="Decisions" href={`${base}/decisions`} active={activeTool === "decisions"} />
          <NavItem icon={<FileBarChart className="h-3.5 w-3.5" />} label="Reports" href={`${base}/reports`} active={activeTool === "reports"} />
        </NavSection>

        <NavSection label="Collaboration" defaultOpen={false}>
          <NavItem icon={<MessageSquare className="h-3.5 w-3.5" />} label="Threads" href={`${base}/threads`} active={activeTool === "threads"} />
          <NavItem icon={<FolderOpen className="h-3.5 w-3.5" />} label="Docs" href={`${base}/docs`} active={activeTool === "docs"} />
          <NavItem icon={<Calendar className="h-3.5 w-3.5" />} label="Meetings" href={`${base}/meetings`} active={activeTool === "meetings"} />
          <NavItem icon={<Users className="h-3.5 w-3.5" />} label="Participants" href={`${base}/participants`} active={activeTool === "participants"} />
        </NavSection>

        <NavSection label="Governance" defaultOpen={false}>
          <NavItem icon={<ShieldAlert className="h-3.5 w-3.5" />} label="Gate Center" href={`${base}/gates`} active={activeTool === "gates"} statusDot={gateLabel ? "warn" : "ok"} />
          <NavItem icon={<Package className="h-3.5 w-3.5" />} label="Evidence" href={`${base}/evidence`} active={activeTool === "evidence"} />
          <NavItem icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Policy & Scorecard" href={`${base}/policy`} active={activeTool === "policy"} />
          <NavItem icon={<DollarSign className="h-3.5 w-3.5" />} label="Budget" href={`${base}/budget`} active={activeTool === "budget"} />
        </NavSection>
      </ScrollArea>
    </div>
  );
}
