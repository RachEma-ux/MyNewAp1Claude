import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ShieldAlert, ShieldCheck } from "lucide-react";

export default function GateCoveragePanel() {
  const { data, isLoading, error } = trpc.governance.gateCoverage.useQuery();

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading gate coverage...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <ShieldAlert className="w-12 h-12 mx-auto text-destructive mb-4" />
            <p className="text-destructive">Failed to load gate coverage: {error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalMutations = data?.totalMutations ?? 0;
  const governedCount = data?.governedCount ?? 0;
  const ungovernedCount = data?.ungovernedCount ?? 0;
  const percentage = totalMutations > 0 ? Math.round((governedCount / totalMutations) * 100) : 0;
  const files = data?.files ?? [];

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Gate Coverage Map</h1>
        <p className="text-muted-foreground mt-2">
          Mutation endpoint governance enforcement coverage
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Mutations</CardDescription>
            <CardTitle className="text-3xl">{totalMutations}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Governed</CardDescription>
            <CardTitle className="text-3xl text-green-500">{governedCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Ungoverned</CardDescription>
            <CardTitle className="text-3xl text-destructive">{ungovernedCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            Coverage: {percentage}%
          </CardTitle>
          <CardDescription>
            {governedCount} of {totalMutations} mutations have governance gates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full bg-muted rounded-full h-3">
            <div
              className={`h-3 rounded-full ${percentage >= 80 ? "bg-green-500" : percentage >= 50 ? "bg-yellow-500" : "bg-destructive"}`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Per-File Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4">File</th>
                    <th className="text-right py-2 px-4">Total</th>
                    <th className="text-right py-2 px-4">Governed</th>
                    <th className="text-right py-2 px-4">Ungoverned</th>
                    <th className="text-right py-2 pl-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((f: any, i: number) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{f.file}</td>
                      <td className="text-right py-2 px-4">{f.total}</td>
                      <td className="text-right py-2 px-4">{f.governed}</td>
                      <td className="text-right py-2 px-4">{f.ungoverned}</td>
                      <td className="text-right py-2 pl-4">
                        <Badge variant={f.ungoverned === 0 ? "default" : "destructive"}>
                          {f.ungoverned === 0 ? "Full" : "Gap"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
