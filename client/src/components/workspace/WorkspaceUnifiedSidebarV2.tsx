/**
 * WorkspaceUnifiedSidebarV2 — Design prototype
 *
 * Placed on the RIGHT side for visual validation.
 * 3 equal sections (sidebar ÷ 3), thick separators, each with:
 *   - dropdown title header with full list
 *   - scrollable pinned content area
 *
 * Context section now contains the full WorkspaceContextManagerSidebar content.
 */

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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
  Compass,
  Crosshair,
  Activity,
  Clock,
  Heart,
  Zap,
  Bell,
  CheckCircle2,
  HeartPulse,
  // Settings
  Eye,
  Shield,
} from "lucide-react";
import type { ShellViewData } from "@/components/workspace-shell/types";
import { classifyParticipant } from "@/components/workspace-shell/types";

interface Props {
  shell: ShellViewData;
  collapsed: boolean;
  onToggle: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  ready_for_review: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  under_review: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  approved: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  published: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  active: "bg-green-500/20 text-green-400 border-green-500/30",
  rejected: "bg-red-500/20 text-red-400 border-red-500/30",
  archived: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const STATUS_TEXT_COLORS: Record<string, string> = {
  draft: "text-yellow-500", active: "text-green-500", published: "text-cyan-500",
  approved: "text-emerald-500", archived: "text-gray-400", rejected: "text-red-500",
};

export function WorkspaceUnifiedSidebarV2({
  shell,
  collapsed,
  onToggle,
}: Props) {
  const [location, navigate] = useLocation();
  const base = `/w/${shell.workspaceId}`;
  const participantType = classifyParticipant(shell.participantRole, shell.isManager);

  const { data: activity } = trpc.workspaces.activity.list.useQuery(
    { workspaceId: shell.workspaceId, limit: 5 },
    { staleTime: 30000, enabled: shell.workspaceId > 0 }
  );

  const isActive = (path: string) => {
    if (path === base) return location === base;
    return location.startsWith(path);
  };

  /* ─── Shared nav item renderer ─── */
  const NavItem = ({ icon, label, path, action, count }: { icon: React.ReactNode; label: string; path: string; action?: () => void; count?: number }) => {
    const content = (
      <>
        {icon}
        <span>{label}</span>
        {count !== undefined && (
          <Badge variant="secondary" className="text-[10px] py-0 px-1.5 ml-auto font-mono">{count}</Badge>
        )}
      </>
    );
    if (action) {
      return (
        <button
          onClick={action}
          className="flex items-center gap-2.5 w-full px-3 py-2 text-sm rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          {content}
        </button>
      );
    }
    return (
      <Link href={path}>
        <button className={cn(
          "flex items-center gap-2.5 w-full px-3 py-2 text-sm rounded-lg transition-colors",
          isActive(path)
            ? "bg-primary/15 text-primary font-medium"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        )}>
          {content}
        </button>
      </Link>
    );
  };

  /* ─── Section wrapper ─── */
  const Section = ({
    title,
    icon,
    color,
    children,
    dropdownItems,
  }: {
    title: string;
    icon: React.ReactNode;
    color: string;
    children: React.ReactNode;
    dropdownItems: { icon: React.ReactNode; label: string; path: string; action?: () => void }[];
  }) => (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Section header = dropdown trigger */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={cn("flex items-center gap-2 px-3 py-2 shrink-0 w-full hover:brightness-125 transition-all cursor-pointer", color)}>
            {icon}
            <span className="text-xs font-bold uppercase tracking-widest">{title}</span>
            <ChevronDown className="h-3 w-3 ml-auto opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" className="w-56 max-h-80 overflow-y-auto">
          <DropdownMenuLabel>{title} — Full List</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {dropdownItems.map((item, i) => (
            <DropdownMenuItem
              key={i}
              className={cn("gap-2 cursor-pointer", item.path && isActive(item.path) && "bg-accent")}
              onClick={() => item.action ? item.action() : item.path ? navigate(item.path) : undefined}
            >
              {item.icon}
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Pinned items */}
      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-0.5">
        {children}
      </div>
    </div>
  );

  /* ═══════════════════════════════════════════ */
  /*            COLLAPSED (icon-only)            */
  /* ═══════════════════════════════════════════ */

  if (collapsed) {
    return (
      <aside className="flex flex-col border-r bg-card w-12 shrink-0 transition-all duration-200">
        {/* Toggle button */}
        <div className="flex items-center justify-center h-10 border-b shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Tools section — dropdown header + item icons */}
        <div className="flex-1 flex flex-col items-center gap-1 py-2 border-b">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 rounded-md hover:bg-blue-500/10 transition-colors cursor-pointer">
                <Wrench className="h-3.5 w-3.5 text-blue-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-56 max-h-80 overflow-y-auto">
              <DropdownMenuLabel>Tools — Full List</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {[
                { icon: <LayoutDashboard className="h-4 w-4" />, label: "Dashboard", path: `${base}/settings` },
                { icon: <LayoutDashboard className="h-4 w-4" />, label: "Overview", path: base },
                { icon: <FolderKanban className="h-4 w-4" />, label: "Projects", path: `${base}/projects` },
                { icon: <BookOpen className="h-4 w-4" />, label: "Knowledge", path: `${base}/knowledge` },
                { icon: <Bot className="h-4 w-4" />, label: "Agents", path: `${base}/agents` },
                { icon: <MessageSquare className="h-4 w-4" />, label: "Collaboration", path: `${base}/collaboration` },
                { icon: <BarChart3 className="h-4 w-4" />, label: "Reports", path: `${base}/reports` },
                { icon: <Users className="h-4 w-4" />, label: "Team", path: `${base}/team` },
                { icon: <Cpu className="h-4 w-4" />, label: "Crew", path: `${base}/crew` },
                { icon: <CheckCircle2 className="h-4 w-4" />, label: "Modules", path: `${base}/projects/settings` },
                { icon: <Scale className="h-4 w-4" />, label: "Rules", path: `${base}/rules` },
                { icon: <ShieldCheck className="h-4 w-4" />, label: "Governance", path: `${base}/governance` },
                { icon: <Package className="h-4 w-4" />, label: "Resources", path: `${base}/resources` },
                { icon: <GitBranch className="h-4 w-4" />, label: "Workflows", path: `${base}/workflows` },
              ].map((item, i) => (
                <DropdownMenuItem key={i} className={cn("gap-2 cursor-pointer", item.path && isActive(item.path) && "bg-accent")} onClick={() => item.path ? navigate(item.path) : undefined}>
                  {item.icon}{item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip><TooltipTrigger asChild>
            <Link href={`${base}/settings`}><Button variant={isActive(`${base}/settings`) ? "secondary" : "ghost"} size="icon" className="h-8 w-8"><LayoutDashboard className="h-4 w-4" /></Button></Link>
          </TooltipTrigger><TooltipContent side="right">Dashboard</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <Link href={`${base}/team`}><Button variant={isActive(`${base}/team`) ? "secondary" : "ghost"} size="icon" className="h-8 w-8"><Users className="h-4 w-4" /></Button></Link>
          </TooltipTrigger><TooltipContent side="right">Team</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <Link href={`${base}/crew`}><Button variant={isActive(`${base}/crew`) ? "secondary" : "ghost"} size="icon" className="h-8 w-8"><Cpu className="h-4 w-4" /></Button></Link>
          </TooltipTrigger><TooltipContent side="right">Crew</TooltipContent></Tooltip>
        </div>

        {/* Context section — dropdown header + item icons */}
        <div className="flex-1 flex flex-col items-center gap-1 py-2 border-b">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 rounded-md hover:bg-emerald-500/10 transition-colors cursor-pointer">
                <Info className="h-3.5 w-3.5 text-emerald-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-56 max-h-80 overflow-y-auto">
              <DropdownMenuLabel>Context — Full List</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {[
                { icon: <Target className="h-4 w-4" />, label: `Identity: ${shell.workspaceName}`, path: "" },
                { icon: <Compass className="h-4 w-4" />, label: `Purpose: ${shell.purposeType || "not set"}`, path: "" },
                { icon: <Activity className="h-4 w-4" />, label: `Status: ${shell.status.replace(/_/g, " ")}`, path: "" },
                ...(shell.missionEmphasis ? [{ icon: <Zap className="h-4 w-4" />, label: `Mission: ${shell.missionEmphasis}`, path: "" }] : []),
                { icon: <HeartPulse className="h-4 w-4" />, label: "Health: Healthy", path: "" },
                { icon: <Bell className="h-4 w-4" />, label: "Alerts: None", path: "" },
                { icon: <BookOpen className="h-4 w-4" />, label: "Workspace Guide", path: `${base}/rules` },
                ...((activity as any[]) || []).slice(0, 3).map((act: any) => ({
                  icon: <Clock className="h-4 w-4" />,
                  label: act.action,
                  path: "",
                })),
              ].map((item, i) => (
                <DropdownMenuItem key={i} className={cn("gap-2 cursor-pointer", item.path && isActive(item.path) && "bg-accent")} onClick={() => item.path ? navigate(item.path) : undefined}>
                  {item.icon}{item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip><TooltipTrigger asChild>
            <div className="h-8 w-8 flex items-center justify-center"><Target className="h-4 w-4 text-muted-foreground" /></div>
          </TooltipTrigger><TooltipContent side="right">{shell.workspaceName}</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <div className="h-8 w-8 flex items-center justify-center"><Activity className="h-4 w-4 text-muted-foreground" /></div>
          </TooltipTrigger><TooltipContent side="right">{shell.status.replace(/_/g, " ")}</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <div className="h-8 w-8 flex items-center justify-center"><Compass className="h-4 w-4 text-muted-foreground" /></div>
          </TooltipTrigger><TooltipContent side="right">{shell.purposeType || "Purpose"}</TooltipContent></Tooltip>
        </div>

        {/* Settings section — dropdown header + item icons */}
        <div className="flex-1 flex flex-col items-center gap-1 py-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 rounded-md hover:bg-orange-500/10 transition-colors cursor-pointer">
                <Settings className="h-3.5 w-3.5 text-orange-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-56 max-h-80 overflow-y-auto">
              <DropdownMenuLabel>Settings — Full List</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {[
                { icon: <Shield className="h-4 w-4" />, label: "Oversight", path: `${base}/oversight` },
                { icon: <Scale className="h-4 w-4" />, label: "Rules", path: `${base}/rules` },
                { icon: <Eye className="h-4 w-4" />, label: "Visibility", path: `${base}/visibility` },
                { icon: <BookOpen className="h-4 w-4" />, label: "Workspace Guide", path: `${base}/rules` },
                { icon: <ShieldCheck className="h-4 w-4" />, label: "Governance", path: `${base}/governance` },
              ].map((item, i) => (
                <DropdownMenuItem key={i} className={cn("gap-2 cursor-pointer", item.path && isActive(item.path) && "bg-accent")} onClick={() => item.path ? navigate(item.path) : undefined}>
                  {item.icon}{item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip><TooltipTrigger asChild>
            <Link href={`${base}/oversight`}><Button variant={isActive(`${base}/oversight`) ? "secondary" : "ghost"} size="icon" className="h-8 w-8"><Shield className="h-4 w-4" /></Button></Link>
          </TooltipTrigger><TooltipContent side="right">Oversight</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <Link href={`${base}/rules`}><Button variant={isActive(`${base}/rules`) ? "secondary" : "ghost"} size="icon" className="h-8 w-8"><Scale className="h-4 w-4" /></Button></Link>
          </TooltipTrigger><TooltipContent side="right">Rules</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <Link href={`${base}/governance`}><Button variant={isActive(`${base}/governance`) ? "secondary" : "ghost"} size="icon" className="h-8 w-8"><ShieldCheck className="h-4 w-4" /></Button></Link>
          </TooltipTrigger><TooltipContent side="right">Governance</TooltipContent></Tooltip>
        </div>
      </aside>
    );
  }

  /* ═══════════════════════════════════════════ */
  /*            EXPANDED (full sidebar)          */
  /* ═══════════════════════════════════════════ */

  return (
    <aside className="flex flex-col border-r bg-card w-64 shrink-0 overflow-hidden transition-all duration-200">
      {/* Toggle button */}
      <div className="flex items-center justify-end h-10 border-b px-2 shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* ══════════ SECTION 1: TOOLS ══════════ */}
      <Section
        title="Tools"
        icon={<Wrench className="h-3.5 w-3.5" />}
        color="bg-blue-500/10 text-blue-400"
        dropdownItems={[
          { icon: <LayoutDashboard className="h-4 w-4" />, label: "Dashboard", path: `${base}/settings` },
          { icon: <LayoutDashboard className="h-4 w-4" />, label: "Overview", path: base },
          { icon: <FolderKanban className="h-4 w-4" />, label: "Projects", path: `${base}/projects` },
          { icon: <BookOpen className="h-4 w-4" />, label: "Knowledge", path: `${base}/knowledge` },
          { icon: <Bot className="h-4 w-4" />, label: "Agents", path: `${base}/agents` },
          { icon: <MessageSquare className="h-4 w-4" />, label: "Collaboration", path: `${base}/collaboration` },
          { icon: <BarChart3 className="h-4 w-4" />, label: "Reports", path: `${base}/reports` },
          { icon: <Users className="h-4 w-4" />, label: "Team", path: `${base}/team` },
          { icon: <Cpu className="h-4 w-4" />, label: "Crew", path: `${base}/crew` },
          { icon: <CheckCircle2 className="h-4 w-4" />, label: "Modules", path: `${base}/projects/settings` },
          { icon: <Scale className="h-4 w-4" />, label: "Rules", path: `${base}/rules` },
          { icon: <ShieldCheck className="h-4 w-4" />, label: "Governance", path: `${base}/governance` },
          { icon: <Package className="h-4 w-4" />, label: "Resources", path: `${base}/resources` },
          { icon: <GitBranch className="h-4 w-4" />, label: "Workflows", path: `${base}/workflows` },
        ]}
      >
        <NavItem icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" path={`${base}/settings`} count={shell.enabledModules.length} />
        <NavItem icon={<Users className="h-4 w-4" />} label="Team" path={`${base}/team`} count={shell.teamCount} />
        <NavItem icon={<Cpu className="h-4 w-4" />} label="Crew" path={`${base}/crew`} count={shell.crewCount} />
        <NavItem icon={<CheckCircle2 className="h-4 w-4" />} label="Modules" path={`${base}/projects/settings`} count={shell.enabledModules.length} />
      </Section>

      {/* ══ Separator ══ */}
      <div className="h-0.5 bg-border" />

      {/* ══════════ SECTION 2: CONTEXT ══════════ */}
      <Section
        title="Context"
        icon={<Info className="h-3.5 w-3.5" />}
        color="bg-emerald-500/10 text-emerald-400"
        dropdownItems={[
          { icon: <Target className="h-4 w-4" />, label: `Identity: ${shell.workspaceName}`, path: "" },
          { icon: <Compass className="h-4 w-4" />, label: `Purpose: ${shell.purposeType || "not set"}`, path: "" },
          { icon: <Activity className="h-4 w-4" />, label: `Status: ${shell.status.replace(/_/g, " ")}`, path: "" },
          ...(shell.missionEmphasis ? [{ icon: <Zap className="h-4 w-4" />, label: `Mission: ${shell.missionEmphasis}`, path: "" }] : []),
          { icon: <HeartPulse className="h-4 w-4" />, label: "Health: Healthy", path: "" },
          { icon: <Bell className="h-4 w-4" />, label: "Alerts: None", path: "" },
          { icon: <BookOpen className="h-4 w-4" />, label: "Workspace Guide", path: `${base}/rules` },
          ...((activity as any[]) || []).slice(0, 3).map((act: any) => ({
            icon: <Clock className="h-4 w-4" />,
            label: act.action,
            path: "",
          })),
        ]}
      >
        {/* ── Identity ── */}
        <div className="px-1 pt-1 pb-1.5">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold leading-tight truncate">{shell.workspaceName}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px] py-0 font-medium">
                {shell.workspaceType || "generic"}
              </Badge>
              <span className={cn("text-[11px] font-semibold capitalize", STATUS_TEXT_COLORS[shell.status] || "text-muted-foreground")}>
                {shell.status.replace(/_/g, " ")}
              </span>
            </div>
            {shell.workspaceDescription && (
              <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{shell.workspaceDescription}</p>
            )}
          </div>
        </div>

        {/* ── Purpose ── */}
        {shell.sidebar.showPurpose && (
          <div className="px-1 pb-1.5">
            <div className="flex items-center gap-1 mb-0.5">
              <Compass className="h-3 w-3 text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Purpose</span>
            </div>
            {shell.purposeType ? (
              <p className="text-[11px]">
                <span className="font-medium capitalize">{shell.purposeType}</span>
                {shell.purposeRef && (
                  <span className="text-muted-foreground"> — {shell.purposeRef}</span>
                )}
              </p>
            ) : (
              <p className="text-[10px] text-muted-foreground italic">Not yet defined</p>
            )}
          </div>
        )}

        {/* ── Mission ── */}
        {shell.sidebar.showMission && (
          <div className="px-1 pb-1.5">
            {shell.missionEmphasis ? (
              <div className="rounded border border-primary/30 bg-primary/5 p-1.5">
                <p className="text-[11px] font-medium text-primary leading-relaxed line-clamp-2">{shell.missionEmphasis}</p>
              </div>
            ) : (
              <div className="rounded border bg-muted/40 p-1.5">
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {participantType === "manager"
                    ? "You manage this workspace."
                    : participantType === "member"
                    ? "You contribute here."
                    : "You can observe activity."}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Recent Activity (compact) ── */}
        {shell.sidebar.showActivityLog && (
          <div className="px-1 pb-1">
            <div className="flex items-center gap-1 mb-0.5">
              <Clock className="h-3 w-3 text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Activity</span>
            </div>
            {activity && (activity as any[]).length > 0 ? (
              <div className="space-y-1">
                {(activity as any[]).slice(0, 3).map((act: any) => (
                  <div key={act.id} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <div className="h-1 w-1 rounded-full bg-primary/50 mt-1.5 shrink-0" />
                    <span className="truncate text-foreground/80">{act.action}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground italic">No recent activity</p>
            )}
          </div>
        )}

        {/* ── Health + Alerts (inline) ── */}
        {shell.sidebar.showHealth && (
          <div className="flex items-center gap-1.5 px-1 pb-1 text-[11px] text-muted-foreground">
            <HeartPulse className="h-3 w-3 text-green-500" />
            <span>Healthy</span>
            {shell.sidebar.showAlerts && shell.alertsEnabled && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <Bell className="h-3 w-3 text-green-500" />
                <span>No alerts</span>
              </>
            )}
          </div>
        )}
      </Section>

      {/* ══ Separator ══ */}
      <div className="h-0.5 bg-border" />

      {/* ══════════ SECTION 3: SETTINGS ══════════ */}
      <Section
        title="Settings"
        icon={<Settings className="h-3.5 w-3.5" />}
        color="bg-orange-500/10 text-orange-400"
        dropdownItems={[
          { icon: <Shield className="h-4 w-4" />, label: "Oversight", path: `${base}/oversight` },
          { icon: <Scale className="h-4 w-4" />, label: "Rules", path: `${base}/rules` },
          { icon: <Eye className="h-4 w-4" />, label: "Visibility", path: `${base}/visibility` },
          { icon: <BookOpen className="h-4 w-4" />, label: "Workspace Guide", path: `${base}/rules` },
          { icon: <ShieldCheck className="h-4 w-4" />, label: "Governance", path: `${base}/governance` },
        ]}
      >
        <NavItem icon={<Shield className="h-4 w-4" />} label="Oversight" path={`${base}/oversight`} />
        <NavItem icon={<Scale className="h-4 w-4" />} label="Rules" path={`${base}/rules`} />
        <NavItem icon={<ShieldCheck className="h-4 w-4" />} label="Governance" path={`${base}/governance`} />
      </Section>
    </aside>
  );
}
