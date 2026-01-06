import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Loader2, TrendingUp, DollarSign, Zap, Activity } from "lucide-react";

export default function Analytics() {
  const [selectedWorkspace, setSelectedWorkspace] = useState<number>(1); // Default workspace

  const { data: workspaceUsage, isLoading: usageLoading } = trpc.providers.usage.list.useQuery({
    workspaceId: selectedWorkspace,
  });

  const { data: providers } = trpc.providers.list.useQuery();

  // Calculate totals
  const totals = workspaceUsage?.reduce(
    (acc, usage) => ({
      tokens: acc.tokens + (usage.tokensUsed || 0),
      cost: acc.cost + (usage.cost ? parseFloat(usage.cost) : 0),
      requests: acc.requests + 1,
    }),
    { tokens: 0, cost: 0, requests: 0 }
  ) || { tokens: 0, cost: 0, requests: 0 };

  // Group by provider
  const byProvider = workspaceUsage?.reduce((acc, usage) => {
    const key = usage.providerId.toString();
    if (!acc[key]) {
      acc[key] = {
        providerId: usage.providerId,
        tokens: 0,
        cost: 0,
        requests: 0,
      };
    }
    acc[key]!.tokens += usage.tokensUsed || 0;
    acc[key]!.cost += usage.cost ? parseFloat(usage.cost) : 0;
    acc[key]!.requests += 1;
    return acc;
  }, {} as Record<string, { providerId: number; tokens: number; cost: number; requests: number }>);

  const providerStats = byProvider ? Object.values(byProvider) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Usage Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Monitor token usage and costs across providers
          </p>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totals.tokens.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all providers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${totals.cost.toFixed(4)}
            </div>
            <p className="text-xs text-muted-foreground">
              All-time spending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totals.requests.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              API calls made
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Cost/Request</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${totals.requests > 0 ? (totals.cost / totals.requests).toFixed(4) : "0.0000"}
            </div>
            <p className="text-xs text-muted-foreground">
              Per API call
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Provider Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Usage by Provider</CardTitle>
          <CardDescription>
            Breakdown of token usage and costs per provider
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usageLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : providerStats.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No usage data available</p>
              <p className="text-sm mt-2">Start using providers to see analytics</p>
            </div>
          ) : (
            <div className="space-y-4">
              {providerStats.map((stat) => {
                const provider = providers?.find(p => p.id === stat.providerId);
                const percentage = totals.tokens > 0 ? (stat.tokens / totals.tokens) * 100 : 0;

                return (
                  <div key={stat.providerId} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">
                            {provider?.name || `Provider ${stat.providerId}`}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {percentage.toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Tokens</p>
                        <p className="font-medium">{stat.tokens.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Requests</p>
                        <p className="font-medium">{stat.requests.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Cost</p>
                        <p className="font-medium">${stat.cost.toFixed(4)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Usage Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Usage</CardTitle>
          <CardDescription>
            Latest API calls and token consumption
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usageLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !workspaceUsage || workspaceUsage.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">
              <p>No recent usage</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 text-sm font-medium text-muted-foreground">Provider</th>
                    <th className="text-left p-2 text-sm font-medium text-muted-foreground">Model</th>
                    <th className="text-right p-2 text-sm font-medium text-muted-foreground">Tokens</th>
                    <th className="text-right p-2 text-sm font-medium text-muted-foreground">Cost</th>
                    <th className="text-right p-2 text-sm font-medium text-muted-foreground">Latency</th>
                    <th className="text-right p-2 text-sm font-medium text-muted-foreground">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {workspaceUsage.slice(0, 10).map((usage) => {
                    const provider = providers?.find(p => p.id === usage.providerId);
                    return (
                      <tr key={usage.id} className="border-b last:border-0">
                        <td className="p-2 text-sm">{provider?.name || `Provider ${usage.providerId}`}</td>
                        <td className="p-2 text-sm text-muted-foreground">{usage.modelName}</td>
                        <td className="p-2 text-sm text-right">{usage.tokensUsed?.toLocaleString()}</td>
                        <td className="p-2 text-sm text-right">
                          ${usage.cost ? parseFloat(usage.cost).toFixed(4) : "0.0000"}
                        </td>
                        <td className="p-2 text-sm text-right text-muted-foreground">
                          {usage.latencyMs ? `${usage.latencyMs}ms` : "-"}
                        </td>
                        <td className="p-2 text-sm text-right text-muted-foreground">
                          {new Date(usage.createdAt).toLocaleTimeString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
