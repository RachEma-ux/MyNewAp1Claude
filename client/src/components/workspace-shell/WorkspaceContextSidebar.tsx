/**
 * WorkspaceContextSidebar — Context / Awareness Panel (NOT navigation)
 *
 * This makes the workspace INTELLIGIBLE before navigable.
 * It answers: What is this? Why does it exist? What is my mission?
 *             What is happening? What needs attention?
 *
 * TOP:    MEANING — Identity, Global Purpose, Participant Mission
 * MIDDLE: AWARENESS — Current Work, Activity, Alerts, Quick Actions
 * BOTTOM: ANCHORS — Guide, Health, Settings
 *
 * Desktop: always-visible 280px panel with strong visual hierarchy
 * Mobile: slide-out drawer
 */

import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import {
  Target,
  Compass,
  Crosshair,
  Activity,
  Bell,
  Zap,
  BookOpen,
  HeartPulse,
  Settings,
  Users,
  Bot,
  Clock,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import type { ShellViewData } from "./types";
import { classifyParticipant } from "./types";

interface ContextSidebarProps {
  shell: ShellViewData;
  open: boolean;
  onClose: () => void;
}

/* ─── Section header with icon ─── */
function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <div className="text-primary">{icon}</div>
      <span className="text-[11px] font-bold uppercase tracking-widest text-primary">{label}</span>
    </div>
  );
}

/* ─── Divider with label ─── */
function ZoneDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className="flex-1 border-t border-border" />
      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">{label}</span>
      <div className="flex-1 border-t border-border" />
    </div>
  );
}

function SidebarContent({ shell }: { shell: ShellViewData }) {
  const basePath = `/w/${shell.workspaceId}`;
  const participantType = classifyParticipant(shell.participantRole, shell.isManager);

  const { data: activity } = trpc.workspaces.activity.list.useQuery(
    { workspaceId: shell.workspaceId, limit: 5 },
    { staleTime: 30000, enabled: shell.workspaceId > 0 }
  );

  const statusColor: Record<string, string> = {
    draft: "text-yellow-500", active: "text-green-500", published: "text-cyan-500",
    approved: "text-emerald-500", archived: "text-gray-400", rejected: "text-red-500",
  };

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col min-h-full">

        {/* ════════════════════════════════════════════════════════════════
            ZONE 1 — MEANING
            What is this workspace? Why does it exist? What is my mission?
           ════════════════════════════════════════════════════════════════ */}

        {/* ── Identity ── */}
        <div className="px-4 pt-4 pb-3">
          <SectionLabel icon={<Target className="h-3.5 w-3.5" />} label="Identity" />
          {(
            <div className="space-y-2">
              <p className="text-base font-semibold leading-tight">{shell.workspaceName}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="text-[11px] py-0.5 font-medium">
                  {shell.workspaceType || "generic"}
                </Badge>
                <span className={cn("text-xs font-semibold capitalize", statusColor[shell.status] || "text-muted-foreground")}>
                  {shell.status.replace(/_/g, " ")}
                </span>
              </div>
              {shell.workspaceDescription && (
                <p className="text-xs text-muted-foreground leading-relaxed">{shell.workspaceDescription}</p>
              )}
            </div>
          )}
        </div>

        {/* ── Global Purpose ── */}
        <div className="px-4 pb-3">
          <SectionLabel icon={<Compass className="h-3.5 w-3.5" />} label="Global Purpose" />
            <div className="space-y-1.5">
              {shell.purposeType ? (
                <p className="text-sm">
                  <span className="font-medium capitalize">{shell.purposeType}</span>
                  {shell.purposeRef && (
                    <span className="text-muted-foreground"> — {shell.purposeRef}</span>
                  )}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground italic">Purpose not yet defined</p>
              )}
            </div>
        </div>

        {/* ── Participant Mission ── */}
        <div className="px-4 pb-3">
          <SectionLabel icon={<Crosshair className="h-3.5 w-3.5" />} label="Your Mission" />
          {shell.missionEmphasis ? (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5">
              <p className="text-xs font-medium text-primary leading-relaxed">{shell.missionEmphasis}</p>
            </div>
          ) : (
            <div className="rounded-md border bg-muted/40 p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Badge variant="secondary" className="text-[10px] py-0 font-semibold">
                  {shell.participantRole || "viewer"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {participantType === "manager"
                  ? "You manage and configure this workspace — shape tools, team, and visibility for participants."
                  : participantType === "member"
                  ? "You contribute and collaborate here — use the tools above to do your work."
                  : "You can observe workspace activity and access shared resources."}
              </p>
            </div>
          )}
        </div>

        <ZoneDivider label="Awareness" />

        {/* ════════════════════════════════════════════════════════════════
            ZONE 2 — SITUATIONAL AWARENESS
            What is happening? What needs attention? What should I do?
           ════════════════════════════════════════════════════════════════ */}

        {/* ── Current Work ── */}
        {shell.sidebar.showCurrentWork && (
          <div className="px-4 pb-3">
            <SectionLabel icon={<Activity className="h-3.5 w-3.5" />} label="Current Work" />
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center rounded-md bg-muted/50 py-2">
                <Users className="h-3.5 w-3.5 mx-auto mb-0.5 text-muted-foreground" />
                <p className="text-sm font-bold">{shell.teamCount}</p>
                <p className="text-[9px] text-muted-foreground">Team</p>
              </div>
              <div className="text-center rounded-md bg-muted/50 py-2">
                <Bot className="h-3.5 w-3.5 mx-auto mb-0.5 text-muted-foreground" />
                <p className="text-sm font-bold">{shell.crewCount}</p>
                <p className="text-[9px] text-muted-foreground">AI Crew</p>
              </div>
              <div className="text-center rounded-md bg-muted/50 py-2">
                <CheckCircle2 className="h-3.5 w-3.5 mx-auto mb-0.5 text-muted-foreground" />
                <p className="text-sm font-bold">{shell.enabledModules.length}</p>
                <p className="text-[9px] text-muted-foreground">Modules</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Recent Activity ── */}
        {shell.sidebar.showActivityLog && (
          <div className="px-4 pb-3">
            <SectionLabel icon={<Clock className="h-3.5 w-3.5" />} label="Recent Activity" />
            {activity && (activity as any[]).length > 0 ? (
              <div className="space-y-1.5">
                {(activity as any[]).slice(0, 4).map((act: any) => (
                  <div key={act.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary/50 mt-1.5 shrink-0" />
                    <div className="min-w-0">
                      <span className="truncate block text-foreground/80">{act.action}</span>
                      <span className="text-[10px] opacity-50">
                        {new Date(act.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No recent activity</p>
            )}
          </div>
        )}

        {/* ── Alerts ── */}
        {shell.sidebar.showAlerts && shell.alertsEnabled && (
          <div className="px-4 pb-3">
            <SectionLabel icon={<Bell className="h-3.5 w-3.5" />} label="Alerts" />
            <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-md bg-green-500/5 border border-green-500/20 px-2.5 py-1.5">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              <span>No active alerts</span>
            </div>
          </div>
        )}

        {/* ── Quick Actions ── */}
        {shell.sidebar.showQuickActions && (
          <div className="px-4 pb-3">
            <SectionLabel icon={<Zap className="h-3.5 w-3.5" />} label="Quick Actions" />
            <div className="space-y-0.5">
              {shell.quickActions.length > 0 ? (
                shell.quickActions.map((action, i) => (
                  <button key={i} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs rounded-md hover:bg-accent text-left transition-colors">
                    <ChevronRight className="h-3 w-3 text-primary shrink-0" />
                    <span>{action}</span>
                  </button>
                ))
              ) : (
                <>
                  {participantType === "manager" && (
                    <>
                      <Link href={`${basePath}/team`}><button className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs rounded-md hover:bg-accent text-left transition-colors"><ChevronRight className="h-3 w-3 text-primary shrink-0" /><span>Manage team</span></button></Link>
                      <Link href={`${basePath}/settings`}><button className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs rounded-md hover:bg-accent text-left transition-colors"><ChevronRight className="h-3 w-3 text-primary shrink-0" /><span>Configure workspace</span></button></Link>
                    </>
                  )}
                  <Link href={`${basePath}/projects`}><button className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs rounded-md hover:bg-accent text-left transition-colors"><ChevronRight className="h-3 w-3 text-primary shrink-0" /><span>Open projects</span></button></Link>
                  <Link href={`${basePath}/collaboration`}><button className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs rounded-md hover:bg-accent text-left transition-colors"><ChevronRight className="h-3 w-3 text-primary shrink-0" /><span>Collaboration</span></button></Link>
                </>
              )}
            </div>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1 min-h-4" />

        <ZoneDivider label="Anchors" />

        {/* ════════════════════════════════════════════════════════════════
            ZONE 3 — ANCHORS / UTILITIES
           ════════════════════════════════════════════════════════════════ */}
        <div className="px-4 pb-4 space-y-1 shrink-0">
          {shell.sidebar.showGuide && (
            <Link href={`${basePath}/rules`}>
              <button className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs rounded-md hover:bg-accent text-muted-foreground transition-colors">
                <BookOpen className="h-3.5 w-3.5" />
                <span>Workspace Guide</span>
              </button>
            </Link>
          )}
          {shell.sidebar.showHealth && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted-foreground">
              <HeartPulse className="h-3.5 w-3.5 text-green-500" />
              <span>Healthy</span>
              <span className="text-[10px] opacity-50 ml-auto">{shell.enabledModules.length} modules</span>
            </div>
          )}
          {shell.isManager && (
            <Link href={`${basePath}/settings`}>
              <button className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs rounded-md hover:bg-accent text-muted-foreground transition-colors">
                <Settings className="h-3.5 w-3.5" />
                <span>Settings</span>
              </button>
            </Link>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}

export function WorkspaceContextSidebar({ shell, open, onClose }: ContextSidebarProps) {
  const content = <SidebarContent shell={shell} />;

  return (
    <>
      {/* Desktop: always-visible inline panel */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r bg-card/80 backdrop-blur-sm transition-all duration-200 shrink-0 overflow-hidden",
          open ? "w-[280px]" : "w-0 border-r-0"
        )}
      >
        {open && content}
      </aside>

      {/* Mobile: drawer */}
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="left" className="w-[300px] p-0 md:hidden">
          <div className="flex flex-col h-full">{content}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
