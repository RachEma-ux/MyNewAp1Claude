/**
 * CanonicalRecordViewer — list + JSON viewer for canonical records.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function CanonicalRecordViewer() {
  const records =
    trpc.dataAnalysis.dataAcquisition.listCanonicalRecords.useQuery({});
  const [selected, setSelected] = useState<number | null>(null);
  if (records.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  const rows = records.data ?? [];
  const sel = selected !== null ? rows.find((r: any) => r.id === selected) : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Canonical Records</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No canonical records yet.
          </p>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {rows.map((r: any) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r.id)}
                  className={`flex items-center justify-between border rounded p-2 text-sm w-full text-left ${
                    selected === r.id ? "bg-accent" : ""
                  }`}
                >
                  <span>
                    #{r.id} · {r.recordType}
                  </span>
                  <Badge variant="outline">v{r.canonicalVersion}</Badge>
                </button>
              ))}
            </div>
            <div className="border rounded p-3 max-h-96 overflow-auto">
              {sel ? (
                <pre className="text-xs">
                  {JSON.stringify((sel as any).canonicalJson ?? sel, null, 2)}
                </pre>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Select a record to view its canonical JSON.
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
