import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Terminal, FolderOpen, Loader2, Plus, CheckCircle } from "lucide-react";

export default function PMShellPanel() {
  const [, setLocation] = useLocation();
  const { data: workspaces, isLoading: wsLoading } = trpc.workspaces.list.useQuery();

  const projectWorkspaces = (workspaces || []).filter((w: any) => w.type === "project");
  const defaultShellId = projectWorkspaces[0]?.id;

  const { data: allProjects, isLoading: projLoading } = trpc.modules.pmt.projects.list.useQuery(
    { workspaceId: defaultShellId! },
    { enabled: !!defaultShellId }
  );

  const draftProjects = (allProjects || []).filter((p: any) => p.status === "draft");
  const utils = trpc.useUtils();

  const validateMutation = trpc.modules.pmt.projects.update.useMutation({
    onSuccess: () => {
      utils.modules.pmt.projects.list.invalidate();
    },
  });

  const isLoading = wsLoading || projLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">PM Shell</h1>
          <p className="text-muted-foreground mt-1">
            Draft projects awaiting validation — validate to promote to active
          </p>
        </div>
        {defaultShellId && (
          <Button onClick={() => setLocation(`/project/${defaultShellId}`)}>
            <Plus className="h-4 w-4 mr-1" />
            New Project
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Draft Projects
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : draftProjects.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-muted-foreground">No draft projects. Create a new project to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {draftProjects.map((proj: any) => (
                <div key={proj.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div className="flex items-center gap-3">
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{proj.name}</p>
                      <p className="text-xs text-muted-foreground">{proj.description || `Project #${proj.id}`}</p>
                    </div>
                    <Badge variant="outline" className="text-amber-500 border-amber-500/30">Draft</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setLocation(`/project/${proj.workspaceId}`)}>
                      <Terminal className="h-4 w-4 mr-1" />
                      Open Shell
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => validateMutation.mutate({ id: proj.id, workspaceId: proj.workspaceId, status: "active" })}
                      disabled={validateMutation.isPending}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Validate
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
