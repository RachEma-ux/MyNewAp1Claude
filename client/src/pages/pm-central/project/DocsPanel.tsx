import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, FolderOpen } from "lucide-react";

export default function DocsPanel({ projectId }: { projectId: number }) {
  const query = trpc.modules.pmt.shell.artifacts.list.useQuery({ projectId });
  const artifacts = query.data ?? [];

  if (query.isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Docs Hub</h2>
      <p className="text-sm text-muted-foreground">Specs, meeting notes, evidence, and project artifacts</p>
      {artifacts.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No documents yet. Artifacts created through the governance pipeline appear here.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {artifacts.map((a: any) => (
            <Card key={a.id}>
              <CardContent className="py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{a.name}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                    <span className="capitalize">{a.artifactType.replace("_", " ")}</span>
                    <span>v{a.version}</span>
                    <span>{new Date(a.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono">{a.sha256?.slice(0, 8)}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
