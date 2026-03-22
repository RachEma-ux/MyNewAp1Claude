import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";

export default function BaselinesPanel({ projectId }: { projectId: number }) {
  const artifactsQuery = trpc.modules.pmt.shell.artifacts.list.useQuery({ projectId });
  const artifacts = artifactsQuery.data ?? [];


  // Baselines are versioned artifact snapshots
  const baselines = artifacts.filter((a: any) => a.sha256);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Baselines</h2>
      <p className="text-sm text-muted-foreground">Locked artifact versions with integrity hashes — immutable snapshots for audit</p>

      {baselines.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Lock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No baselines locked yet. Create artifacts with SHA-256 hashes to establish baselines.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {baselines.map((a: any) => (
            <Card key={a.id}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                      {a.name}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Hash className="h-3 w-3" />v{a.version}</span>
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(a.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="capitalize text-[10px]">{a.artifactType?.replace(/_/g, " ") || "document"}</Badge>
                </div>
                {a.sha256 && (
                  <code className="block mt-2 text-[10px] font-mono text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                    SHA-256: {a.sha256}
                  </code>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
