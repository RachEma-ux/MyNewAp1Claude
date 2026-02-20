import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plug,
  Activity,
  CheckCircle2,
  XCircle,
  Shield,
  Trash2,
  RefreshCw,
  Plus,
  Loader2,
  Clock,
  Ban,
  Package,
} from "lucide-react";
import { ConnectProviderModal } from "@/components/ConnectProviderModal";

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  active: {
    color: "bg-green-500/10 text-green-500 border-green-500/20",
    icon: <CheckCircle2 className="h-3 w-3" />,
    label: "Active",
  },
  validated: {
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    icon: <Shield className="h-3 w-3" />,
    label: "Validated",
  },
  draft: {
    color: "bg-gray-400/10 text-gray-400 border-gray-400/20",
    icon: <Clock className="h-3 w-3" />,
    label: "Draft",
  },
  failed: {
    color: "bg-red-500/10 text-red-500 border-red-500/20",
    icon: <XCircle className="h-3 w-3" />,
    label: "Failed",
  },
  disabled: {
    color: "bg-gray-500/10 text-gray-500 border-gray-500/20",
    icon: <Ban className="h-3 w-3" />,
    label: "Disabled",
  },
};

const HEALTH_CONFIG: Record<string, { color: string; label: string }> = {
  ok: { color: "bg-green-500/10 text-green-500 border-green-500/20", label: "Healthy" },
  unreachable: { color: "bg-red-500/10 text-red-500 border-red-500/20", label: "Unreachable" },
};

export default function ProviderConnectionsPage() {
  const [connectModalOpen, setConnectModalOpen] = useState(false);

  const { data: connections, isLoading, refetch } = trpc.providerConnections.list.useQuery({ workspaceId: 1 });
  const { data: catalogProviders } = trpc.catalogManage.list.useQuery({ entryType: "provider" });

  const healthCheckMutation = trpc.providerConnections.healthCheck.useMutation({
    onSuccess: (result) => {
      toast.success(`Health: ${result.status} (${result.latencyMs}ms)`);
      refetch();
    },
    onError: (err) => toast.error(`Health check failed: ${err.message}`),
  });

  const disableMutation = trpc.providerConnections.disable.useMutation({
    onSuccess: () => {
      toast.success("Connection disabled");
      refetch();
    },
    onError: (err) => toast.error(`Failed to disable: ${err.message}`),
  });

  const activateMutation = trpc.providerConnections.activate.useMutation({
    onSuccess: () => {
      toast.success("Connection activated");
      refetch();
    },
    onError: (err) => toast.error(`Failed to activate: ${err.message}`),
  });

  const deleteMutation = trpc.providerConnections.delete.useMutation({
    onSuccess: () => {
      toast.success("Connection deleted");
      refetch();
    },
    onError: (err) => toast.error(`Failed to delete: ${err.message}`),
  });

  // Resolve provider name from catalog entry ID
  const getProviderName = (providerId: number) => {
    const entry = catalogProviders?.find((e: any) => e.id === providerId);
    return entry?.displayName || entry?.name || `Provider #${providerId}`;
  };

  // Compute stats
  const total = connections?.length || 0;
  const activeCount = connections?.filter((c) => c.lifecycleStatus === "active").length || 0;
  const failedCount = connections?.filter((c) => c.lifecycleStatus === "failed").length || 0;
  const totalModels = connections?.reduce((sum, c) => sum + (c.modelCount || 0), 0) || 0;

  const [checkingIds, setCheckingIds] = useState<Set<number>>(new Set());

  const handleHealthCheck = async (id: number) => {
    setCheckingIds((prev) => new Set(prev).add(id));
    try {
      await healthCheckMutation.mutateAsync({ connectionId: id });
    } finally {
      setCheckingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Delete this connection? This will also remove stored secrets.")) {
      deleteMutation.mutate({ connectionId: id });
    }
  };

  return (
    <div className="space-y-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-start sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Provider Connections</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            PAT-authenticated provider connections with health monitoring
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => setConnectModalOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Connect Provider
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Connections</CardTitle>
            <Plug className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{activeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{failedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Models</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalModels}</div>
          </CardContent>
        </Card>
      </div>

      {/* Connection Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : total === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Plug className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Connections</h3>
            <p className="text-muted-foreground text-center mb-4">
              Connect a provider with PAT authentication to get started
            </p>
            <Button onClick={() => setConnectModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Connect Provider
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {connections?.map((conn) => {
            const statusCfg = STATUS_CONFIG[conn.lifecycleStatus] || STATUS_CONFIG.draft;
            const healthCfg = conn.healthStatus ? HEALTH_CONFIG[conn.healthStatus] : null;
            const isChecking = checkingIds.has(conn.id);
            const isDisabled = conn.lifecycleStatus === "disabled";

            return (
              <Card key={conn.id} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base truncate">
                        {getProviderName(conn.providerId)}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {conn.baseUrl}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 ml-2 shrink-0">
                      <Badge variant="outline" className={statusCfg.color}>
                        {statusCfg.icon}
                        <span className="ml-1">{statusCfg.label}</span>
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Health + Meta Row */}
                  <div className="flex flex-wrap items-center gap-2">
                    {healthCfg ? (
                      <Badge variant="outline" className={healthCfg.color}>
                        <Activity className="h-3 w-3 mr-1" />
                        {healthCfg.label}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-500/10 text-gray-400 border-gray-500/20">
                        <Activity className="h-3 w-3 mr-1" />
                        Not checked
                      </Badge>
                    )}
                    {(conn.modelCount ?? 0) > 0 && (
                      <Badge variant="outline">
                        <Package className="h-3 w-3 mr-1" />
                        {conn.modelCount} models
                      </Badge>
                    )}
                    {conn.secretVersion != null && (
                      <Badge variant="outline" className="text-xs">
                        <Shield className="h-3 w-3 mr-1" />
                        v{conn.secretVersion}
                      </Badge>
                    )}
                  </div>

                  {/* Capabilities */}
                  {conn.capabilities && (conn.capabilities as string[]).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(conn.capabilities as string[]).map((cap) => (
                        <Badge key={cap} variant="secondary" className="text-xs">
                          {cap}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Last health check */}
                  {conn.lastHealthCheck && (
                    <p className="text-xs text-muted-foreground">
                      Last checked: {new Date(conn.lastHealthCheck).toLocaleString()}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleHealthCheck(conn.id)}
                      disabled={isChecking || isDisabled}
                    >
                      {isChecking ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Activity className="h-4 w-4" />
                      )}
                      <span className="ml-1 hidden sm:inline">Check</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        if (isDisabled) {
                          activateMutation.mutate({ connectionId: conn.id });
                        } else {
                          disableMutation.mutate({ connectionId: conn.id });
                        }
                      }}
                    >
                      {isDisabled ? "Enable" : "Disable"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(conn.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Connect Provider Modal */}
      <ConnectProviderModal
        open={connectModalOpen}
        onOpenChange={setConnectModalOpen}
        onComplete={() => refetch()}
      />
    </div>
  );
}
