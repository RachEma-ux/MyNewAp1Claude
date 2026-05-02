/**
 * CanonicalDocumentViewer — view the CanonicalDocumentModel for a
 * specific item id.
 *
 * Calls `dataAnalysis.dataAcquisition.document.getCanonical`. Renders
 * sections with their tables/figures so operators can audit the parser
 * output. Shows the standard Phase-1 "no canonical yet" empty state
 * when the document hasn't been validated.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function CanonicalDocumentViewer() {
  const [itemId, setItemId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const canonical =
    trpc.dataAnalysis.dataAcquisition.document.getCanonical.useQuery(
      { itemId: itemId ?? -1 },
      { enabled: itemId !== null && itemId > 0 },
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Canonical Document Viewer</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2 items-center">
          <Input
            placeholder="item id"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            type="number"
            className="w-32"
          />
          <Button
            type="button"
            onClick={() => {
              const n = Number(draft);
              setItemId(Number.isFinite(n) && n > 0 ? n : null);
            }}
          >
            Load
          </Button>
        </div>
        {itemId === null ? (
          <p className="text-xs text-muted-foreground">
            Enter an item id to view its CanonicalDocumentModel.
          </p>
        ) : canonical.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !canonical.data?.canonical ? (
          <p className="text-xs text-muted-foreground">
            No canonical document yet — validation hasn't run for item #{itemId}.
          </p>
        ) : (
          <pre className="text-xs overflow-auto max-h-96 border rounded p-3">
            {JSON.stringify(canonical.data.canonical, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
