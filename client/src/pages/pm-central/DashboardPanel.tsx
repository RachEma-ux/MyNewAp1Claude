import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { LayoutDashboard, FolderOpen, Users, Activity, Terminal, Loader2 } from "lucide-react";

export default function DashboardPanel() {
  const [, setLocation] = useLocation();
  const { data: workspaces, isLoading: wsLoading } = trpc.workspaces.list.useQuery();

  const projectWorkspaces = (workspaces || []).filter((w: any) => w.type === "project");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">PM Central Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Project management overview — projects, milestones, and team activity
          </p>
        </div>
        {projectWorkspaces.length === 1 && (
          <Button onClick={() => setLocation(`/project/${projectWorkspaces[0].id}`)}>
            <Terminal className="h-4 w-4 mr-2" />
            Open Shell
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projectWorkspaces.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Project workspaces</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Team Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground mt-1">Assigned</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Milestones</CardTitle>
            <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground mt-1">Upcoming</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Activity</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground mt-1">Events today</p>
          </CardContent>
        </Card>
      </div>

      {/* Project Shells */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Project Shells
          </CardTitle>
        </CardHeader>
        <CardContent>
          {wsLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : projectWorkspaces.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-muted-foreground mb-3">No project workspaces yet.</p>
              <Button variant="outline" onClick={() => setLocation("/workspaces")}>
                Create a Project Workspace
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {projectWorkspaces.map((ws: any) => (
                <div key={ws.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div className="flex items-center gap-3">
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{ws.name}</p>
                      <p className="text-xs text-muted-foreground">ID: {ws.id}</p>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => setLocation(`/project/${ws.id}`)}>
                    <Terminal className="h-4 w-4 mr-1" />
                    Open Shell
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
