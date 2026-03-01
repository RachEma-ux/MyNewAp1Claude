import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { FolderOpen, Plus, FileStack, Sparkles, Terminal, Loader2 } from "lucide-react";

export default function ProjectsPanel() {
  const [, setLocation] = useLocation();
  const { data: workspaces, isLoading: wsLoading } = trpc.workspaces.list.useQuery();

  const projectWorkspaces = (workspaces || []).filter((w: any) => w.type === "project");
  const workspaceId = projectWorkspaces[0]?.id;

  const { data: allProjects, isLoading: projLoading } = trpc.modules.pmt.projects.list.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId }
  );

  const activeProjects = (allProjects || []).filter((p: any) => p.status === "active");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
        <p className="text-muted-foreground mt-1">
          Create, manage, and track project portfolios
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setLocation("/pm-central/shell")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Project</CardTitle>
            <Plus className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Create a new project and open the PM Shell directly to start managing tasks.
            </p>
            <Button size="sm" className="mt-3">
              <Plus className="h-4 w-4 mr-1" />
              Create Project
            </Button>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setLocation("/pm-central/templates")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Templates</CardTitle>
            <FileStack className="h-5 w-5 text-blue-400" />
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Start from a PM template — PM², Scrum, Kanban, PRINCE2, Waterfall, and more.
            </p>
            <Button size="sm" variant="outline" className="mt-3">
              <FileStack className="h-4 w-4 mr-1" />
              Browse Templates
            </Button>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setLocation("/pm-central/examples")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Examples</CardTitle>
            <Sparkles className="h-5 w-5 text-amber-400" />
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Explore pre-built example projects to learn best practices and get inspired.
            </p>
            <Button size="sm" variant="outline" className="mt-3">
              <Sparkles className="h-4 w-4 mr-1" />
              View Examples
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {wsLoading || projLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !workspaceId ? (
            <p className="text-muted-foreground">No project workspace found. Create one first.</p>
          ) : activeProjects.length === 0 ? (
            <p className="text-muted-foreground">No active projects yet. Create a project and validate it in PM Shell to see it here.</p>
          ) : (
            <div className="space-y-2">
              {activeProjects.map((proj: any) => (
                <div key={proj.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div className="flex items-center gap-3">
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{proj.name}</p>
                      <p className="text-xs text-muted-foreground">{proj.description || `Project #${proj.id}`}</p>
                    </div>
                    <Badge variant="outline" className="text-green-500 border-green-500/30">Active</Badge>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setLocation(`/project/${proj.workspaceId}`)}>
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
