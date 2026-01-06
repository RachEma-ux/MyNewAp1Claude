import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, TrendingUp, DollarSign, Zap, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

/**
 * Provider Analytics Dashboard
 * Displays real-time provider health, performance metrics, cost analytics, and comparisons
 */

export default function ProviderAnalytics() {
  // Fetch all providers with metrics
  const { data: providers, refetch } = trpc.providerAnalytics.getAllWithMetrics.useQuery();

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 30000);
    return () => clearInterval(interval);
  }, [refetch]);

  const getHealthBadge = (status?: string) => {
    if (!status) return <Badge variant="outline">Unknown</Badge>;
    
    switch (status) {
      case "healthy":
        return (
          <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Healthy
          </Badge>
        );
      case "degraded":
        return (
          <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
            <AlertCircle className="w-3 h-3 mr-1" />
            Degraded
          </Badge>
        );
      case "down":
        return (
          <Badge className="bg-red-500/10 text-red-600 border-red-500/20">
            <XCircle className="w-3 h-3 mr-1" />
            Down
          </Badge>
        );
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const formatLatency = (ms?: number | null) => {
    if (!ms) return "N/A";
    return `${ms}ms`;
  };

  const formatCost = (cost?: string | null) => {
    if (!cost) return "$0.00";
    return `$${parseFloat(cost).toFixed(4)}`;
  };

  const formatNumber = (num?: number | null) => {
    if (!num) return "0";
    return num.toLocaleString();
  };

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Provider Analytics</h1>
        <p className="text-muted-foreground">
          Monitor provider health, performance metrics, and cost analytics in real-time
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-500" />
              Total Providers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{providers?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {providers?.filter((p) => p.enabled).length || 0} enabled
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              Healthy Providers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {providers?.filter((p) => p.health?.status === "healthy").length || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {providers?.length ? 
                Math.round((providers.filter((p) => p.health?.status === "healthy").length / providers.length) * 100) : 0}% uptime
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-500" />
              Avg Response Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {providers && providers.length > 0
                ? Math.round(
                    providers.reduce((sum, p) => sum + (p.health?.responseTimeMs || 0), 0) / providers.length
                  )
                : 0}
              ms
            </div>
            <p className="text-xs text-muted-foreground mt-1">Across all providers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-500" />
              Total Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              $
              {providers && providers.length > 0
                ? providers
                    .reduce((sum, p) => sum + parseFloat(p.metrics?.totalCost || "0"), 0)
                    .toFixed(2)
                : "0.00"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Current period</p>
          </CardContent>
        </Card>
      </div>

      {/* Provider List */}
      <Card>
        <CardHeader>
          <CardTitle>Provider Status</CardTitle>
          <CardDescription>Real-time health and performance metrics for all providers</CardDescription>
        </CardHeader>
        <CardContent>
          {!providers || providers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No providers configured yet
            </div>
          ) : (
            <div className="space-y-4">
              {providers.map((provider) => (
                <div
                  key={provider.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold">{provider.name}</h3>
                      {getHealthBadge(provider.health?.status)}
                      {!provider.enabled && <Badge variant="outline">Disabled</Badge>}
                    </div>
                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Activity className="w-3 h-3" />
                        Type: {provider.type}
                      </span>
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        Response: {formatLatency(provider.health?.responseTimeMs)}
                      </span>
                      {provider.metrics && (
                        <>
                          <span className="flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            Requests: {formatNumber(provider.metrics.totalRequests)}
                          </span>
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            Cost: {formatCost(provider.metrics.totalCost)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {provider.metrics && (
                    <div className="flex flex-col items-end gap-1">
                      <div className="text-sm font-medium">
                        {formatNumber(provider.metrics.totalTokens)} tokens
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {provider.metrics.successRate}% success rate
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Performance Comparison */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Performance Comparison</CardTitle>
          <CardDescription>Compare key metrics across all providers</CardDescription>
        </CardHeader>
        <CardContent>
          {!providers || providers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No data available for comparison
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Provider</th>
                    <th className="text-left py-3 px-4 font-medium">Status</th>
                    <th className="text-right py-3 px-4 font-medium">Avg Latency</th>
                    <th className="text-right py-3 px-4 font-medium">P95 Latency</th>
                    <th className="text-right py-3 px-4 font-medium">Tokens/sec</th>
                    <th className="text-right py-3 px-4 font-medium">Success Rate</th>
                    <th className="text-right py-3 px-4 font-medium">Cost/1k</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.map((provider) => (
                    <tr key={provider.id} className="border-b last:border-0">
                      <td className="py-3 px-4 font-medium">{provider.name}</td>
                      <td className="py-3 px-4">{getHealthBadge(provider.health?.status)}</td>
                      <td className="py-3 px-4 text-right">
                        {formatLatency(provider.metrics?.avgLatencyMs)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {formatLatency(provider.metrics?.p95LatencyMs)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {formatNumber(provider.metrics?.tokensPerSecond)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {provider.metrics?.successRate || "N/A"}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {provider.costPer1kTokens || "N/A"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
