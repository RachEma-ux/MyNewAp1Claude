import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ScrollText } from "lucide-react";

export default function AuditTrailPanel() {
  const { data, isLoading, error } = trpc.governance.auditEvents.useQuery({ limit: 100 });

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading audit trail...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <ScrollText className="w-12 h-12 mx-auto text-destructive mb-4" />
            <p className="text-destructive">Failed to load audit events: {error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const events = Array.isArray(data) ? data : [];

  const resultVariant = (result: string): "default" | "destructive" | "outline" => {
    const r = result?.toLowerCase();
    if (r === "success" || r === "pass" || r === "allowed") return "default";
    if (r === "denied" || r === "fail" || r === "blocked") return "destructive";
    return "outline";
  };

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Audit Trail</h1>
        <p className="text-muted-foreground mt-2">
          Recent governance events — {events.length} entries
        </p>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ScrollText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No audit events recorded yet</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Event Log</CardTitle>
            <CardDescription>Showing most recent {events.length} events</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4">Timestamp</th>
                    <th className="text-left py-2 px-4">Action</th>
                    <th className="text-left py-2 px-4">Target</th>
                    <th className="text-right py-2 pl-4">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((evt: any, i: number) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                        {evt.timestamp ? new Date(evt.timestamp).toLocaleString() : "—"}
                      </td>
                      <td className="py-2 px-4 font-mono text-xs">{evt.action ?? evt.type ?? "—"}</td>
                      <td className="py-2 px-4">{evt.target ?? evt.subject ?? "—"}</td>
                      <td className="text-right py-2 pl-4">
                        <Badge variant={resultVariant(evt.result ?? evt.outcome ?? "")}>
                          {evt.result ?? evt.outcome ?? "—"}
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
