/**
 * SourceList — registered Data Acquisition sources.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function SourceList() {
  const sources = trpc.dataAnalysis.dataAcquisition.listSources.useQuery({});
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sources</CardTitle>
      </CardHeader>
      <CardContent>
        {sources.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : sources.data && sources.data.length > 0 ? (
          <div className="space-y-2">
            {sources.data.map((src: any) => (
              <div
                key={src.id}
                className="flex items-center justify-between border rounded p-3"
              >
                <div>
                  <p className="font-medium">{src.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    {src.sourceType} · {src.sourceUri}
                  </p>
                </div>
                <Badge
                  variant={src.status === "active" ? "default" : "secondary"}
                >
                  {src.status}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No sources registered yet. Use the public-API to register one.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
