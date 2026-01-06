import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Cpu, HardDrive, Zap, Database, TrendingUp, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function ResourceMonitor() {
  const { data: hardware, isLoading: hardwareLoading } = trpc.hardware.getProfile.useQuery();
  const { data: allocation, isLoading: allocationLoading, refetch: refetchAllocation } = trpc.hardware.getResourceAllocation.useQuery();
  const { data: stats, refetch: refetchStats } = trpc.hardware.getResourceStatistics.useQuery();
  const { data: cacheStats } = trpc.hardware.getCacheStatistics.useQuery();
  const { data: cacheEntries } = trpc.hardware.getCacheEntries.useQuery();
  const { data: prefetchRecs } = trpc.hardware.getPrefetchRecommendations.useQuery();

  const clearCacheMutation = trpc.hardware.clearCache.useMutation({
    onSuccess: () => {
      toast.success("Model cache cleared");
      refetchAllocation();
      refetchStats();
    },
    onError: (error: any) => {
      toast.error(`Failed to clear cache: ${error.message}`);
    },
  });

  const handleRefresh = () => {
    refetchAllocation();
    refetchStats();
    toast.success("Resource data refreshed");
  };

  const handleClearCache = () => {
    if (confirm("Are you sure you want to clear the model cache? This will unload all models from memory.")) {
      clearCacheMutation.mutate();
    }
  };

  if (hardwareLoading || allocationLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Resource Monitor</h1>
          <p className="text-muted-foreground mt-1">Loading hardware and resource information...</p>
        </div>
      </div>
    );
  }

  const memoryUsagePercent = allocation ? (allocation.usedMemoryGB / allocation.totalMemoryGB) * 100 : 0;
  const requestUtilization = allocation && allocation.maxConcurrentRequests > 0
    ? (allocation.activeRequests / allocation.maxConcurrentRequests) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Resource Monitor</h1>
          <p className="text-muted-foreground mt-1">
            Monitor hardware resources, memory allocation, and model cache
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button variant="destructive" onClick={handleClearCache} className="gap-2" disabled={clearCacheMutation.isPending}>
            <Trash2 className="h-4 w-4" />
            Clear Cache
          </Button>
        </div>
      </div>

      {/* Hardware Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            Hardware Profile
          </CardTitle>
          <CardDescription>Current system hardware capabilities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* GPU */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">GPU</div>
              <div className="text-2xl font-bold">
                {hardware?.hasGPU ? (
                  <Badge variant="default">{hardware.gpuType.toUpperCase()}</Badge>
                ) : (
                  <Badge variant="secondary">CPU Only</Badge>
                )}
              </div>
              {hardware?.gpuName && <div className="text-sm text-muted-foreground">{hardware.gpuName}</div>}
              {hardware?.gpuVRAM && <div className="text-sm text-muted-foreground">{hardware.gpuVRAM}GB VRAM</div>}
              {hardware?.cudaVersion && <div className="text-xs text-muted-foreground">CUDA {hardware.cudaVersion}</div>}
            </div>

            {/* CPU */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">CPU</div>
              <div className="text-2xl font-bold">{hardware?.cpuCores || 0} Cores</div>
              <div className="text-sm text-muted-foreground">{hardware?.cpuThreads || 0} Threads</div>
              <div className="text-xs text-muted-foreground truncate">{hardware?.cpuModel}</div>
            </div>

            {/* RAM */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">System RAM</div>
              <div className="text-2xl font-bold">{hardware?.totalRAM?.toFixed(1) || 0}GB</div>
              <div className="text-sm text-muted-foreground">{hardware?.availableRAM?.toFixed(1) || 0}GB Available</div>
            </div>

            {/* Platform */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Platform</div>
              <div className="text-2xl font-bold capitalize">{hardware?.platform || "Unknown"}</div>
              <div className="text-sm text-muted-foreground">{hardware?.cpuArchitecture}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resource Allocation */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Memory Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allocation?.usedMemoryGB.toFixed(1) || 0}GB</div>
            <p className="text-xs text-muted-foreground">
              of {allocation?.totalMemoryGB.toFixed(1) || 0}GB ({memoryUsagePercent.toFixed(0)}%)
            </p>
            <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  memoryUsagePercent > 90 ? "bg-destructive" : memoryUsagePercent > 70 ? "bg-yellow-500" : "bg-primary"
                }`}
                style={{ width: `${memoryUsagePercent}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4" />
              Loaded Models
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allocation?.loadedModels.length || 0}</div>
            <p className="text-xs text-muted-foreground">Active in memory</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Active Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allocation?.activeRequests || 0}</div>
            <p className="text-xs text-muted-foreground">
              of {allocation?.maxConcurrentRequests || 0} max ({requestUtilization.toFixed(0)}%)
            </p>
            <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  requestUtilization > 90 ? "bg-destructive" : requestUtilization > 70 ? "bg-yellow-500" : "bg-primary"
                }`}
                style={{ width: `${requestUtilization}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Queue Length
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.queueLength || 0}</div>
            <p className="text-xs text-muted-foreground">Waiting requests</p>
          </CardContent>
        </Card>
      </div>

      {/* Cache Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>Model Cache Statistics</CardTitle>
          <CardDescription>LRU cache with intelligent prefetching</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1">
              <div className="text-sm font-medium text-muted-foreground">Cache Entries</div>
              <div className="text-2xl font-bold">{cacheStats?.totalEntries || 0}</div>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium text-muted-foreground">Cache Size</div>
              <div className="text-2xl font-bold">{cacheStats?.totalSizeGB.toFixed(1) || 0}GB</div>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium text-muted-foreground">Hit Rate</div>
              <div className="text-2xl font-bold">{cacheStats?.hitRate.toFixed(1) || 0}%</div>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium text-muted-foreground">Evictions</div>
              <div className="text-2xl font-bold">{cacheStats?.evictions || 0}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loaded Models */}
      {cacheEntries && cacheEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Loaded Models</CardTitle>
            <CardDescription>Currently cached in memory</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {cacheEntries.map((entry) => (
                <div key={entry.modelId} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="space-y-1">
                    <div className="font-medium">{entry.modelName}</div>
                    <div className="text-sm text-muted-foreground">
                      {entry.sizeGB.toFixed(1)}GB • {entry.accessCount} accesses
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="text-sm font-medium">{entry.hitRate.toFixed(0)}% hit rate</div>
                    <div className="text-xs text-muted-foreground">
                      Last used: {new Date(entry.lastAccessed).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Prefetch Recommendations */}
      {prefetchRecs && prefetchRecs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Prefetch Recommendations</CardTitle>
            <CardDescription>Models likely to be used soon based on patterns</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {prefetchRecs.map((rec) => (
                <div key={rec.modelId} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="space-y-1">
                    <div className="font-medium">{rec.modelId}</div>
                    <div className="text-sm text-muted-foreground">{rec.reason}</div>
                  </div>
                  <Badge variant="secondary">{rec.confidence}% confidence</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommended Models */}
      {hardware?.recommendedModels && hardware.recommendedModels.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommended Models</CardTitle>
            <CardDescription>Based on your hardware capabilities (max {hardware.maxModelSize}GB)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {hardware.recommendedModels.map((model) => (
                <Badge key={model} variant="outline">
                  {model}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
