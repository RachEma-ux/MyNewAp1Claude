/**
 * WorkspaceUnifiedSidebar — Single sidebar merging Tools, Context, and Settings
 *
 * Each section shows 3 default items + a dropdown to reveal the full list.
 * UI-only — no backend changes. Same navigation targets as the 3 original sidebars.
 */

import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Home,
  // Tools icons
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
  // Context icons
  Target,
  Activity,
  Bell,
  Clock,
  Heart,
  Zap,
  // Settings icons
  Settings,
  Eye,
  Shield,
} from "lucide-react";

/* ─── Types ─── */

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  always?: boolean;
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

/* ─── Status colors ─── */

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

/* ─── Component ─── */

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
  const [location] = useLocation();
  const base = `/w/${workspaceId}`;

  // Section expand state
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [contextExpanded, setContextExpanded] = useState(false);
  const [settingsExpanded, setSettingsExpanded] = useState(false);

  // Activity data (only fetch when context section is visible)
  const { data: activity } = trpc.workspaces.activity.list.useQuery(
    { workspaceId, limit: 5 },
    { enabled: !collapsed }
  );

  const isActive = (path: string) => {
    if (path === base) return location === base;
    return location.startsWith(path);
  };

  /* ───────────── TOOLS section items ───────────── */

  const toolsDefault: NavItem[] = [
    { key: "team", label: "Team", icon: <Users className="h-4 w-4" />, path: `${base}/team`, always: true },
    { key: "crew", label: "Crew (AI)", icon: <Cpu className="h-4 w-4" />, path: `${base}/crew`, always: true },
    { key: "knowledge", label: "Documents", icon: <FileText className="h-4 w-4" />, path: `${base}/knowledge`, always: true },
  ];

  const toolsAll: NavItem[] = [
    { key: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" />, path: base, always: true },
    { key: "pmt", label: "Projects", icon: <FolderKanban className="h-4 w-4" />, path: `${base}/projects` },
    { key: "knowledge", label: "Knowledge", icon: <BookOpen className="h-4 w-4" />, path: `${base}/knowledge` },
    { key: "agents", label: "Agents", icon: <Bot className="h-4 w-4" />, path: `${base}/agents` },
    { key: "collaboration", label: "Collaboration", icon: <MessageSquare className="h-4 w-4" />, path: `${base}/collaboration` },
    { key: "reporting", label: "Reports", icon: <BarChart3 className="h-4 w-4" />, path: `${base}/reports` },
    { key: "team", label: "Team", icon: <Users className="h-4 w-4" />, path: `${base}/team`, always: true },
    { key: "crew", label: "Crew (AI)", icon: <Cpu className="h-4 w-4" />, path: `${base}/crew`, always: true },
    { key: "rules", label: "Rules", icon: <Scale className="h-4 w-4" />, path: `${base}/rules`, always: true },
    { key: "governance", label: "Governance", icon: <ShieldCheck className="h-4 w-4" />, path: `${base}/governance`, always: true },
    { key: "resources", label: "Resources", icon: <Package className="h-4 w-4" />, path: `${base}/resources` },
    { key: "workflows", label: "Workflows", icon: <GitBranch className="h-4 w-4" />, path: `${base}/workflows` },
  ];

  const toolsDropdownItems = toolsAll.filter(
    (item) => (item.always || enabledModules.has(item.key)) && !toolsDefault.some((d) => d.key === item.key)
  );

  /* ───────────── CONTEXT section items ───────────── */

  const contextDefault = [
    {
      key: "identity",
      label: "Identity",
      render: () => (
        <div className="space-y-0.5 text-xs px-2">
          <div className="font-medium truncate">{workspaceName}</div>
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px] py-0">{workspaceType || "generic"}</Badge>
            <span className={cn("text-[10px]", STATUS_COLORS[status] || "text-muted-foreground")}>
              {status.replace(/_/g, " ")}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "participants",
      label: "Participants",
      render: () => (
        <div className="flex gap-3 text-xs px-2">
          <span className="flex items-center gap-1"><Users className="h-3 w-3 text-muted-foreground" />{teamCount}</span>
          <span className="flex items-center gap-1"><Bot className="h-3 w-3 text-muted-foreground" />{crewCount}</span>
          <Badge variant="secondary" className="text-[10px] py-0 ml-auto">{participantRole || "viewer"}</Badge>
        </div>
      ),
    },
    {
      key: "activity",
      label: "Activity",
      render: () => (
        <div className="space-y-0.5 px-2">
          {activity && (activity as any[]).length > 0 ? (
            (activity as any[]).slice(0, 2).map((act: any) => (
              <div key={act.id} className="text-[10px] text-muted-foreground flex items-center gap-1 truncate">
                <Clock className="h-3 w-3 shrink-0" />
                <span className="truncate">{act.action}</span>
              </div>
            ))
          ) : (
            <p className="text-[10px] text-muted-foreground">No recent activity</p>
          )}
        </div>
      ),
    },
  ];

  const contextAll = [
    {
      key: "purpose",
      label: "Purpose",
      render: () => (
        <div className="text-xs px-2 space-y-0.5">
          <Badge variant="outline" className="text-[10px] py-0">{purposeType || "other"}</Badge>
          {purposeRef && <p className="text-muted-foreground text-[10px]">{purposeRef}</p>}
        </div>
      ),
    },
    ...(missionEmphasis ? [{
      key: "mission",
      label: "Mission",
      render: () => (
        <p className="text-xs font-medium text-primary px-2">{missionEmphasis}</p>
      ),
    }] : []),
    {
      key: "alerts",
      label: "Alerts",
      render: () => <p className="text-[10px] text-muted-foreground px-2">No active alerts</p>,
    },
    {
      key: "health",
      label: "Health",
      render: () => (
        <div className="flex items-center gap-1.5 text-xs px-2">
          <Heart className="h-3 w-3 text-green-500" />
          <span className="text-muted-foreground">Healthy</span>
        </div>
      ),
    },
    {
      key: "full-activity",
      label: "Full Activity",
      render: () => (
        <div className="space-y-0.5 px-2">
          {activity && (activity as any[]).length > 0 ? (
            (activity as any[]).map((act: any) => (
              <div key={act.id} className="text-[10px] text-muted-foreground flex items-center gap-1 truncate">
                <Clock className="h-3 w-3 shrink-0" />
                <span className="truncate">{act.action}</span>
              </div>
            ))
          ) : (
            <p className="text-[10px] text-muted-foreground">No activity</p>
          )}
        </div>
      ),
    },
  ];

  /* ───────────── SETTINGS section items ───────────── */

  const settingsDefault: NavItem[] = [
    { key: "settings", label: "Configure", icon: <Settings className="h-4 w-4" />, path: `${base}/settings`, always: true },
    { key: "oversight", label: "Oversight", icon: <Shield className="h-4 w-4" />, path: "", always: true },
    { key: "rules-nav", label: "Rules", icon: <Scale className="h-4 w-4" />, path: `${base}/rules`, always: true },
  ];

  const settingsAll: NavItem[] = [
    { key: "visibility", label: "Visibility", icon: <Eye className="h-4 w-4" />, path: `${base}/visibility`, always: true },
    { key: "guide", label: "Workspace Guide", icon: <BookOpen className="h-4 w-4" />, path: `${base}/rules`, always: true },
    { key: "governance-settings", label: "Governance", icon: <ShieldCheck className="h-4 w-4" />, path: `${base}/governance`, always: true },
  ];

  /* ───────────── Rendering helpers ───────────── */

  /** Render a nav link item */
  const NavLink = ({ item, compact }: { item: NavItem; compact?: boolean }) => {
    const active = isActive(item.path);

    if (item.key === "oversight") {
      // Special: opens drawer instead of navigation
      return (
        <button
          onClick={onOversightOpen}
          className={cn(
            "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md transition-colors",
            "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            compact && "text-xs py-1"
          )}
        >
          {item.icon}
          <span className="truncate">{item.label}</span>
        </button>
      );
    }

    return (
      <Link href={item.path}>
        <button
          className={cn(
            "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md transition-colors",
            active
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            compact && "text-xs py-1"
          )}
        >
          {item.icon}
          <span className="truncate">{item.label}</span>
        </button>
      </Link>
    );
  };

  /** Section header with expand toggle */
  const SectionHeader = ({
    title,
    icon,
    expanded,
    onToggleExpand,
  }: {
    title: string;
    icon: React.ReactNode;
    expanded: boolean;
    onToggleExpand: () => void;
  }) => (
    <button
      onClick={onToggleExpand}
      className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
    >
      <span className="flex items-center gap-1.5">
        {icon}
        {title}
      </span>
      {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
    </button>
  );

  /* ───────────── Collapsed mode: icon-only ───────────── */

  if (collapsed) {
    const collapsedItems = [
      { icon: <Home className="h-4 w-4" />, label: "All Workspaces", path: "/workspaces" },
      { icon: <LayoutDashboard className="h-4 w-4" />, label: "Overview", path: base },
      { icon: <Users className="h-4 w-4" />, label: "Team", path: `${base}/team` },
      { icon: <Cpu className="h-4 w-4" />, label: "Crew", path: `${base}/crew` },
      { icon: <FileText className="h-4 w-4" />, label: "Documents", path: `${base}/knowledge` },
      { icon: <Settings className="h-4 w-4" />, label: "Settings", path: `${base}/settings` },
    ];

    return (
      <aside className="flex flex-col border-r bg-card w-12 shrink-0">
        <div className="flex items-center justify-center h-12 border-b">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-col items-center gap-1 py-2">
          {collapsedItems.map((item) => (
            <Tooltip key={item.path}>
              <TooltipTrigger asChild>
                <Link href={item.path}>
                  <Button
                    variant={isActive(item.path) ? "secondary" : "ghost"}
                    size="icon"
                    className="h-8 w-8"
                  >
                    {item.icon}
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </aside>
    );
  }

  /* ───────────── Expanded mode: full sidebar ───────────── */

  return (
    <aside className="flex flex-col border-r bg-card w-64 shrink-0 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-3 h-12 shrink-0">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold truncate block">{workspaceName}</span>
          <span className={cn("text-[10px]", STATUS_COLORS[status] || "text-muted-foreground")}>
            {status.replace(/_/g, " ")}
          </span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onToggle}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* All Workspaces link */}
      <div className="px-2 pt-2 pb-1">
        <Link href="/workspaces">
          <button className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
            <Home className="h-4 w-4" />
            <span>All Workspaces</span>
          </button>
        </Link>
      </div>

      {/* ═══════════ TOOLS SECTION ═══════════ */}
      <div className="border-b mx-2 my-1" />
      <SectionHeader
        title="Tools"
        icon={<FolderKanban className="h-3 w-3" />}
        expanded={toolsExpanded}
        onToggleExpand={() => setToolsExpanded(!toolsExpanded)}
      />
      <nav className="px-2 space-y-0.5 pb-1">
        {toolsDefault.map((item) => (
          <NavLink key={item.key} item={item} />
        ))}
        {toolsExpanded && (
          <div className="mt-1 pt-1 border-t border-border/50 space-y-0.5">
            {toolsDropdownItems.map((item) => (
              <NavLink key={item.key} item={item} compact />
            ))}
          </div>
        )}
        {!toolsExpanded && toolsDropdownItems.length > 0 && (
          <button
            onClick={() => setToolsExpanded(true)}
            className="flex items-center gap-1.5 w-full px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className="h-3 w-3" />
            {toolsDropdownItems.length} more tools...
          </button>
        )}
      </nav>

      {/* ═══════════ CONTEXT SECTION ═══════════ */}
      <div className="border-b mx-2 my-1" />
      <SectionHeader
        title="Context"
        icon={<Target className="h-3 w-3" />}
        expanded={contextExpanded}
        onToggleExpand={() => setContextExpanded(!contextExpanded)}
      />
      <div className="px-1 space-y-1.5 pb-1">
        {contextDefault.map((item) => (
          <div key={item.key}>
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-0.5">
              {item.label}
            </div>
            {item.render()}
          </div>
        ))}
        {contextExpanded && (
          <div className="mt-1 pt-1 border-t border-border/50 space-y-1.5">
            {contextAll.map((item) => (
              <div key={item.key}>
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-0.5">
                  {item.label}
                </div>
                {item.render()}
              </div>
            ))}
          </div>
        )}
        {!contextExpanded && contextAll.length > 0 && (
          <button
            onClick={() => setContextExpanded(true)}
            className="flex items-center gap-1.5 w-full px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className="h-3 w-3" />
            {contextAll.length} more...
          </button>
        )}
      </div>

      {/* ═══════════ SETTINGS SECTION ═══════════ */}
      <div className="flex-1" />
      <div className="border-b mx-2 my-1" />
      <SectionHeader
        title="Settings"
        icon={<Settings className="h-3 w-3" />}
        expanded={settingsExpanded}
        onToggleExpand={() => setSettingsExpanded(!settingsExpanded)}
      />
      <nav className="px-2 space-y-0.5 pb-2">
        {settingsDefault.filter((item) => item.key !== "settings" || isManager).map((item) => (
          <NavLink key={item.key} item={item} />
        ))}
        {settingsExpanded && (
          <div className="mt-1 pt-1 border-t border-border/50 space-y-0.5">
            {settingsAll.filter((item) => item.key !== "visibility" || isManager).map((item) => (
              <NavLink key={item.key} item={item} compact />
            ))}
          </div>
        )}
        {!settingsExpanded && settingsAll.length > 0 && (
          <button
            onClick={() => setSettingsExpanded(true)}
            className="flex items-center gap-1.5 w-full px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className="h-3 w-3" />
            {settingsAll.length} more...
          </button>
        )}
      </nav>
    </aside>
  );
}
