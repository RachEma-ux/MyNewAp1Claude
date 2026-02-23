import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, FolderOpen, Users } from "lucide-react";

export default function WorkspaceDirectoryPanel() {
  const { data, isLoading, error } = trpc.hq.workspaceDirectory.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive text-center py-12">
        Failed to load workspaces: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Workspace Directory</h1>
        <p className="text-muted-foreground mt-1">
          All workspaces accessible to you
        </p>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <Badge variant="outline">{data?.total ?? 0} workspaces</Badge>
      </div>

      {data?.workspaces && data.workspaces.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.workspaces.map((ws: any) => (
            <Card key={ws.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{ws.name}</CardTitle>
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">
                  {ws.description || "No description"}
                </p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" />
                  <span>{ws.memberCount} member{ws.memberCount !== 1 ? "s" : ""}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No workspaces found</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
