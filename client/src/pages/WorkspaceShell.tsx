/**
 * WorkspaceShell — Workspace execution container
 *
 * Routes workspace-scoped module pages under /w/:workspaceId/*.
 * Dynamically shows/hides modules based on workspace_modules bindings.
 */

import { useParams, Route, Switch, Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Module page components (lightweight placeholders — each engine gets its own page)
function ModulePage({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      {children || <p className="text-muted-foreground">Module content loading...</p>}
    </div>
  );
}

export default function WorkspaceShell() {
  const params = useParams<{ workspaceId: string; rest?: string }>();
  const workspaceId = parseInt(params.workspaceId || "0", 10);
  const [location] = useLocation();

  const { data: workspace, isLoading: wsLoading } = trpc.workspaces.get.useQuery(
    { id: workspaceId },
    { enabled: workspaceId > 0 }
  );

  const { data: modules, isLoading: modsLoading } = trpc.modules.manage.list.useQuery(
    { workspaceId },
    { enabled: workspaceId > 0 }
  );

  if (wsLoading || modsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!workspace) {
    return <div className="p-6 text-destructive">Workspace not found</div>;
  }

  const enabledModules = new Set(
    (modules || []).filter((m) => m.enabled).map((m) => m.moduleKey)
  );

  const basePath = `/w/${workspaceId}`;

  const navItems = [
    { key: "overview", label: "Overview", path: basePath, always: true },
    { key: "pmt", label: "Projects", path: `${basePath}/projects` },
    { key: "knowledge", label: "Knowledge", path: `${basePath}/knowledge` },
    { key: "agents", label: "Agents", path: `${basePath}/agents` },
    { key: "collaboration", label: "Collaboration", path: `${basePath}/collaboration` },
    { key: "reporting", label: "Reports", path: `${basePath}/reports` },
    { key: "governance", label: "Governance", path: `${basePath}/governance`, always: true },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Workspace header */}
      <div className="border-b px-6 py-3 flex items-center gap-4">
        <h2 className="text-lg font-semibold">{workspace.name}</h2>
        <Badge variant="outline" className="text-xs">
          ID: {workspaceId}
        </Badge>
      </div>

      {/* Module navigation */}
      <div className="border-b px-6 py-2 flex gap-1 overflow-x-auto">
        {navItems
          .filter((item) => item.always || enabledModules.has(item.key))
          .map((item) => {
            const isActive = location === item.path ||
              (item.path !== basePath && location.startsWith(item.path));
            return (
              <Link key={item.key} href={item.path}>
                <Button
                  variant={isActive ? "default" : "ghost"}
                  size="sm"
                  className="text-xs"
                >
                  {item.label}
                </Button>
              </Link>
            );
          })}
      </div>

      {/* Module content area */}
      <div className="flex-1 overflow-auto">
        <Switch>
          <Route path={`${basePath}/projects`}>
            <ModulePage title="Projects">
              <p className="text-muted-foreground">
                Project Management Engine — Create and manage projects, tasks, and dependencies.
              </p>
            </ModulePage>
          </Route>
          <Route path={`${basePath}/tasks/:rest*`}>
            <ModulePage title="Tasks" />
          </Route>
          <Route path={`${basePath}/knowledge`}>
            <ModulePage title="Knowledge Base">
              <p className="text-muted-foreground">
                Knowledge Engine — Documents, decisions, and semantic memory.
              </p>
            </ModulePage>
          </Route>
          <Route path={`${basePath}/agents`}>
            <ModulePage title="Agent Orchestration">
              <p className="text-muted-foreground">
                Agent Orchestration Engine — Manage workspace agents and runs.
              </p>
            </ModulePage>
          </Route>
          <Route path={`${basePath}/collaboration`}>
            <ModulePage title="Collaboration">
              <p className="text-muted-foreground">
                Collaboration Engine — Threads, discussions, and approvals.
              </p>
            </ModulePage>
          </Route>
          <Route path={`${basePath}/reports`}>
            <ModulePage title="Reports">
              <p className="text-muted-foreground">
                Reporting Engine — Velocity, agent reliability, and risk heatmaps.
              </p>
            </ModulePage>
          </Route>
          <Route path={`${basePath}/governance`}>
            <ModulePage title="Governance">
              <p className="text-muted-foreground">
                Workspace governance controls and audit trail.
              </p>
            </ModulePage>
          </Route>
          <Route>
            {/* Overview / default */}
            <div className="p-6 space-y-6">
              <h1 className="text-2xl font-bold">Workspace Overview</h1>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {navItems
                  .filter((item) => !item.always && enabledModules.has(item.key))
                  .map((item) => (
                    <Link key={item.key} href={item.path}>
                      <Card className="cursor-pointer hover:border-primary transition-colors">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">{item.label}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">
                            Open {item.label.toLowerCase()} module
                          </p>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
              </div>
              {enabledModules.size === 0 && (
                <p className="text-muted-foreground">
                  No modules enabled. Configure modules in workspace settings.
                </p>
              )}
            </div>
          </Route>
        </Switch>
      </div>
    </div>
  );
}
