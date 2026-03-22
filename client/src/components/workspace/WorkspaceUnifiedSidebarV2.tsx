/**
 * WorkspaceUnifiedSidebarV2 — Design prototype
 *
 * Placed on the RIGHT side for visual validation.
 * 3 equal sections (sidebar ÷ 3), thick separators, each with:
 *   - 3 pinned items
 *   - dropdown at bottom with the full list from that original sidebar
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
  Activity,
  Clock,
  Heart,
  Zap,
  Bell,
  // Settings
  Eye,
  Shield,
} from "lucide-react";

interface Props {
  workspaceId: number;
  workspaceName: string;
  workspaceType?: string | null;
  status: string;
  isManager: boolean;
  participantRole?: string | null;
  teamCount: number;
  crewCount: number;
  purposeType?: string | null;
  purposeRef?: string | null;
  missionEmphasis?: string | null;
  onOversightOpen: () => void;
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

export function WorkspaceUnifiedSidebarV2({
  workspaceId,
  workspaceName,
  workspaceType,
  status,
  isManager,
  participantRole,
  teamCount,
  crewCount,
  purposeType,
  purposeRef,
  missionEmphasis,
  onOversightOpen,
}: Props) {
  const [location, navigate] = useLocation();
  const base = `/w/${workspaceId}`;

  const { data: activity } = trpc.workspaces.activity.list.useQuery(
    { workspaceId, limit: 5 },
    {}
  );

  const isActive = (path: string) => {
    if (path === base) return location === base;
    return location.startsWith(path);
  };

  /* ─── Shared nav item renderer ─── */
  const NavItem = ({ icon, label, path, action }: { icon: React.ReactNode; label: string; path: string; action?: () => void }) => {
    if (action) {
      return (
        <button
          onClick={action}
          className="flex items-center gap-2.5 w-full px-3 py-2 text-sm rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          {icon}
          <span>{label}</span>
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
          {icon}
          <span>{label}</span>
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
    dropdownLabel,
    dropdownItems,
  }: {
    title: string;
    icon: React.ReactNode;
    color: string;
    children: React.ReactNode;
    dropdownLabel: string;
    dropdownItems: { icon: React.ReactNode; label: string; path: string; action?: () => void }[];
  }) => (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Section header */}
      <div className={cn("flex items-center gap-2 px-3 py-2 shrink-0", color)}>
        {icon}
        <span className="text-xs font-bold uppercase tracking-widest">{title}</span>
      </div>
      {/* Pinned items */}
      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-0.5">
        {children}
      </div>
      {/* Full list dropdown */}
      <div className="px-2 pb-2 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center justify-between w-full px-3 py-1.5 text-xs rounded-lg border border-border/50 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
              <span>{dropdownLabel}</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="left" align="end" className="w-56 max-h-80 overflow-y-auto">
            <DropdownMenuLabel>{title} — Full List</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {dropdownItems.map((item, i) => (
              <DropdownMenuItem
                key={i}
                className={cn("gap-2 cursor-pointer", item.path && isActive(item.path) && "bg-accent")}
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
  );

  /* ═══════════════════════════════════════════ */
  /*                 RENDER                      */
  /* ═══════════════════════════════════════════ */

  return (
    <aside className="flex flex-col border-l bg-card w-64 shrink-0 overflow-hidden">

      {/* ══════════ SECTION 1: TOOLS ══════════ */}
      <Section
        title="Tools"
        icon={<Wrench className="h-3.5 w-3.5" />}
        color="bg-blue-500/10 text-blue-400"
        dropdownLabel={`All Tools (12)`}
        dropdownItems={[
          { icon: <LayoutDashboard className="h-4 w-4" />, label: "Overview", path: base },
          { icon: <FolderKanban className="h-4 w-4" />, label: "Projects", path: `${base}/projects` },
          { icon: <BookOpen className="h-4 w-4" />, label: "Knowledge", path: `${base}/knowledge` },
          { icon: <Bot className="h-4 w-4" />, label: "Agents", path: `${base}/agents` },
          { icon: <MessageSquare className="h-4 w-4" />, label: "Collaboration", path: `${base}/collaboration` },
          { icon: <BarChart3 className="h-4 w-4" />, label: "Reports", path: `${base}/reports` },
          { icon: <Users className="h-4 w-4" />, label: "Team", path: `${base}/team` },
          { icon: <Cpu className="h-4 w-4" />, label: "Crew (AI)", path: `${base}/crew` },
          { icon: <Scale className="h-4 w-4" />, label: "Rules", path: `${base}/rules` },
          { icon: <ShieldCheck className="h-4 w-4" />, label: "Governance", path: `${base}/governance` },
          { icon: <Package className="h-4 w-4" />, label: "Resources", path: `${base}/resources` },
          { icon: <GitBranch className="h-4 w-4" />, label: "Workflows", path: `${base}/workflows` },
        ]}
      >
        <NavItem icon={<Users className="h-4 w-4" />} label="Team" path={`${base}/team`} />
        <NavItem icon={<Cpu className="h-4 w-4" />} label="Crew (AI)" path={`${base}/crew`} />
        <NavItem icon={<FileText className="h-4 w-4" />} label="Documents" path={`${base}/knowledge`} />
      </Section>

      {/* ══ Separator ══ */}
      <div className="h-0.5 bg-border" />

      {/* ══════════ SECTION 2: CONTEXT ══════════ */}
      <Section
        title="Context"
        icon={<Info className="h-3.5 w-3.5" />}
        color="bg-emerald-500/10 text-emerald-400"
        dropdownLabel={`All Context (${8 + ((activity as any[])?.length || 0)})`}
        dropdownItems={[
          { icon: <Target className="h-4 w-4" />, label: `Identity: ${workspaceName}`, path: "" },
          { icon: <Activity className="h-4 w-4" />, label: `Status: ${status.replace(/_/g, " ")}`, path: "" },
          { icon: <Users className="h-4 w-4" />, label: `Team: ${teamCount} members`, path: "" },
          { icon: <Bot className="h-4 w-4" />, label: `Crew: ${crewCount} AI agents`, path: "" },
          { icon: <Target className="h-4 w-4" />, label: `Purpose: ${purposeType || "other"}`, path: "" },
          ...(missionEmphasis ? [{ icon: <Zap className="h-4 w-4" />, label: `Mission: ${missionEmphasis}`, path: "" }] : []),
          { icon: <Shield className="h-4 w-4" />, label: `Role: ${participantRole || "viewer"}`, path: "" },
          { icon: <Heart className="h-4 w-4" />, label: "Health: Healthy", path: "" },
          { icon: <Bell className="h-4 w-4" />, label: "Alerts: None", path: "" },
          ...((activity as any[]) || []).slice(0, 3).map((act: any) => ({
            icon: <Clock className="h-4 w-4" />,
            label: act.action,
            path: "",
          })),
        ]}
      >
        {/* Pinned: Identity */}
        <div className="flex items-center gap-2.5 px-3 py-2 text-sm">
          <Target className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{workspaceName}</span>
          <Badge variant="secondary" className="text-[10px] py-0 ml-auto shrink-0">{workspaceType || "generic"}</Badge>
        </div>
        {/* Pinned: Status + Role */}
        <div className="flex items-center gap-2.5 px-3 py-2 text-sm">
          <Activity className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Badge className={cn("text-[10px] py-0 border", STATUS_COLORS[status] || "")}>
            {status.replace(/_/g, " ")}
          </Badge>
          <Badge variant="outline" className="text-[10px] py-0 ml-auto">{participantRole || "viewer"}</Badge>
        </div>
        {/* Pinned: Participants */}
        <div className="flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4 shrink-0" />
          <span>{teamCount} team</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{crewCount} crew</span>
        </div>
      </Section>

      {/* ══ Separator ══ */}
      <div className="h-0.5 bg-border" />

      {/* ══════════ SECTION 3: SETTINGS ══════════ */}
      <Section
        title="Settings"
        icon={<Settings className="h-3.5 w-3.5" />}
        color="bg-orange-500/10 text-orange-400"
        dropdownLabel={`All Settings (6)`}
        dropdownItems={[
          { icon: <Settings className="h-4 w-4" />, label: "Configure", path: `${base}/settings` },
          { icon: <Shield className="h-4 w-4" />, label: "Oversight", path: "", action: onOversightOpen },
          { icon: <Scale className="h-4 w-4" />, label: "Rules", path: `${base}/rules` },
          { icon: <Eye className="h-4 w-4" />, label: "Visibility", path: `${base}/visibility` },
          { icon: <BookOpen className="h-4 w-4" />, label: "Workspace Guide", path: `${base}/rules` },
          { icon: <ShieldCheck className="h-4 w-4" />, label: "Governance", path: `${base}/governance` },
        ]}
      >
        <NavItem icon={<Settings className="h-4 w-4" />} label="Configure" path={`${base}/settings`} />
        <NavItem icon={<Shield className="h-4 w-4" />} label="Oversight" path="" action={onOversightOpen} />
        <NavItem icon={<Scale className="h-4 w-4" />} label="Rules" path={`${base}/rules`} />
      </Section>
    </aside>
  );
}
