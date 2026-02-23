import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, HeartPulse, Database, Clock, Cpu } from "lucide-react";

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MonitoringPanel() {
  const { data, isLoading, error } = trpc.hq.systemHealth.useQuery(undefined, {
    refetchInterval: 30000,
  });

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
        Failed to load system health: {error.message}
      </div>
    );
  }

  const mem = data?.memoryUsage;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Monitoring</h1>
        <p className="text-muted-foreground mt-1">
          System health and resource usage
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <HeartPulse className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge
              variant={data?.status === "healthy" ? "default" : "destructive"}
              className="text-sm"
            >
              {data?.status ?? "unknown"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Database</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge
              variant={data?.database === "connected" ? "default" : "destructive"}
              className="text-sm"
            >
              {data?.database ?? "unknown"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uptime</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data?.uptime != null ? formatUptime(data.uptime) : "--"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Node</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-mono">{data?.nodeVersion ?? "--"}</div>
          </CardContent>
        </Card>
      </div>

      {mem && (
        <Card>
          <CardHeader>
            <CardTitle>Memory Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">RSS</p>
                <p className="text-lg font-bold">{formatBytes(mem.rss)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Heap Total</p>
                <p className="text-lg font-bold">{formatBytes(mem.heapTotal)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Heap Used</p>
                <p className="text-lg font-bold">{formatBytes(mem.heapUsed)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">External</p>
                <p className="text-lg font-bold">{formatBytes(mem.external)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
