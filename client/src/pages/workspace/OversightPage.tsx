/**
 * OversightPage — Manager Controls rendered inline in main content area
 *
 * Same content as WorkspaceManagerControls drawer, but displayed as a page.
 */

import { Link, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Settings,
  Eye,
  Shield,
  Users,
  Bot,
  Layers,
  Activity,
  Target,
  Wrench,
} from "lucide-react";

export function OversightPage({ workspaceId }: { workspaceId: number }) {
  const basePath = `/w/${workspaceId}`;

  const { data: shellView } = trpc.workspaces.shell.view.useQuery(
    { workspaceId },
    { enabled: workspaceId > 0, staleTime: 30000 }
  );

  const shell = shellView as any;
  if (!shell) {
    return (
      <div className="p-6 text-center text-muted-foreground">Loading oversight data...</div>
    );
  }

  if (!shell.isManager) {
    return (
      <div className="p-6 text-center">
        <Shield className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
        <p className="text-lg font-medium">Manager Access Required</p>
        <p className="text-sm text-muted-foreground mt-1">
          Only workspace managers can view oversight controls.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wrench className="h-6 w-6 text-orange-600" />
          Manager Oversight
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure workspace and manage participant visibility
        </p>
      </div>

      {/* ─── Configuration Section ─── */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Configuration
        </h2>
        <div className="space-y-2">
          <ManagerLink
            href={`${basePath}/settings`}
            icon={<Settings className="h-4 w-4" />}
            label="Workspace Settings"
            description="Name, description, type, embedding config"
          />
          <ManagerLink
            href={`${basePath}/team`}
            icon={<Users className="h-4 w-4" />}
            label="Team Management"
            description={`${shell.teamCount} member${shell.teamCount !== 1 ? "s" : ""}`}
          />
          <ManagerLink
            href={`${basePath}/crew`}
            icon={<Bot className="h-4 w-4" />}
            label="AI Crew Management"
            description={`${shell.crewCount} agent${shell.crewCount !== 1 ? "s" : ""}`}
          />
          <ManagerLink
            href={`${basePath}/rules`}
            icon={<Shield className="h-4 w-4" />}
            label="Rules & Regulations"
            description="Governance rules and constraints"
          />
          <ManagerLink
            href={`${basePath}/governance`}
            icon={<Shield className="h-4 w-4" />}
            label="Governance Dashboard"
            description="Health checks and compliance"
          />
        </div>
      </div>

      <Separator />

      {/* ─── Visibility Layer Section ─── */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Eye className="h-4 w-4" />
          Visibility Layer
        </h2>
        <p className="text-xs text-muted-foreground">
          Shape what participants see, in what order, with what emphasis.
        </p>
        <Card className="bg-muted/30">
          <CardContent className="py-3 px-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Toolbar items visible</span>
              <Badge variant="secondary" className="text-[10px]">
                {shell.toolbar?.visibleItems?.length ?? 0}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Priority items</span>
              <Badge variant="secondary" className="text-[10px]">
                {shell.toolbar?.priorityItems?.length ?? 0}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Alerts enabled</span>
              <Badge variant={shell.alertsEnabled ? "default" : "secondary"} className="text-[10px]">
                {shell.alertsEnabled ? "Yes" : "No"}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Mission emphasis</span>
              <Badge variant={shell.missionEmphasis ? "default" : "secondary"} className="text-[10px]">
                {shell.missionEmphasis ? "Set" : "Not set"}
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Link href={`${basePath}/visibility`}>
          <Button variant="outline" size="sm" className="w-full text-xs gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            Edit Visibility Configuration
          </Button>
        </Link>
      </div>

      <Separator />

      {/* ─── Quick Manager Actions ─── */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Quick Actions
        </h2>
        <ManagerLink
          href={`${basePath}/projects/settings`}
          icon={<Target className="h-4 w-4" />}
          label="Module Configuration"
          description="Enable/disable workspace modules"
        />
      </div>

      <Separator />

      {/* ─── Workspace Info ─── */}
      <div className="space-y-1 text-xs text-muted-foreground">
        <div className="flex justify-between">
          <span>Workspace ID</span>
          <span className="font-mono">WS-{shell.workspaceId}</span>
        </div>
        <div className="flex justify-between">
          <span>Status</span>
          <span className="capitalize">{shell.status?.replace(/_/g, " ")}</span>
        </div>
        <div className="flex justify-between">
          <span>Your Role</span>
          <span>{shell.participantRole || "owner"}</span>
        </div>
        <div className="flex justify-between">
          <span>Capabilities</span>
          <span>{shell.capabilities?.length ?? 0} granted</span>
        </div>
      </div>
    </div>
  );
}

function ManagerLink({
  href,
  icon,
  label,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  description: string;
}) {
  return (
    <Link href={href}>
      <button className="flex items-start gap-3 w-full px-3 py-2.5 text-left rounded-md hover:bg-accent transition-colors">
        <div className="mt-0.5 shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </button>
    </Link>
  );
}
