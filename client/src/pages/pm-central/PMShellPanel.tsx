import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Terminal, FolderOpen, Loader2 } from "lucide-react";

export default function PMShellPanel() {
  const [, setLocation] = useLocation();
  const { data: workspaces, isLoading } = trpc.workspaces.list.useQuery();

  const projectWorkspaces = (workspaces || []).filter((w: any) => w.type === "project");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">PM Shell</h1>
        <p className="text-muted-foreground mt-1">
          Open a project workspace shell to manage tasks, timelines, and deliverables
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Project Shells
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
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
