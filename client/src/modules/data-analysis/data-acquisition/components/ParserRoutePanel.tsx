/**
 * ParserRoutePanel — routing decisions per item.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ParserRoutePanel() {
  const routes = trpc.dataAnalysis.dataAcquisition.listRoutes.useQuery({});
  if (routes.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  const rows = routes.data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Routing Decisions</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No routing decisions yet — call <code>routeItem</code> after
            classification.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((r: any) => (
              <div key={r.id} className="border rounded p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    Item #{r.itemId} → {r.selectedPipeline} / {r.selectedProcessor}
                  </span>
                  <Badge variant="outline">{r.strategy}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  fallback chain:{" "}
                  {Array.isArray(r.fallbackChainJson) && r.fallbackChainJson.length
                    ? r.fallbackChainJson.join(" → ")
                    : "—"}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
