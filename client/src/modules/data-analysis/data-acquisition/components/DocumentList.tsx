/**
 * DocumentList — items whose `itemType === "document"`.
 *
 * Filters the universal item list to documents only — the Document
 * Intelligence page consumes this. Other modes have their own
 * specialized panels (sensors, streams, etc.).
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function DocumentList() {
  const items = trpc.dataAnalysis.dataAcquisition.listItems.useQuery({});
  if (items.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  const docs = (items.data ?? []).filter(
    (it: any) => it.itemType === "document",
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
      </CardHeader>
      <CardContent>
        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No documents discovered yet.
          </p>
        ) : (
          <div className="space-y-1">
            {docs.map((it: any) => (
              <div
                key={it.id}
                className="flex items-center justify-between border rounded p-2 text-sm"
              >
                <span>
                  #{it.id} · {it.sourceUri}
                </span>
                <Badge
                  variant={it.status === "processed" ? "default" : "secondary"}
                >
                  {it.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
