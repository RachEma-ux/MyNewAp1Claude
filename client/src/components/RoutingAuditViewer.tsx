import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Loader2,
  RefreshCw,
  ArrowRight,
  Clock,
  Coins,
  Activity,
  ChevronDown,
  AlertCircle,
  CheckCircle,
} from "lucide-react";

interface Props {
  workspaceId: number;
}

export function RoutingAuditViewer({ workspaceId }: Props) {
  const [limit, setLimit] = useState(20);
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');

  const getSinceDate = () => {
    const now = new Date();
    switch (timeRange) {
      case '1h':
        return new Date(now.getTime() - 60 * 60 * 1000);
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  };

  const { data: logs, isLoading, refetch } = trpc.providers.routing.getAuditLogs.useQuery({
    workspaceId,
    limit,
    since: getSinceDate(),
  });

  const { data: stats } = trpc.providers.routing.getStats.useQuery({
    workspaceId,
    since: getSinceDate(),
  });

  const { data: providers } = trpc.providers.list.useQuery();

  const getProviderName = (providerId: number) => {
    return providers?.find(p => p.id === providerId)?.name || `Provider #${providerId}`;
  };

  const getRouteColor = (route: string) => {
    if (route === 'PRIMARY') return 'bg-green-500/10 text-green-500 border-green-500/20';
    if (route.startsWith('FALLBACK_1')) return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    return 'bg-red-500/10 text-red-500 border-red-500/20';
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(date));
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalRequests}</div>
              <p className="text-xs text-muted-foreground">
                in selected time range
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Primary Success</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.primaryUsed}</div>
              <p className="text-xs text-muted-foreground">
                {stats.totalRequests > 0 ? ((stats.primaryUsed / stats.totalRequests) * 100).toFixed(1) : 0}% success rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Fallback Used</CardTitle>
              <AlertCircle className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.fallbackUsed}</div>
              <p className="text-xs text-muted-foreground">
                {stats.fallbackRate.toFixed(1)}% fallback rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.avgLatencyMs}ms</div>
              <p className="text-xs text-muted-foreground">
                {stats.totalTokens.toLocaleString()} total tokens
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Select value={timeRange} onValueChange={(v: any) => setTimeRange(v)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last Hour</SelectItem>
              <SelectItem value="24h">Last 24 Hours</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={limit.toString()} onValueChange={(v) => setLimit(parseInt(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 rows</SelectItem>
              <SelectItem value="20">20 rows</SelectItem>
              <SelectItem value="50">50 rows</SelectItem>
              <SelectItem value="100">100 rows</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Audit Log Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Routing Decisions</CardTitle>
          <CardDescription>Detailed log of provider routing decisions</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !logs || logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No routing decisions recorded in this time period
            </div>
          ) : (
            <Accordion type="single" collapsible className="space-y-2">
              {logs.map((log, index) => (
                <AccordionItem
                  key={log.id}
                  value={`log-${log.id}`}
                  className="border rounded-lg px-4"
                >
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center justify-between w-full pr-4">
                      <div className="flex items-center gap-4">
                        <Badge variant="outline" className={getRouteColor(log.routeTaken)}>
                          {log.routeTaken}
                        </Badge>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">
                            {getProviderName(log.primaryProviderId)}
                          </span>
                          {log.primaryProviderId !== log.actualProviderId && (
                            <>
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                              <span className="font-medium">
                                {getProviderName(log.actualProviderId)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {log.latencyMs && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {log.latencyMs}ms
                          </span>
                        )}
                        {log.tokensUsed && (
                          <span>{log.tokensUsed} tokens</span>
                        )}
                        <span>{formatTime(log.createdAt)}</span>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <div className="space-y-4 pt-2">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Request ID:</span>
                          <code className="ml-2 text-xs bg-muted px-1 py-0.5 rounded">
                            {log.requestId}
                          </code>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Timestamp:</span>
                          <span className="ml-2">{formatDate(log.createdAt)}</span>
                        </div>
                        {log.estimatedCost && (
                          <div>
                            <span className="text-muted-foreground">Estimated Cost:</span>
                            <span className="ml-2">${log.estimatedCost}</span>
                          </div>
                        )}
                      </div>

                      {log.auditReasons && (log.auditReasons as string[]).length > 0 && (
                        <div>
                          <span className="text-sm text-muted-foreground">Routing Reasons:</span>
                          <ul className="mt-2 space-y-1">
                            {(log.auditReasons as string[]).map((reason, i) => (
                              <li key={i} className="text-sm flex items-start gap-2">
                                <span className="text-primary mt-1">•</span>
                                {reason}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
