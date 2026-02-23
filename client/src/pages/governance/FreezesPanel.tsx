import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, Snowflake, Shield } from "lucide-react";

export default function FreezesPanel() {
  const { data: frozen, isLoading: frozenLoading } = trpc.governance.frozenSubjects.useQuery();
  const { data: drift, isLoading: driftLoading } = trpc.governance.driftStatus.useQuery();

  const isLoading = frozenLoading || driftLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const frozenList = Array.isArray(frozen) ? frozen : [];
  const systemFrozenCount = drift?.frozenCount ?? frozenList.length;

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Freeze Management</h1>
        <p className="text-muted-foreground mt-2">
          View and manage frozen subjects and system-wide freeze status
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              System Freeze
            </CardDescription>
            <CardTitle className="text-2xl">
              {frozenList.some((f: any) => (f.subjectId ?? f.id) === 0) ? "ACTIVE" : "Inactive"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={frozenList.some((f: any) => (f.subjectId ?? f.id) === 0) ? "destructive" : "default"}>
              {frozenList.some((f: any) => (f.subjectId ?? f.id) === 0) ? "All mutations blocked" : "System operational"}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <Snowflake className="w-4 h-4" />
              Frozen Subjects
            </CardDescription>
            <CardTitle className="text-2xl">{systemFrozenCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {systemFrozenCount === 0 ? "No subjects frozen" : `${systemFrozenCount} subject(s) with blocked transitions`}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Snowflake className="w-5 h-5" />
            Frozen Subjects List
          </CardTitle>
        </CardHeader>
        <CardContent>
          {frozenList.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium">Subject ID</th>
                    <th className="text-left py-2 px-3 font-medium">Reason</th>
                    <th className="text-left py-2 px-3 font-medium">Frozen At</th>
                    <th className="text-left py-2 px-3 font-medium">Frozen By</th>
                  </tr>
                </thead>
                <tbody>
                  {frozenList.map((f: any, i: number) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 px-3 font-mono">
                        {(f.subjectId ?? f.id) === 0 ? (
                          <Badge variant="destructive">SYSTEM (0)</Badge>
                        ) : (
                          `#${f.subjectId ?? f.id}`
                        )}
                      </td>
                      <td className="py-2 px-3">{f.reason || "Governance freeze"}</td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {f.frozenAt ? new Date(f.frozenAt).toLocaleString() : "—"}
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {f.frozenBy || "system"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <Snowflake className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No subjects are currently frozen</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
