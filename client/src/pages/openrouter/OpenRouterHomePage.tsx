import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Zap, Database, Route, BarChart3, HeartPulse, Activity, Plug, FlaskConical } from "lucide-react";

export default function OpenRouterHomePage() {
  const config = trpc.openRouter.config.get.useQuery();
  const usage = trpc.openRouter.usage.summary.useQuery();
  const health = trpc.openRouter.config.health.useQuery();
  const models = trpc.openRouter.models.list.useQuery({ limit: 1 });
  const defaultProfile = trpc.openRouter.routing.getDefault.useQuery();
  const recentActivity = trpc.openRouter.activity.list.useQuery({ limit: 5 });

  const cfg = config.data;
  const u = usage.data;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Status banner */}
      <div className="flex items-center gap-3">
        <Zap className="w-6 h-6 text-orange-500" />
        <div>
          <h3 className="text-lg font-semibold">OpenRouter</h3>
          <p className="text-sm text-muted-foreground">Unified model gateway — routing, testing, and governance</p>
        </div>
        <Badge variant={cfg?.enabled ? "default" : "secondary"} className="ml-auto">
          {cfg?.enabled ? "Active" : cfg?.configured ? "Disabled" : "Not Connected"}
        </Badge>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Models" value={String(models.data?.total ?? 0)} icon={Database} href="/openrouter/models" />
        <StatCard title="Requests" value={String(u?.totalRequests ?? 0)} icon={BarChart3} href="/openrouter/usage" />
        <StatCard title="Success Rate" value={`${u?.successRate ?? 0}%`} icon={HeartPulse} href="/openrouter/health" />
        <StatCard title="Avg Latency" value={`${u?.avgLatency ?? 0}ms`} icon={Activity} href="/openrouter/usage" />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ActionCard icon={Plug} title="Connect" desc={cfg?.configured ? "Connected — manage keys" : "Set up API key"} href="/openrouter/connect" />
        <ActionCard icon={Route} title="Routing" desc={defaultProfile.data?.name ?? "Configure routing presets"} href="/openrouter/routing" />
        <ActionCard icon={FlaskConical} title="Playground" desc="Test models with chat & embeddings" href="/openrouter/playground" />
      </div>

      {/* Default model + routing */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground">Default Model</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <span className="text-sm font-medium">{cfg?.defaultModelId ?? "Not set"}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground">Routing Profile</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <span className="text-sm font-medium">{defaultProfile.data?.name ?? "Not set"}</span>
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      {recentActivity.data && recentActivity.data.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-1">
            {recentActivity.data.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-xs py-1">
                <Badge variant="outline" className="text-[9px]">{a.action}</Badge>
                <span className="text-muted-foreground truncate flex-1">{a.details}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{new Date(a.createdAt).toLocaleTimeString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, href }: { title: string; value: string; icon: React.ElementType; href: string }) {
  return (
    <Link href={href}>
      <Card className="cursor-pointer hover:bg-muted/30 transition-colors">
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center gap-2 mb-1">
            <Icon className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{title}</span>
          </div>
          <div className="text-xl font-bold">{value}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

function ActionCard({ icon: Icon, title, desc, href }: { icon: React.ElementType; title: string; desc: string; href: string }) {
  return (
    <Link href={href}>
      <Card className="cursor-pointer hover:bg-muted/30 transition-colors">
        <CardContent className="pt-4 pb-3 px-4 flex items-center gap-3">
          <Icon className="w-5 h-5 text-orange-500 shrink-0" />
          <div>
            <div className="text-sm font-medium">{title}</div>
            <div className="text-xs text-muted-foreground">{desc}</div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
