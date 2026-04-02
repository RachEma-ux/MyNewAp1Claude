import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Settings, Database, Cpu, Activity, ScrollText } from "lucide-react";

export default function CodeStudioControlPanelPage() {
  const healthQuery = trpc.codeStudio.health.status.useQuery();
  const summaryQuery = trpc.codeStudio.health.summary.useQuery();
  const auditQuery = trpc.codeStudio.audit.list.useQuery({});

  const health = healthQuery.data;
  const summary = summaryQuery.data;
  const audits = auditQuery.data ?? [];

  const isLoading = healthQuery.isLoading || summaryQuery.isLoading;

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Settings className="h-4 w-4 text-zinc-400" /> Control Panel
      </h2>

      {isLoading && <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin" /></div>}

      {!isLoading && (
        <>
          {/* Runtime Health */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Cpu className="h-3.5 w-3.5 text-violet-500" /> Runtime Status
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">CODEDB</span>
                  <Badge variant={health?.codeDbConnected ? "default" : "destructive"} className="text-[9px]">
                    {health?.codeDbConnected ? "Connected" : "Disconnected"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">OpenCode</span>
                  <Badge variant={health?.openCodeReachable ? "default" : "outline"} className="text-[9px]">
                    {health?.openCodeReachable ? "Reachable" : "Offline"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Module Summary */}
          {summary && (
            <Card>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Database className="h-3.5 w-3.5 text-blue-500" /> Module Summary
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {Object.entries(summary).map(([key, val]) => (
                    <div key={key} className="flex flex-col items-center p-2 rounded bg-muted/30">
                      <span className="text-lg font-bold">{String(val)}</span>
                      <span className="text-[9px] text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Audit Events */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <ScrollText className="h-3.5 w-3.5 text-amber-500" /> Recent Audit Events
                </div>
                <Badge variant="secondary" className="text-[9px]">{audits.length}</Badge>
              </div>
              {audits.length === 0 && <p className="text-[10px] text-muted-foreground">No audit events recorded yet.</p>}
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {audits.slice(0, 20).map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between py-1 px-2 rounded text-[10px] bg-muted/20">
                    <div className="flex items-center gap-2">
                      <Activity className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{e.eventType?.replace(/_/g, " ")}</span>
                      <span className="text-muted-foreground">{e.entityType} #{e.entityId}</span>
                    </div>
                    {e.createdAt && <span className="text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</span>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
