import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, BarChart3, Shield, AlertTriangle } from "lucide-react";

export default function CoverageMapPanel() {
  const { data, isLoading, error } = trpc.governance.gateCoverage.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive text-center py-12">
        Failed to load gate coverage: {error.message}
      </div>
    );
  }

  const coverage = data as any;
  const routers = coverage?.routers || [];
  const summary = coverage?.summary || {};

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Gate Coverage Map</h1>
        <p className="text-muted-foreground mt-2">
          Governance gate enforcement status across all tRPC routers and endpoints
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Total Endpoints
            </CardDescription>
            <CardTitle className="text-2xl">{summary.totalEndpoints ?? routers.length ?? 0}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Governed
            </CardDescription>
            <CardTitle className="text-2xl">{summary.governedCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Ungoverned
            </CardDescription>
            <CardTitle className="text-2xl">{summary.ungovernedCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Coverage</CardDescription>
            <CardTitle className="text-2xl">
              {summary.coveragePercent != null ? `${summary.coveragePercent}%` : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Router Coverage Details
          </CardTitle>
          <CardDescription>
            Per-router governance enforcement status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {routers.length > 0 ? (
            <div className="space-y-3">
              {routers.map((r: any, i: number) => (
                <div key={i} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium font-mono text-sm">{r.router || r.name || `Router #${i + 1}`}</span>
                    <Badge variant={r.governed ? "default" : "destructive"}>
                      {r.governed ? "Governed" : "Ungoverned"}
                    </Badge>
                  </div>
                  {r.endpoints && (
                    <div className="space-y-1 ml-4">
                      {r.endpoints.map((ep: any, j: number) => (
                        <div key={j} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground font-mono text-xs">{ep.name || ep.path}</span>
                          <Badge variant={ep.governed ? "default" : "outline"} className="text-xs">
                            {ep.procedureType || (ep.governed ? "governed" : "public")}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                  {r.mutations != null && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {r.mutations} mutation(s), {r.queries ?? 0} query/queries
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              {typeof coverage === "object" && coverage !== null ? (
                <div className="space-y-2">
                  {Object.entries(coverage).filter(([k]) => k !== "summary" && k !== "routers").map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between py-1 border-b last:border-0">
                      <span className="text-sm font-mono">{key}</span>
                      <span className="text-sm">{typeof value === "object" ? JSON.stringify(value) : String(value)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No coverage data available</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
