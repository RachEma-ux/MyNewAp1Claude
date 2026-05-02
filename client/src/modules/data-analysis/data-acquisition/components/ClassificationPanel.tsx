/**
 * ClassificationPanel — verdicts produced by the universal classifier.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ClassificationPanel() {
  const classifications =
    trpc.dataAnalysis.dataAcquisition.listClassifications.useQuery({});
  if (classifications.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  const rows = classifications.data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Classifications</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No classifications yet — call <code>classifyItem</code> on an item.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((c: any) => (
              <div key={c.id} className="border rounded p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    Item #{c.itemId} → {c.dataType} / {c.mode}
                  </span>
                  <Badge variant="outline">conf {c.confidence}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  complexity={c.complexity ?? "—"} · processor=
                  {c.recommendedProcessor ?? "—"} · ocr=
                  {String(c.requiresOcr ?? false)} · v={c.classifierVersion}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
