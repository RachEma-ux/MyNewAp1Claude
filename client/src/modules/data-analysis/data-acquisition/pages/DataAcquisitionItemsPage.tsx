/**
 * DataAcquisitionItemsPage — universal item view (all modes, not
 * just documents).
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function DataAcquisitionItemsPage() {
  const items = trpc.dataAnalysis.dataAcquisition.listItems.useQuery({});
  const rows = items.data ?? [];
  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Data Acquisition · Items
        </h1>
        <p className="text-muted-foreground mt-1 max-w-3xl">
          Items from every mode — documents, sensor readings, stream events,
          API records, DB rows, media, web pages, git objects, form
          submissions, webhook deliveries.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>All Items</CardTitle>
        </CardHeader>
        <CardContent>
          {items.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No items ingested yet.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((r: any) => (
                <div key={r.id} className="border rounded p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      #{r.id} · {r.itemType ?? "—"}
                      {r.title ? ` · ${r.title}` : ""}
                    </span>
                    <Badge variant="outline">{r.status ?? "new"}</Badge>
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
