/**
 * Data Acquisition — dashboard summary cards.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DataAcquisitionSummaryCards() {
  const summary =
    trpc.dataAnalysis.dataAcquisition.summary.useQuery(undefined);

  if (summary.isLoading || !summary.data) {
    return <p className="text-sm text-muted-foreground">Loading summary…</p>;
  }
  const s = summary.data as any;

  const tiles: Array<{ label: string; value: string | number }> = [
    { label: "Sources", value: s.sources?.registered ?? 0 },
    { label: "Active sources", value: s.sources?.active ?? 0 },
    { label: "Acquisition runs", value: s.runs?.total ?? 0 },
    { label: "Items discovered", value: s.items?.total ?? 0 },
    { label: "Items processed", value: s.items?.processed ?? 0 },
    { label: "Failed processing", value: s.processing?.failed ?? 0 },
    { label: "Avg confidence", value: s.processing?.averageConfidence ?? 0 },
    { label: "Canonical records", value: s.canonicalRecords?.total ?? 0 },
    { label: "Output runs", value: s.outputs?.total ?? 0 },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {tiles.map((t) => (
        <Card key={t.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium">
              {t.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{t.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
