/**
 * WorkspaceContextSidebar — Operational Awareness Sidebar
 *
 * Makes the workspace intelligible before navigable.
 *
 * Top: Identity, Global Purpose, Participant Mission
 * Middle: Current Work, Activity Log, Alerts, Quick Actions
 * Bottom: Workspace Guide, Health Indicator, Settings
 */

import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Target,
  Activity,
  Bell,
  Zap,
  BookOpen,
  Heart,
  Settings,
  ChevronLeft,
  ChevronRight,
  Users,
  Bot,
  Shield,
  Clock,
  ArrowRight,
  Home,
} from "lucide-react";

interface ContextSidebarProps {
  workspaceId: number;
  workspaceName: string;
  workspaceDescription?: string | null;
  workspaceType?: string | null;
  purposeType?: string | null;
  purposeRef?: string | null;
  status: string;
  participantRole?: string | null;
  isManager: boolean;
  enabledModules: string[];
  teamCount: number;
  crewCount: number;
  collapsed: boolean;
  onToggle: () => void;
  missionEmphasis?: string | null;
  alertsEnabled?: boolean;
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

export function WorkspaceContextSidebar({
  workspaceId,
  workspaceName,
  workspaceDescription,
  workspaceType,
  purposeType,
  purposeRef,
  status,
  participantRole,
  isManager,
  enabledModules,
  teamCount,
  crewCount,
  collapsed,
  onToggle,
  missionEmphasis,
  alertsEnabled = true,
}: ContextSidebarProps) {
  const [location] = useLocation();
  const base = `/w/${workspaceId}`;

  const { data: activity } = trpc.workspaces.activity.list.useQuery(
    { workspaceId, limit: 5 },
    { enabled: !collapsed }
  );

  const Section = ({ title, children, icon }: { title: string; children: React.ReactNode; icon: React.ReactNode }) => {
    if (collapsed) return null;
    return (
      <div className="px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
          {icon}
          {title}
        </div>
        {children}
      </div>
    );
  };

  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-card transition-all duration-200 shrink-0 overflow-y-auto",
        collapsed ? "w-12" : "w-64"
      )}
    >
      {/* Header with toggle */}
      <div className="flex items-center gap-2 border-b px-3 h-12 shrink-0">
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold truncate block">{workspaceName}</span>
            <span className={cn("text-xs", STATUS_COLORS[status] || "text-muted-foreground")}>
              {status.replace(/_/g, " ")}
            </span>
          </div>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onToggle}>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Collapsed: icon-only navigation */}
      {collapsed && (
        <div className="flex flex-col items-center gap-1 py-2">
          <Tooltip><TooltipTrigger asChild>
            <Link href="/ws/dashboard"><Button variant="ghost" size="icon" className="h-8 w-8"><Home className="h-4 w-4" /></Button></Link>
          </TooltipTrigger><TooltipContent side="right">WS Dashboard</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <Link href={`${base}/overview`}><Button variant="ghost" size="icon" className="h-8 w-8"><Target className="h-4 w-4" /></Button></Link>
          </TooltipTrigger><TooltipContent side="right">Overview</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <Link href={`${base}/team`}><Button variant="ghost" size="icon" className="h-8 w-8"><Users className="h-4 w-4" /></Button></Link>
          </TooltipTrigger><TooltipContent side="right">Team</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <Link href={`${base}/crew`}><Button variant="ghost" size="icon" className="h-8 w-8"><Bot className="h-4 w-4" /></Button></Link>
          </TooltipTrigger><TooltipContent side="right">Crew</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <Link href={`${base}/rules`}><Button variant="ghost" size="icon" className="h-8 w-8"><Shield className="h-4 w-4" /></Button></Link>
          </TooltipTrigger><TooltipContent side="right">Rules</TooltipContent></Tooltip>
          {isManager && (
            <Tooltip><TooltipTrigger asChild>
              <Link href={`${base}/settings`}><Button variant="ghost" size="icon" className="h-8 w-8"><Settings className="h-4 w-4" /></Button></Link>
            </TooltipTrigger><TooltipContent side="right">Settings</TooltipContent></Tooltip>
          )}
        </div>
      )}

      {/* ─── TOP: Identity + Purpose + Mission ─── */}
      <Section title="Identity" icon={<Target className="h-3 w-3" />}>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Type:</span>
            <Badge variant="secondary" className="text-xs py-0">{workspaceType || "generic"}</Badge>
          </div>
          {workspaceDescription && (
            <p className="text-muted-foreground line-clamp-2">{workspaceDescription}</p>
          )}
        </div>
      </Section>

      <Section title="Purpose" icon={<Target className="h-3 w-3" />}>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-xs py-0">{purposeType || "other"}</Badge>
          </div>
          {purposeRef && <p className="text-muted-foreground">{purposeRef}</p>}
        </div>
      </Section>

      {missionEmphasis && (
        <Section title="Mission" icon={<Zap className="h-3 w-3" />}>
          <p className="text-xs font-medium text-primary">{missionEmphasis}</p>
        </Section>
      )}

      {/* Divider */}
      {!collapsed && <div className="border-b mx-3" />}

      {/* ─── MIDDLE: Current Work + Activity + Alerts ─── */}
      <Section title="Participants" icon={<Users className="h-3 w-3" />}>
        <div className="flex gap-3 text-xs">
          <div className="flex items-center gap-1">
            <Users className="h-3 w-3 text-muted-foreground" />
            <span>{teamCount} team</span>
          </div>
          <div className="flex items-center gap-1">
            <Bot className="h-3 w-3 text-muted-foreground" />
            <span>{crewCount} crew</span>
          </div>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Your role: <Badge variant="secondary" className="text-xs py-0 ml-1">{participantRole || "viewer"}</Badge>
        </div>
      </Section>

      <Section title="Recent Activity" icon={<Activity className="h-3 w-3" />}>
        {activity && (activity as any[]).length > 0 ? (
          <div className="space-y-1">
            {(activity as any[]).slice(0, 3).map((act: any) => (
              <div key={act.id} className="text-xs text-muted-foreground flex items-start gap-1">
                <Clock className="h-3 w-3 shrink-0 mt-0.5" />
                <span className="truncate">{act.action}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No recent activity</p>
        )}
      </Section>

      {alertsEnabled && (
        <Section title="Alerts" icon={<Bell className="h-3 w-3" />}>
          <p className="text-xs text-muted-foreground">No active alerts</p>
        </Section>
      )}

      {/* ─── BOTTOM: Guide + Health + Settings ─── */}
      {!collapsed && <div className="flex-1" />}

      {!collapsed && (
        <div className="border-t px-3 py-2 space-y-1 shrink-0">
          <Link href={`${base}/rules`}>
            <button className="flex items-center gap-2 w-full px-2 py-1 text-xs rounded hover:bg-accent text-muted-foreground">
              <BookOpen className="h-3 w-3" /> Workspace Guide
            </button>
          </Link>
          <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
            <Heart className="h-3 w-3 text-green-500" />
            <span>Healthy</span>
          </div>
          {isManager && (
            <Link href={`${base}/settings`}>
              <button className="flex items-center gap-2 w-full px-2 py-1 text-xs rounded hover:bg-accent text-muted-foreground">
                <Settings className="h-3 w-3" /> Settings
              </button>
            </Link>
          )}
        </div>
      )}
    </aside>
  );
}
