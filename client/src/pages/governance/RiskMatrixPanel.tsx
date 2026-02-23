import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { AlertTriangle } from "lucide-react";

export default function RiskMatrixPanel() {
  const { data, isLoading, error } = trpc.governance.controlCatalog.useQuery();

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading risk matrix...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto text-destructive mb-4" />
            <p className="text-destructive">Failed to load controls: {error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const controls = data?.controls ?? [];
  const groups: Record<string, any[]> = { critical: [], high: [], medium: [], low: [] };
  for (const c of controls) {
    const sev = (c.severity || "medium").toLowerCase();
    if (groups[sev]) groups[sev].push(c);
    else groups.medium.push(c);
  }

  const severityColors: Record<string, string> = {
    critical: "text-red-500 border-red-500/30 bg-red-500/5",
    high: "text-orange-500 border-orange-500/30 bg-orange-500/5",
    medium: "text-yellow-500 border-yellow-500/30 bg-yellow-500/5",
    low: "text-blue-500 border-blue-500/30 bg-blue-500/5",
  };

  const badgeVariant: Record<string, "destructive" | "outline" | "secondary" | "default"> = {
    critical: "destructive",
    high: "destructive",
    medium: "outline",
    low: "secondary",
  };

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Risk Matrix</h1>
        <p className="text-muted-foreground mt-2">
          Controls grouped by severity — {controls.length} total controls
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {(["critical", "high", "medium", "low"] as const).map((sev) => (
          <Card key={sev} className={severityColors[sev]}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="capitalize">{sev}</span>
                <Badge variant={badgeVariant[sev]}>{groups[sev].length}</Badge>
              </CardTitle>
              <CardDescription>{groups[sev].length} controls at this severity</CardDescription>
            </CardHeader>
            <CardContent>
              {groups[sev].length === 0 ? (
                <p className="text-sm text-muted-foreground">No controls</p>
              ) : (
                <ul className="space-y-2">
                  {groups[sev].map((c: any) => (
                    <li key={c.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                      <span>{c.name}</span>
                      <Badge variant="outline" className="text-xs">{c.domain || c.pack}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
