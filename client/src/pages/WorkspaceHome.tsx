import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, FolderOpen, Loader2, Construction } from "lucide-react";
import { useLocation, useParams } from "wouter";

export default function WorkspaceHome() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { data: workspace, isLoading } = trpc.workspaces.get.useQuery(
    { id: parseInt(id!) },
    { enabled: !!id }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/workspaces")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <FolderOpen className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{workspace?.name || "Workspace"}</h1>
            {workspace?.description && (
              <p className="text-muted-foreground mt-1">{workspace.description}</p>
            )}
          </div>
        </div>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-accent">
            <Construction className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-semibold mb-2">Coming Soon</h2>
          <p className="text-muted-foreground max-w-md">
            The workspace dashboard is under development. Soon you'll be able to manage documents, chat with your data, and run agents — all from here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
