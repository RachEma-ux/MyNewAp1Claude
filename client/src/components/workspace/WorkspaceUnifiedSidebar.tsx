/**
 * WorkspaceUnifiedSidebar — Single sidebar with 3 equal sections
 *
 * Each section = 1/3 of sidebar height, visually separated.
 * 3 pinned items per section + a dropdown for the full list.
 * UI-only — keeps old sidebar files intact for rollback.
 */

import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Home,
  Wrench,
  Info,
  Settings,
  // Tools
  Users,
  Cpu,
  FileText,
  FolderKanban,
  BookOpen,
  Bot,
  MessageSquare,
  BarChart3,
  ShieldCheck,
  Scale,
  GitBranch,
  Package,
  LayoutDashboard,
  // Context
  Target,
  Clock,
  Heart,
  Zap,
  Bell,
  Activity,
  // Settings
  Eye,
  Shield,
} from "lucide-react";

/* ─── Types ─── */

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  path: string;
}

interface UnifiedSidebarProps {
  workspaceId: number;
  workspaceName: string;
  workspaceType?: string | null;
  status: string;
  enabledModules: Set<string>;
  isManager: boolean;
  participantRole?: string | null;
  teamCount: number;
  crewCount: number;
  purposeType?: string | null;
  purposeRef?: string | null;
  missionEmphasis?: string | null;
  collapsed: boolean;
  onToggle: () => void;
  onOversightOpen: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "text-yellow-500",
  ready_for_review: "text-blue-500",
  under_review: "text-purple-500",
  approved: "text-emerald-500",
  published: "text-cyan-500",
  active: "text-green-500",
  rejected: "text-red-500",
  archived: "text-gray-500",
};

export function WorkspaceUnifiedSidebar({
  workspaceId,
  workspaceName,
  workspaceType,
  status,
  enabledModules,
  isManager,
  participantRole,
  teamCount,
  crewCount,
  purposeType,
  purposeRef,
  missionEmphasis,
  collapsed,
  onToggle,
  onOversightOpen,
}: UnifiedSidebarProps) {
  const [location, navigate] = useLocation();
  const base = `/w/${workspaceId}`;

  const { data: activity } = trpc.workspaces.activity.list.useQuery(
    { workspaceId, limit: 5 },
    { enabled: !collapsed }
  );

  const isActive = (path: string) => {
    if (path === base) return location === base;
    return location.startsWith(path);
  };

  /* ═══════ TOOLS: pinned 3 + full dropdown list ═══════ */

  const toolsPinned: NavItem[] = [
    { key: "team", label: "Team", icon: <Users className="h-4 w-4" />, path: `${base}/team` },
    { key: "crew", label: "Crew (AI)", icon: <Cpu className="h-4 w-4" />, path: `${base}/crew` },
    { key: "documents", label: "Documents", icon: <FileText className="h-4 w-4" />, path: `${base}/knowledge` },
  ];

  const toolsFull: NavItem[] = [
    { key: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" />, path: base },
    { key: "pmt", label: "Projects", icon: <FolderKanban className="h-4 w-4" />, path: `${base}/projects` },
    { key: "knowledge", label: "Knowledge", icon: <BookOpen className="h-4 w-4" />, path: `${base}/knowledge` },
    { key: "agents", label: "Agents", icon: <Bot className="h-4 w-4" />, path: `${base}/agents` },
    { key: "collaboration", label: "Collaboration", icon: <MessageSquare className="h-4 w-4" />, path: `${base}/collaboration` },
    { key: "reporting", label: "Reports", icon: <BarChart3 className="h-4 w-4" />, path: `${base}/reports` },
    { key: "team", label: "Team", icon: <Users className="h-4 w-4" />, path: `${base}/team` },
    { key: "crew", label: "Crew (AI)", icon: <Cpu className="h-4 w-4" />, path: `${base}/crew` },
    { key: "rules", label: "Rules", icon: <Scale className="h-4 w-4" />, path: `${base}/rules` },
    { key: "governance", label: "Governance", icon: <ShieldCheck className="h-4 w-4" />, path: `${base}/governance` },
    { key: "resources", label: "Resources", icon: <Package className="h-4 w-4" />, path: `${base}/resources` },
    { key: "workflows", label: "Workflows", icon: <GitBranch className="h-4 w-4" />, path: `${base}/workflows` },
  ];

  /* ═══════ CONTEXT: pinned 3 + full dropdown list ═══════ */

  const contextPinned = [
    {
      key: "identity",
      icon: <Target className="h-4 w-4" />,
      render: () => (
        <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-foreground">
          <Target className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{workspaceName}</span>
          <Badge variant="secondary" className="text-[10px] py-0 ml-auto shrink-0">{workspaceType || "generic"}</Badge>
        </div>
      ),
    },
    {
      key: "status",
      icon: <Activity className="h-4 w-4" />,
      render: () => (
        <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
          <Activity className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className={cn("capitalize", STATUS_COLORS[status] || "text-muted-foreground")}>
            {status.replace(/_/g, " ")}
          </span>
          <Badge variant="outline" className="text-[10px] py-0 ml-auto">{participantRole || "viewer"}</Badge>
        </div>
      ),
    },
    {
      key: "participants",
      icon: <Users className="h-4 w-4" />,
      render: () => (
        <div className="flex items-center gap-3 px-2 py-1.5 text-sm text-muted-foreground">
          <Users className="h-4 w-4 shrink-0" />
          <span>{teamCount} team</span>
          <span className="flex items-center gap-1"><Bot className="h-3.5 w-3.5" />{crewCount} crew</span>
        </div>
      ),
    },
  ];

  const contextFull = [
    { key: "identity", label: "Identity", icon: <Target className="h-4 w-4" />, detail: `${workspaceName} (${workspaceType || "generic"})` },
    { key: "status", label: "Status", icon: <Activity className="h-4 w-4" />, detail: status.replace(/_/g, " ") },
    { key: "participants", label: "Participants", icon: <Users className="h-4 w-4" />, detail: `${teamCount} team, ${crewCount} crew` },
    { key: "purpose", label: "Purpose", icon: <Target className="h-4 w-4" />, detail: purposeType || "other" },
    ...(missionEmphasis ? [{ key: "mission", label: "Mission", icon: <Zap className="h-4 w-4" />, detail: missionEmphasis }] : []),
    { key: "role", label: "Your Role", icon: <Shield className="h-4 w-4" />, detail: participantRole || "viewer" },
    { key: "health", label: "Health", icon: <Heart className="h-4 w-4" />, detail: "Healthy" },
    { key: "alerts", label: "Alerts", icon: <Bell className="h-4 w-4" />, detail: "No active alerts" },
    ...(activity && (activity as any[]).length > 0
      ? (activity as any[]).slice(0, 3).map((act: any, i: number) => ({
          key: `act-${i}`,
          label: "Activity",
          icon: <Clock className="h-4 w-4" />,
          detail: act.action,
        }))
      : [{ key: "no-activity", label: "Activity", icon: <Clock className="h-4 w-4" />, detail: "No recent activity" }]),
  ];

  /* ═══════ SETTINGS: pinned 3 + full dropdown list ═══════ */

  const settingsPinned: (NavItem & { action?: () => void })[] = [
    { key: "configure", label: "Configure", icon: <Settings className="h-4 w-4" />, path: `${base}/settings` },
    { key: "oversight", label: "Oversight", icon: <Shield className="h-4 w-4" />, path: "", action: onOversightOpen },
    { key: "rules", label: "Rules", icon: <Scale className="h-4 w-4" />, path: `${base}/rules` },
  ];

  const settingsFull: (NavItem & { action?: () => void })[] = [
    { key: "configure", label: "Configure", icon: <Settings className="h-4 w-4" />, path: `${base}/settings` },
    { key: "oversight", label: "Oversight", icon: <Shield className="h-4 w-4" />, path: "", action: onOversightOpen },
    { key: "rules", label: "Rules", icon: <Scale className="h-4 w-4" />, path: `${base}/rules` },
    { key: "visibility", label: "Visibility", icon: <Eye className="h-4 w-4" />, path: `${base}/visibility` },
    { key: "guide", label: "Workspace Guide", icon: <BookOpen className="h-4 w-4" />, path: `${base}/rules` },
    { key: "governance", label: "Governance", icon: <ShieldCheck className="h-4 w-4" />, path: `${base}/governance` },
  ];

  /* ═══════ Collapsed mode ═══════ */

  if (collapsed) {
    return (
      <aside className="flex flex-col border-r bg-card w-12 shrink-0">
        <div className="flex items-center justify-center h-10 border-b">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {/* Tools */}
        <div className="flex-1 flex flex-col items-center gap-1 py-2 border-b">
          {[
            { icon: <Users className="h-4 w-4" />, tip: "Team", path: `${base}/team` },
            { icon: <Cpu className="h-4 w-4" />, tip: "Crew", path: `${base}/crew` },
            { icon: <FileText className="h-4 w-4" />, tip: "Docs", path: `${base}/knowledge` },
          ].map((it) => (
            <Tooltip key={it.tip}><TooltipTrigger asChild>
              <Link href={it.path}><Button variant={isActive(it.path) ? "secondary" : "ghost"} size="icon" className="h-8 w-8">{it.icon}</Button></Link>
            </TooltipTrigger><TooltipContent side="right">{it.tip}</TooltipContent></Tooltip>
          ))}
        </div>
        {/* Context */}
        <div className="flex-1 flex flex-col items-center gap-1 py-2 border-b">
          <Tooltip><TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8"><Target className="h-4 w-4" /></Button>
          </TooltipTrigger><TooltipContent side="right">{workspaceName}</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8"><Activity className="h-4 w-4" /></Button>
          </TooltipTrigger><TooltipContent side="right">{status.replace(/_/g, " ")}</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8"><Users className="h-4 w-4" /></Button>
          </TooltipTrigger><TooltipContent side="right">{teamCount} team, {crewCount} crew</TooltipContent></Tooltip>
        </div>
        {/* Settings */}
        <div className="flex-1 flex flex-col items-center gap-1 py-2">
          <Tooltip><TooltipTrigger asChild>
            <Link href={`${base}/settings`}><Button variant={isActive(`${base}/settings`) ? "secondary" : "ghost"} size="icon" className="h-8 w-8"><Settings className="h-4 w-4" /></Button></Link>
          </TooltipTrigger><TooltipContent side="right">Settings</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOversightOpen}><Shield className="h-4 w-4" /></Button>
          </TooltipTrigger><TooltipContent side="right">Oversight</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <Link href={`${base}/rules`}><Button variant={isActive(`${base}/rules`) ? "secondary" : "ghost"} size="icon" className="h-8 w-8"><Scale className="h-4 w-4" /></Button></Link>
          </TooltipTrigger><TooltipContent side="right">Rules</TooltipContent></Tooltip>
        </div>
      </aside>
    );
  }

  /* ═══════ Expanded mode — 3 equal sections ═══════ */

  return (
    <aside className="flex flex-col border-r bg-card w-64 shrink-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-3 h-10 shrink-0 bg-muted/30">
        <Link href="/ws/list">
          <Home className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-pointer" />
        </Link>
        <span className="text-sm font-semibold truncate flex-1">{workspaceName}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onToggle}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* ══════════════ SECTION 1: TOOLS ══════════════ */}
      <div className="flex-1 flex flex-col min-h-0 border-b-2 border-border">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/20 shrink-0">
          <Wrench className="h-3.5 w-3.5 text-blue-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tools</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
          {toolsPinned.map((item) => (
            <Link key={item.key} href={item.path}>
              <button className={cn(
                "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md transition-colors",
                isActive(item.path)
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}>
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            </Link>
          ))}
        </nav>
        {/* Dropdown: full tools list */}
        <div className="px-2 pb-1.5 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 w-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors">
                <ChevronDown className="h-3 w-3" />
                All tools ({toolsFull.length})
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-52">
              <DropdownMenuLabel>All Tools</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {toolsFull.map((item) => (
                <DropdownMenuItem
                  key={item.key}
                  className={cn("gap-2", isActive(item.path) && "bg-accent")}
                  onClick={() => navigate(item.path)}
                >
                  {item.icon}
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ══════════════ SECTION 2: CONTEXT ══════════════ */}
      <div className="flex-1 flex flex-col min-h-0 border-b-2 border-border">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/20 shrink-0">
          <Info className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Context</span>
        </div>
        <div className="flex-1 overflow-y-auto px-1 py-1 space-y-0.5">
          {contextPinned.map((item) => (
            <div key={item.key}>{item.render()}</div>
          ))}
        </div>
        {/* Dropdown: full context list */}
        <div className="px-2 pb-1.5 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 w-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors">
                <ChevronDown className="h-3 w-3" />
                All context ({contextFull.length})
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-56">
              <DropdownMenuLabel>Workspace Context</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {contextFull.map((item) => (
                <DropdownMenuItem key={item.key} className="gap-2 flex-col items-start" disabled>
                  <div className="flex items-center gap-2 text-foreground">
                    {item.icon}
                    <span className="font-medium">{item.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground ml-6 truncate max-w-[180px]">{item.detail}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ══════════════ SECTION 3: SETTINGS ══════════════ */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/20 shrink-0">
          <Settings className="h-3.5 w-3.5 text-orange-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Settings</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
          {settingsPinned.map((item) => (
            item.action ? (
              <button
                key={item.key}
                onClick={item.action}
                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            ) : (
              <Link key={item.key} href={item.path}>
                <button className={cn(
                  "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md transition-colors",
                  isActive(item.path)
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}>
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </button>
              </Link>
            )
          ))}
        </nav>
        {/* Dropdown: full settings list */}
        <div className="px-2 pb-1.5 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 w-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors">
                <ChevronDown className="h-3 w-3" />
                All settings ({settingsFull.length})
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-52">
              <DropdownMenuLabel>All Settings</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {settingsFull.map((item) => (
                <DropdownMenuItem
                  key={item.key}
                  className={cn("gap-2", item.path && isActive(item.path) && "bg-accent")}
                  onClick={() => item.action ? item.action() : navigate(item.path)}
                >
                  {item.icon}
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </aside>
  );
}
