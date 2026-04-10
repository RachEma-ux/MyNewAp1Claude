import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, Zap, Clock, Hash } from "lucide-react";

export default function OpenRouterUsagePage() {
  const summary = trpc.openRouter.usage.summary.useQuery();
  const recent = trpc.openRouter.usage.recent.useQuery({ limit: 50 });
  const byModel = trpc.openRouter.usage.byModel.useQuery();

  const s = summary.data;

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <h3 className="text-lg font-semibold">Usage</h3>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard icon={Zap} label="Requests" value={String(s?.totalRequests ?? 0)} />
        <SummaryCard icon={BarChart3} label="Success Rate" value={`${s?.successRate ?? 0}%`} />
        <SummaryCard icon={Hash} label="Total Tokens" value={formatNumber(s?.totalTokens ?? 0)} />
        <SummaryCard icon={Clock} label="Avg Latency" value={`${s?.avgLatency ?? 0}ms`} />
        <SummaryCard icon={BarChart3} label="Est. Cost" value={`$${s?.totalCost?.toFixed(4) ?? "0"}`} />
      </div>

      {/* By model */}
      {byModel.data && byModel.data.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-xs text-muted-foreground">By Model</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Model</TableHead><TableHead>Requests</TableHead><TableHead>Tokens</TableHead><TableHead>Errors</TableHead></TableRow></TableHeader>
              <TableBody>
                {byModel.data.map((r) => (
                  <TableRow key={r.model}>
                    <TableCell className="font-medium text-sm">{r.model}</TableCell>
                    <TableCell className="text-xs">{r.requests}</TableCell>
                    <TableCell className="text-xs">{formatNumber(r.tokens)}</TableCell>
                    <TableCell className="text-xs">{r.errors > 0 ? <Badge variant="destructive" className="text-[9px]">{r.errors}</Badge> : "0"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recent executions */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-xs text-muted-foreground">Recent Executions</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Status</TableHead><TableHead>Model</TableHead><TableHead>Type</TableHead><TableHead>Tokens</TableHead><TableHead>Latency</TableHead><TableHead>Time</TableHead></TableRow></TableHeader>
            <TableBody>
              {(!recent.data || recent.data.length === 0) && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No executions yet</TableCell></TableRow>
              )}
              {(recent.data ?? []).map((e) => (
                <TableRow key={e.id}>
                  <TableCell><Badge variant={e.status === "success" ? "default" : "destructive"} className="text-[9px]">{e.status}</Badge></TableCell>
                  <TableCell className="text-xs">{e.modelId}</TableCell>
                  <TableCell className="text-xs">{e.requestType ?? "—"}</TableCell>
                  <TableCell className="text-xs">{e.totalTokens ?? "—"}</TableCell>
                  <TableCell className="text-xs">{e.latencyMs ? `${e.latencyMs}ms` : "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleTimeString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-3 pb-2 px-4">
        <div className="flex items-center gap-1.5 mb-1"><Icon className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-[10px] text-muted-foreground">{label}</span></div>
        <div className="text-lg font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
