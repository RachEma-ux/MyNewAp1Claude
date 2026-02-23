import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Archive, FileCheck } from "lucide-react";

export default function EvidenceVaultPanel() {
  const { data, isLoading, error } = trpc.governance.scorecardHistory.useQuery();

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading evidence vault...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <Archive className="w-12 h-12 mx-auto text-destructive mb-4" />
            <p className="text-destructive">Failed to load evidence vault: {error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const history = Array.isArray(data) ? data : [];

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Evidence Vault</h1>
        <p className="text-muted-foreground mt-2">
          Scorecard history and evidence artifact records — {history.length} entries
        </p>
      </div>

      {history.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Archive className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No evidence records yet. Run a scorecard to generate evidence.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {history.map((entry: any, i: number) => {
            const score = entry.scorecard?.score ?? entry.score ?? null;
            const gateStatus = entry.scorecard?.gateStatus?.status ?? entry.gateStatus ?? "unknown";
            const bundleId = entry.evidence?.bundleId ?? entry.bundleId ?? null;
            const ts = entry.timestamp ?? entry.createdAt;

            return (
              <Card key={i}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <FileCheck className="w-4 h-4" />
                        {entry.stage ?? "Scorecard"} — Run #{history.length - i}
                      </CardTitle>
                      <CardDescription>
                        {ts ? new Date(ts).toLocaleString() : "Unknown date"}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {score != null && (
                        <Badge variant={score >= 80 ? "default" : score >= 50 ? "outline" : "destructive"}>
                          Score: {score}
                        </Badge>
                      )}
                      <Badge variant={gateStatus === "PASS" ? "default" : gateStatus === "FAIL" ? "destructive" : "secondary"}>
                        {gateStatus}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {bundleId && (
                      <span className="font-mono text-xs">Bundle: {bundleId}</span>
                    )}
                    {entry.evidence?.integrityHash && (
                      <Badge variant="outline" className="text-xs">
                        Integrity: verified
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
