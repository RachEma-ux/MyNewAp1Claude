/**
 * WorkspaceMainFrame — Mission/work-driven main execution area (NEW SHELL)
 *
 * The default landing is NOT a generic module-card dashboard.
 * It is a mission/work-driven execution frame that renders:
 *   - Participant mission context
 *   - Current work summary
 *   - Relevant resources
 *   - Activity
 *   - Alerts
 *   - Next actions
 *
 * Module summary cards exist but are SECONDARY.
 */

import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Target,
  Crosshair,
  Activity,
  Zap,
  FolderKanban,
  BookOpen,
  Bot,
  MessageSquare,
  BarChart3,
  Users,
  Shield,
  Network,
  Clock,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import type { ShellViewData, ParticipantType } from "./types";
import { classifyParticipant } from "./types";

interface MainFrameProps {
  shell: ShellViewData;
  basePath: string;
}

export function WorkspaceMainFrame({ shell, basePath }: MainFrameProps) {
  const participantType = classifyParticipant(shell.participantRole, shell.isManager);

  const { data: summary } = trpc.modules.reporting.summary.useQuery(
    { workspaceId: shell.workspaceId },
    { retry: false }
  );

  const { data: activity } = trpc.workspaces.activity.list.useQuery(
    { workspaceId: shell.workspaceId, limit: 8 },
    { staleTime: 30000 }
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      {/* ================================================================
          MISSION CONTEXT — What you're here for
          ================================================================ */}
      <div className="space-y-3">
        {/* Purpose and Mission Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">{shell.workspaceName}</h1>
          </div>
          {shell.workspaceDescription && (
            <p className="text-sm text-muted-foreground ml-7">
              {shell.workspaceDescription}
            </p>
          )}
        </div>

        {/* Mission emphasis */}
        {shell.missionEmphasis && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-3 px-4 flex items-start gap-3">
              <Crosshair className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-primary uppercase tracking-wider">Your Mission</p>
                <p className="text-sm mt-0.5">{shell.missionEmphasis}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Role context */}
        {!shell.missionEmphasis && (
          <Card className="bg-muted/30">
            <CardContent className="py-3 px-4 flex items-start gap-3">
              <Crosshair className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Your Role</p>
                <p className="text-sm mt-0.5">
                  {participantType === "manager"
                    ? "You manage this workspace. Configure tools, team, and visibility."
                    : participantType === "member"
                    ? "You are a contributing member. Use the tools above to collaborate."
                    : "You have view access to this workspace."}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ================================================================
          CURRENT WORK — What is happening now
          ================================================================ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Users className="h-3.5 w-3.5" />
              Team
            </div>
            <p className="text-2xl font-bold">{shell.teamCount}</p>
            <p className="text-xs text-muted-foreground">member{shell.teamCount !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Bot className="h-3.5 w-3.5" />
              AI Crew
            </div>
            <p className="text-2xl font-bold">{shell.crewCount}</p>
            <p className="text-xs text-muted-foreground">agent{shell.crewCount !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Activity className="h-3.5 w-3.5" />
              Status
            </div>
            <p className="text-2xl font-bold capitalize">{shell.status.replace(/_/g, " ")}</p>
            <p className="text-xs text-muted-foreground">{shell.enabledModules.length} modules active</p>
          </CardContent>
        </Card>
      </div>

      {/* ================================================================
          NEXT ACTIONS + ACTIVITY — Side by side on desktop
          ================================================================ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Next Actions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Next Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {participantType === "manager" && (
              <>
                <ActionLink href={`${basePath}/team`} label="Review team composition" />
                <ActionLink href={`${basePath}/crew`} label="Configure AI crew" />
                <ActionLink href={`${basePath}/rules`} label="Check rules & regulations" />
                <ActionLink href={`${basePath}/governance`} label="Review governance status" />
              </>
            )}
            {participantType === "member" && (
              <>
                <ActionLink href={`${basePath}/projects`} label="Check active projects" />
                <ActionLink href={`${basePath}/collaboration`} label="Join collaboration" />
                <ActionLink href={`${basePath}/knowledge`} label="Browse knowledge base" />
              </>
            )}
            {participantType === "viewer" && (
              <>
                <ActionLink href={`${basePath}/projects`} label="View project status" />
                <ActionLink href={`${basePath}/reports`} label="View reports" />
              </>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activity && (activity as any[]).length > 0 ? (
              <div className="space-y-2">
                {(activity as any[]).slice(0, 5).map((act: any) => (
                  <div key={act.id} className="flex items-start gap-2 text-xs">
                    <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-foreground">{act.action}</span>
                      <div className="text-muted-foreground text-[10px]">
                        {new Date(act.createdAt).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No recent activity</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ================================================================
          TOOL DOMAINS — Module summary cards (SECONDARY)
          ================================================================ */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Available Tools</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {shell.enabledModules.includes("pmt") && (
            <ToolCard
              href={`${basePath}/projects`}
              icon={<FolderKanban className="h-4 w-4" />}
              label="Projects"
              summary={`${summary?.projects ?? 0} projects, ${summary?.tasks ?? 0} tasks`}
            />
          )}
          {shell.enabledModules.includes("knowledge") && (
            <ToolCard
              href={`${basePath}/knowledge`}
              icon={<BookOpen className="h-4 w-4" />}
              label="Knowledge"
              summary={`${summary?.documents ?? 0} documents`}
            />
          )}
          {shell.enabledModules.includes("agents") && (
            <ToolCard
              href={`${basePath}/agents`}
              icon={<Bot className="h-4 w-4" />}
              label="Agents"
              summary={`${summary?.agents ?? 0} runs`}
            />
          )}
          {shell.enabledModules.includes("collaboration") && (
            <ToolCard
              href={`${basePath}/collaboration`}
              icon={<MessageSquare className="h-4 w-4" />}
              label="Collaboration"
              summary={`${summary?.threads ?? 0} threads`}
            />
          )}
          {shell.enabledModules.includes("reporting") && (
            <ToolCard
              href={`${basePath}/reports`}
              icon={<BarChart3 className="h-4 w-4" />}
              label="Reports"
              summary="View dashboard"
            />
          )}
          {shell.enabledModules.includes("kgia") && (
            <ToolCard
              href={`${basePath}/kgia`}
              icon={<Network className="h-4 w-4" />}
              label="Knowledge Graph"
              summary="Query & interpret graphs"
            />
          )}
          <ToolCard
            href={`${basePath}/governance`}
            icon={<Shield className="h-4 w-4" />}
            label="Governance"
            summary="Status & compliance"
          />
        </div>
      </div>
    </div>
  );
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href}>
      <button className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-md hover:bg-accent text-left transition-colors group">
        <ChevronRight className="h-3 w-3 text-primary group-hover:translate-x-0.5 transition-transform" />
        <span>{label}</span>
      </button>
    </Link>
  );
}

function ToolCard({
  href,
  icon,
  label,
  summary,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  summary: string;
}) {
  return (
    <Link href={href}>
      <Card className="cursor-pointer hover:border-primary/40 transition-colors h-full">
        <CardContent className="py-3 px-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-muted-foreground truncate">{summary}</p>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
        </CardContent>
      </Card>
    </Link>
  );
}
