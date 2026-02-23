import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, ShieldAlert, Snowflake } from "lucide-react";

export default function IncidentsPanel() {
  const { data, isLoading, error } = trpc.hq.incidents.useQuery();

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
        Failed to load incidents: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Incidents</h1>
        <p className="text-muted-foreground mt-1">
          Governance incidents and frozen subjects
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Incidents</CardTitle>
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.openIncidents ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Frozen Subjects</CardTitle>
            <Snowflake className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.frozenCount ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Drift Detection</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={data?.driftActive ? "default" : "secondary"}>
              {data?.driftActive ? "Active" : "Inactive"}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Frozen Subjects</CardTitle>
        </CardHeader>
        <CardContent>
          {(data?.frozenSubjects ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">No frozen subjects</p>
          ) : (
            <div className="space-y-3">
              {data!.frozenSubjects.map((f: any, i: number) => (
                <div
                  key={f.subjectId ?? i}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <Snowflake className="h-4 w-4 text-blue-400" />
                    <span className="font-medium">
                      {f.subjectType}:{f.subjectId}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {f.reason || "Governance freeze"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {(data?.driftViolations ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Drift Violations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data!.driftViolations.map((v: string, i: number) => (
                <div key={i} className="text-sm py-1 border-b last:border-0">
                  {v}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
