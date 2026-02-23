import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, FileText } from "lucide-react";

function severityVariant(severity: string) {
  switch (severity) {
    case "critical": return "destructive" as const;
    case "high": return "outline" as const;
    case "medium": return "secondary" as const;
    default: return "secondary" as const;
  }
}

export default function ControlsCatalogPanel() {
  const { data, isLoading, error } = trpc.governance.controlCatalog.useQuery();

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
        Failed to load controls catalog: {error.message}
      </div>
    );
  }

  const controls = data?.controls || [];
  const active = data?.activeControls || [];

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Controls Catalog</h1>
        <p className="text-muted-foreground mt-2">
          All governance control definitions — {active.length} active of {controls.length} total
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold">{controls.length}</p>
            <p className="text-xs text-muted-foreground">Total Controls</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold">{active.length}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold">{data?.subjectTypes?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">Subject Types</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold">{data?.runners?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">Runners</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Control Definitions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium">ID</th>
                  <th className="text-left py-2 px-3 font-medium">Name</th>
                  <th className="text-left py-2 px-3 font-medium">Pack</th>
                  <th className="text-left py-2 px-3 font-medium">Severity</th>
                  <th className="text-left py-2 px-3 font-medium">Domain</th>
                  <th className="text-left py-2 px-3 font-medium">Enabled</th>
                </tr>
              </thead>
              <tbody>
                {controls.map((c: any) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-2 px-3 font-mono text-xs">{c.id}</td>
                    <td className="py-2 px-3">{c.name}</td>
                    <td className="py-2 px-3"><Badge variant="outline">{c.pack}</Badge></td>
                    <td className="py-2 px-3">
                      <Badge variant={severityVariant(c.severity)}>{c.severity}</Badge>
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">{c.domain}</td>
                    <td className="py-2 px-3">
                      <Badge variant={c.enabled ? "default" : "secondary"}>
                        {c.enabled ? "Yes" : "No"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
