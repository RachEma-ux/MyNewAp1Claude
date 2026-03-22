/**
 * WorkspaceManagerControls — Manager-only control/visibility layer (NEW SHELL)
 *
 * This layer is clearly separated from normal participant view.
 * Only renders for managers/admins.
 *
 * Exposes:
 *   - Configuration panel
 *   - Visibility Layer management
 *   - Quick manager actions
 */

import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  AlertTriangle,
} from "lucide-react";
import type { ShellViewData } from "./types";

interface ManagerControlsProps {
  shell: ShellViewData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  basePath: string;
}

export function WorkspaceManagerControls({
  shell,
  open,
  onOpenChange,
  basePath,
}: ManagerControlsProps) {
  if (!shell.isManager) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[380px] sm:max-w-[380px] p-0">
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-orange-600" />
            Manager Controls
          </SheetTitle>
          <SheetDescription>
            Configure workspace and manage participant visibility
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 h-[calc(100vh-100px)]">
          <div className="px-4 py-4 space-y-4">
            {/* ─── Configuration Section ─── */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Configuration
              </h3>
              <div className="space-y-1.5">
                <ManagerLink
                  href={`${basePath}/settings`}
                  icon={<Settings className="h-3.5 w-3.5" />}
                  label="Workspace Settings"
                  description="Name, description, type, embedding config"
                />
                <ManagerLink
                  href={`${basePath}/team`}
                  icon={<Users className="h-3.5 w-3.5" />}
                  label="Team Management"
                  description={`${shell.teamCount} member${shell.teamCount !== 1 ? "s" : ""}`}
                />
                <ManagerLink
                  href={`${basePath}/crew`}
                  icon={<Bot className="h-3.5 w-3.5" />}
                  label="AI Crew Management"
                  description={`${shell.crewCount} agent${shell.crewCount !== 1 ? "s" : ""}`}
                />
                <ManagerLink
                  href={`${basePath}/rules`}
                  icon={<Shield className="h-3.5 w-3.5" />}
                  label="Rules & Regulations"
                  description="Governance rules and constraints"
                />
                <ManagerLink
                  href={`${basePath}/governance`}
                  icon={<Shield className="h-3.5 w-3.5" />}
                  label="Governance Dashboard"
                  description="Health checks and compliance"
                />
              </div>
            </div>

            <Separator />

            {/* ─── Visibility Layer Section ─── */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Visibility Layer
              </h3>
              <p className="text-xs text-muted-foreground">
                Shape what participants see, in what order, with what emphasis.
              </p>
              <div className="space-y-2">
                {/* Current visibility config summary */}
                <Card className="bg-muted/30">
                  <CardContent className="py-3 px-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Toolbar items visible</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {shell.toolbar.visibleItems.length}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Priority items</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {shell.toolbar.priorityItems.length}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Alerts enabled</span>
                      <Badge
                        variant={shell.alertsEnabled ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {shell.alertsEnabled ? "Yes" : "No"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Mission emphasis</span>
                      <Badge
                        variant={shell.missionEmphasis ? "default" : "secondary"}
                        className="text-[10px]"
                      >
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
            </div>

            <Separator />

            {/* ─── Quick Manager Actions ─── */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Quick Actions
              </h3>
              <div className="space-y-1.5">
                <ManagerLink
                  href={`${basePath}/projects/settings`}
                  icon={<Target className="h-3.5 w-3.5" />}
                  label="Module Configuration"
                  description="Enable/disable workspace modules"
                />
              </div>
            </div>

            {/* Workspace status info */}
            <Separator />
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Workspace ID</span>
                <span className="font-mono">WS-{shell.workspaceId}</span>
              </div>
              <div className="flex justify-between">
                <span>Status</span>
                <span className="capitalize">{shell.status.replace(/_/g, " ")}</span>
              </div>
              <div className="flex justify-between">
                <span>Your Role</span>
                <span>{shell.participantRole || "owner"}</span>
              </div>
              <div className="flex justify-between">
                <span>Capabilities</span>
                <span>{shell.capabilities.length} granted</span>
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
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
      <button className="flex items-start gap-2.5 w-full px-2 py-2 text-left rounded-md hover:bg-accent transition-colors">
        <div className="mt-0.5 shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="text-xs font-medium">{label}</p>
          <p className="text-[10px] text-muted-foreground">{description}</p>
        </div>
      </button>
    </Link>
  );
}
