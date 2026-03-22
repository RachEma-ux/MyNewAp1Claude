import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Cloud,
  Plug,
  Settings,
  Activity,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  Shield,
  Server,
  BarChart3,
  ArrowRight,
  Zap,
  Eye,
  Power,
  PowerOff,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/10 text-green-500 border-green-500/20",
  configured: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  authenticated: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  validated: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  healthy: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  suspended: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
};

const NAV_LINKS = [
  { label: "Dashboard", description: "Overview & statistics", icon: BarChart3, href: "/providers/dashboard", color: "text-blue-500" },
  { label: "Provider List", description: "Browse all providers", icon: Cloud, href: "/providers", color: "text-cyan-500" },
  { label: "Connections", description: "PAT-authenticated connections", icon: Plug, href: "/providers/connections", color: "text-green-500" },
  { label: "Register", description: "Add a new provider", icon: Zap, href: "/providers/wizard", color: "text-purple-500" },
  { label: "Settings", description: "Provider defaults & config", icon: Settings, href: "/settings", color: "text-orange-500" },
];

export default function ProviderControlPanelPage() {
  const [, navigate] = useLocation();
  const { data: providers, isLoading, refetch } = trpc.provider.list.useQuery({});
  const [checkingAll, setCheckingAll] = useState(false);

  const updateMutation = trpc.provider.update.useMutation({
    onSuccess: () => {
      toast.success("Provider updated");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const total = providers?.length ?? 0;
  const enabledCount = providers?.filter((p) => p.enabled).length ?? 0;

  const handleToggle = (id: number, currentEnabled: boolean) => {
    updateMutation.mutate({ id, enabled: !currentEnabled });
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Provider Control Panel</h1>
          <p className="text-muted-foreground mt-1">
            Manage, monitor, and configure your LLM providers
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {NAV_LINKS.map((item) => (
          <Card
            key={item.href}
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => navigate(item.href)}
          >
            <CardHeader className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="px-2 py-1">
                  <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
                </Badge>
                <CardTitle className="text-sm font-semibold">{item.label}</CardTitle>
              </div>
              <CardDescription className="text-xs">{item.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Provider Health Table */}
      {!providers?.length ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Cloud className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No providers registered</p>
            <Button variant="link" onClick={() => navigate("/providers/wizard")}>Register your first provider</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Provider Status</CardTitle>
                <CardDescription>{enabledCount} of {total} enabled</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {providers?.map((p) => {
                const isLocal = ["local-llamacpp", "local-ollama"].includes(p.type);
                const lifecycle = (p as any).lifecycleStatus || "configured";
                const statusColor = STATUS_COLORS[lifecycle] || STATUS_COLORS.configured;

                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {isLocal ? (
                        <Server className="h-4 w-4 text-orange-500 shrink-0" />
                      ) : (
                        <Cloud className="h-4 w-4 text-blue-500 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.type} — priority {p.priority}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className={`text-xs ${statusColor}`}>
                        {lifecycle}
                      </Badge>
                      {/* Capabilities */}
                      {p.capabilities && (p.capabilities as string[]).length > 0 && (
                        <div className="hidden md:flex gap-1">
                          {(p.capabilities as string[]).slice(0, 3).map((cap) => (
                            <Badge key={cap} variant="secondary" className="text-xs">{cap}</Badge>
                          ))}
                        </div>
                      )}
                      {/* Toggle enable/disable */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleToggle(p.id, p.enabled ?? true)}
                        title={p.enabled ? "Disable" : "Enable"}
                      >
                        {p.enabled ? (
                          <Power className="h-4 w-4 text-green-500" />
                        ) : (
                          <PowerOff className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                      {/* View detail */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => navigate(`/providers/${p.id}`)}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Capabilities Matrix (if providers exist) */}
      {total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Capabilities Matrix</CardTitle>
            <CardDescription>Feature support across providers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium">Provider</th>
                    <th className="text-center py-2 px-2 font-medium">Chat</th>
                    <th className="text-center py-2 px-2 font-medium">Embed</th>
                    <th className="text-center py-2 px-2 font-medium">Tools</th>
                    <th className="text-center py-2 px-2 font-medium">Vision</th>
                    <th className="text-center py-2 px-2 font-medium">Stream</th>
                  </tr>
                </thead>
                <tbody>
                  {providers?.map((p) => {
                    const caps = (p.capabilities as string[]) || [];
                    const check = (cap: string) => caps.includes(cap);
                    return (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{p.name}</td>
                        {["chat", "embeddings", "tools", "vision", "streaming"].map((cap) => (
                          <td key={cap} className="text-center py-2 px-2">
                            {check(cap) ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                            ) : (
                              <XCircle className="h-4 w-4 text-muted-foreground/30 mx-auto" />
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
