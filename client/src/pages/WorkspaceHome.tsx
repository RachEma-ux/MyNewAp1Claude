/**
 * WorkspaceHome — Operational Dashboard
 *
 * Operational workspace dashboard control center showing:
 * 1. Workspace summary (purpose, status, owner, enabled modules)
 * 2. Activity log (recent workspace actions)
 * 3. Access (member count, roles)
 * 4. Configuration (routing profile, module state)
 * 5. Alerts (archived state, disabled modules)
 * 6. Quick actions (open module, manage members, view governance)
 */

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  FolderOpen,
  Users,
  Activity,
  Settings,
  ShieldCheck,
  AlertTriangle,
  Route,
  Bot,
  BookOpen,
  FolderKanban,
  MessageSquare,
  BarChart3,
  ExternalLink,
} from "lucide-react";
import { useLocation, useParams, Link } from "wouter";

const MODULE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  pmt: { label: "Project Management", icon: <FolderKanban className="h-4 w-4" /> },
  knowledge: { label: "Knowledge", icon: <BookOpen className="h-4 w-4" /> },
  agents: { label: "Agents", icon: <Bot className="h-4 w-4" /> },
  collaboration: { label: "Collaboration", icon: <MessageSquare className="h-4 w-4" /> },
  reporting: { label: "Reporting", icon: <BarChart3 className="h-4 w-4" /> },
};

const STATUS_COLORS: Record<string, string> = {
  created: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  configured: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  active: "bg-green-500/10 text-green-500 border-green-500/20",
  paused: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  archived: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  deleted: "bg-red-500/10 text-red-500 border-red-500/20",
};

export default function WorkspaceHome() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const workspaceId = id ? parseInt(id) : 0;

  const { data: workspace, isLoading } = trpc.workspaces.get.useQuery(
    { id: workspaceId },
    { enabled: workspaceId > 0 }
  );

  const { data: modules } = trpc.workspaces.getModules.useQuery(
    { workspaceId },
    { enabled: workspaceId > 0, retry: 1 }
  );

  const { data: members } = trpc.workspaces.getMembers.useQuery(
    { workspaceId },
    { enabled: workspaceId > 0, retry: 1 }
  );

  const { data: activity } = trpc.workspaces.getActivity.useQuery(
    { workspaceId, limit: 10 },
    { enabled: workspaceId > 0, retry: 1 }
  );

  if (!isLoading && !workspace) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold mb-2">Workspace not found</h2>
        <Button onClick={() => setLocation("/workspaces")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Workspaces
        </Button>
      </div>
    );
  }

  const wsStatus = (workspace as any)?.status || "active";
  const wsPurpose = (workspace as any)?.purposeType || "other";
  const enabledModules = (modules as any[] || []).filter((m: any) => m.enabled);
  const disabledModules = (modules as any[] || []).filter((m: any) => !m.enabled);
  const routingProfile = (workspace as any)?.routingProfile;
  const memberCount = (members as any[] || []).length;
  const isArchived = wsStatus === "archived";
  const isPaused = wsStatus === "paused";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/workspaces")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <FolderOpen className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">{workspace?.name || "Workspace"}</h1>
              <Badge variant="outline" className={STATUS_COLORS[wsStatus] || ""}>
                {wsStatus}
              </Badge>
            </div>
            {workspace?.description && (
              <p className="text-muted-foreground mt-1">{workspace?.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Alerts */}
      {(isArchived || isPaused || disabledModules.length > 0) && (
        <div className="space-y-2">
          {isArchived && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-sm">
              <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
              <span>This workspace is <strong>archived</strong>. It is read-only — mutating operations are blocked.</span>
            </div>
          )}
          {isPaused && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm">
              <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
              <span>This workspace is <strong>paused</strong>. Only read operations are allowed.</span>
            </div>
          )}
          {disabledModules.length > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted border text-sm">
              <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>
                {disabledModules.length} module{disabledModules.length > 1 ? "s" : ""} disabled:{" "}
                {disabledModules.map((m: any) => MODULE_LABELS[m.moduleKey]?.label || m.moduleKey).join(", ")}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Summary + Access Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Workspace Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Purpose</span>
              <Badge variant="outline" className="capitalize">{wsPurpose}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span className="capitalize">{workspace?.type || "generic"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="outline" className={STATUS_COLORS[wsStatus] || ""}>{wsStatus}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Modules</span>
              <span>{enabledModules.length} / {(modules as any[] || []).length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{workspace?.createdAt ? new Date(workspace.createdAt).toLocaleDateString() : "—"}</span>
            </div>
          </CardContent>
        </Card>

        {/* Access */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Access
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Members</span>
              <span>{memberCount}</span>
            </div>
            {(members as any[] || []).slice(0, 5).map((m: any, i: number) => (
              <div key={i} className="flex justify-between">
                <span className="text-muted-foreground">User {m.userId}</span>
                <Badge variant="outline" className="capitalize text-xs">{m.role}</Badge>
              </div>
            ))}
            {memberCount > 5 && (
              <p className="text-xs text-muted-foreground">+{memberCount - 5} more</p>
            )}
          </CardContent>
        </Card>

        {/* Configuration */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Route className="h-4 w-4" />
              Routing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {routingProfile ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Route</span>
                  <span>{routingProfile.defaultRoute}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Quality</span>
                  <span>{routingProfile.qualityTier}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sensitivity</span>
                  <span>{routingProfile.dataSensitivity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fallback</span>
                  <span>{routingProfile.fallback?.enabled ? "On" : "Off"}</span>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">Default routing (AUTO)</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modules */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Enabled Modules</CardTitle>
          <CardDescription>Active platform engines for this workspace</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {enabledModules.map((m: any) => {
              const info = MODULE_LABELS[m.moduleKey];
              return (
                <Link key={m.moduleKey} href={`/w/${workspaceId}/${m.moduleKey === "pmt" ? "projects" : m.moduleKey === "agents" ? "agents" : m.moduleKey === "collaboration" ? "collaboration" : m.moduleKey === "reporting" ? "reports" : "knowledge"}`}>
                  <Badge variant="secondary" className="cursor-pointer hover:bg-accent gap-1 py-1.5 px-3">
                    {info?.icon}
                    {info?.label || m.moduleKey}
                  </Badge>
                </Link>
              );
            })}
            {enabledModules.length === 0 && (
              <p className="text-sm text-muted-foreground">No modules enabled</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Activity Log */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Recent Activity
          </CardTitle>
          <CardDescription>Latest workspace actions</CardDescription>
        </CardHeader>
        <CardContent>
          {(activity as any[] || []).length > 0 ? (
            <div className="space-y-2">
              {(activity as any[]).map((a: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs font-mono">{a.action}</Badge>
                    {a.moduleKey && <span className="text-xs text-muted-foreground">{a.moduleKey}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">No activity recorded yet</p>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setLocation(`/w/${workspaceId}`)}>
              <ExternalLink className="h-4 w-4 mr-1" /> Open Workspace Shell
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLocation(`/workspaces/${workspaceId}`)}>
              <Settings className="h-4 w-4 mr-1" /> Settings
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLocation(`/w/${workspaceId}/governance`)}>
              <ShieldCheck className="h-4 w-4 mr-1" /> Governance
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
