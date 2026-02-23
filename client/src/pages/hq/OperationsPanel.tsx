import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, Activity, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "active":
    case "connected":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "error":
    case "disconnected":
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return <AlertCircle className="h-4 w-4 text-yellow-500" />;
  }
}

export default function OperationsPanel() {
  const { data, isLoading, error } = trpc.hq.operationsStatus.useQuery();

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
        Failed to load operations: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Operations</h1>
        <p className="text-muted-foreground mt-1">
          Provider status and system operations
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Status</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge
              variant={data?.systemStatus === "operational" ? "default" : "destructive"}
              className="text-sm"
            >
              {data?.systemStatus ?? "unknown"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inference</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge
              variant={data?.inferenceAvailable ? "default" : "secondary"}
              className="text-sm"
            >
              {data?.inferenceAvailable ? "Available" : "Unavailable"}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Provider Status</CardTitle>
        </CardHeader>
        <CardContent>
          {(data?.providerStatus ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">No providers configured</p>
          ) : (
            <div className="space-y-3">
              {data!.providerStatus.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <StatusIcon status={p.status} />
                    <span className="font-medium">{p.name}</span>
                  </div>
                  <Badge variant="outline">{p.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
