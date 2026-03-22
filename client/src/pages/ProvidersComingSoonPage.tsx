import { lazy, Suspense } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Cloud,
  Server,
  Plus,
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plug,
  ArrowRight,
  Settings,
  BarChart3,
  Loader2,
  Shield,
  Zap,
} from "lucide-react";

const ProviderWizardPage = lazy(() => import("./ProviderWizardPage"));

function ProviderDashboard() {
  const [, navigate] = useLocation();
  const { data: providers, isLoading } = trpc.providers.list.useQuery({});

  const total = providers?.length ?? 0;
  const cloudCount = providers?.filter((p) => p.kind === "cloud" || (!p.kind && !["local-llamacpp", "local-ollama"].includes(p.type))).length ?? 0;
  const localCount = providers?.filter((p) => p.kind === "local" || ["local-llamacpp", "local-ollama"].includes(p.type)).length ?? 0;
  const enabledCount = providers?.filter((p) => p.enabled).length ?? 0;
  const disabledCount = total - enabledCount;

  // Lifecycle breakdown
  const activeCount = providers?.filter((p) => (p as any).lifecycleStatus === "active").length ?? 0;
  const suspendedCount = providers?.filter((p) => (p as any).lifecycleStatus === "suspended").length ?? 0;
  const configuredCount = total - activeCount - suspendedCount;

  const quickActions = [
    { label: "Add Provider", description: "Register a new LLM provider", icon: Plus, href: "/providers/wizard", color: "text-blue-500" },
    { label: "Connections", description: "View PAT-authenticated connections", icon: Plug, href: "/providers/connections", color: "text-green-500" },
    { label: "Control Panel", description: "Manage provider settings", icon: Settings, href: "/providers/control-panel", color: "text-purple-500" },
    { label: "Provider List", description: "Browse all registered providers", icon: Cloud, href: "/providers", color: "text-orange-500" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Provider Dashboard</h1>
          <p className="text-muted-foreground mt-1">Unified view of all LLM providers and their health</p>
        </div>
        <Button size="sm" onClick={() => navigate("/providers/wizard")}>
          <Plus className="h-4 w-4 mr-1" /> Add Provider
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Providers</CardTitle>
            <Cloud className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
            <p className="text-xs text-muted-foreground">{cloudCount} cloud, {localCount} local</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Enabled</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{enabledCount}</div>
            <p className="text-xs text-muted-foreground">{disabledCount} disabled</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <Activity className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{activeCount}</div>
            <p className="text-xs text-muted-foreground">{configuredCount} configured</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Suspended</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{suspendedCount}</div>
            <p className="text-xs text-muted-foreground">needs attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Provider Health Summary */}
      {total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Provider Overview</CardTitle>
            <CardDescription>Registered providers by type and status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {providers?.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/providers/${p.id}`)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {["local-llamacpp", "local-ollama"].includes(p.type) ? (
                      <Server className="h-4 w-4 text-orange-500 shrink-0" />
                    ) : (
                      <Cloud className="h-4 w-4 text-blue-500 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={p.enabled ? "default" : "secondary"} className="text-xs">
                      {p.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                    {(p as any).lifecycleStatus && (
                      <Badge variant="outline" className="text-xs">
                        {(p as any).lifecycleStatus}
                      </Badge>
                    )}
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <Card
              key={action.href}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => navigate(action.href)}
            >
              <CardHeader className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <action.icon className={`h-5 w-5 ${action.color}`} />
                  <CardTitle className="text-sm">{action.label}</CardTitle>
                </div>
                <CardDescription className="text-xs">{action.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {total === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Cloud className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Providers Registered</h3>
            <p className="text-muted-foreground text-center mb-4">
              Get started by registering your first LLM provider
            </p>
            <Button onClick={() => navigate("/providers/wizard")}>
              <Plus className="h-4 w-4 mr-2" /> Register Provider
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ProvidersComingSoonPage() {
  const [, params] = useRoute("/providers/:section");
  const section = params?.section ?? "dashboard";

  if (section === "wizard") {
    return (
      <Suspense fallback={null}>
        <ProviderWizardPage />
      </Suspense>
    );
  }

  return <ProviderDashboard />;
}
