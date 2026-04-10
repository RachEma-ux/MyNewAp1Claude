import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  Zap, Database, Route, BarChart3, HeartPulse, Activity,
  Plug, FlaskConical, ShieldCheck, CheckCircle, XCircle, AlertTriangle,
} from "lucide-react";

export default function OpenRouterHomePage() {
  const config = trpc.openRouter.config.get.useQuery();
  const usage = trpc.openRouter.usage.summary.useQuery();
  const health = trpc.openRouter.config.health.useQuery();
  const models = trpc.openRouter.models.list.useQuery({ limit: 1 });
  const defaultProfile = trpc.openRouter.routing.getDefault.useQuery();
  const recentActivity = trpc.openRouter.activity.list.useQuery({ limit: 5 });

  const cfg = config.data;
  const u = usage.data;
  const h = health.data;

  const isReady = cfg?.configured && cfg?.enabled;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Module header with readiness signal */}
      <div className="flex items-start gap-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-orange-500/10 shrink-0">
          <Zap className="w-5 h-5 text-orange-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">OpenRouter</h3>
            <ReadinessBadge configured={cfg?.configured} enabled={cfg?.enabled} health={h?.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Unified model gateway — connect once, route to any provider with governance
          </p>
        </div>
      </div>

      {/* Readiness checklist (only when not fully ready) */}
      {!isReady && (
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardContent className="pt-4 pb-3 space-y-2">
            <div className="text-sm font-medium mb-2">Getting started</div>
            <ReadinessItem done={!!cfg?.configured} label="Connect API key" href="/openrouter/connect" />
            <ReadinessItem done={!!cfg?.enabled} label="Enable module" href="/openrouter/connect" />
            <ReadinessItem done={!!cfg?.lastSyncAt} label="Sync model catalog" href="/openrouter/connect" />
            <ReadinessItem done={(models.data?.total ?? 0) > 0} label="Browse available models" href="/openrouter/models" />
          </CardContent>
        </Card>
      )}

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Models"
          value={String(models.data?.total ?? 0)}
          icon={Database}
          href="/openrouter/models"
          accent={models.data?.total ? "text-foreground" : "text-muted-foreground"}
        />
        <MetricCard
          label="Requests"
          value={String(u?.totalRequests ?? 0)}
          icon={BarChart3}
          href="/openrouter/usage"
        />
        <MetricCard
          label="Success"
          value={`${u?.successRate ?? 0}%`}
          icon={HeartPulse}
          href="/openrouter/health"
          accent={u?.successRate === 100 ? "text-green-500" : u?.successRate ? "text-foreground" : "text-muted-foreground"}
        />
        <MetricCard
          label="Avg Latency"
          value={u?.avgLatency ? `${u.avgLatency}ms` : "—"}
          icon={Activity}
          href="/openrouter/usage"
        />
      </div>

      {/* Operational state */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-3 pb-3 px-4 flex items-center gap-3">
            <Database className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Default Model</div>
              <div className="text-sm font-medium truncate mt-0.5">{cfg?.defaultModelId ?? "Not set"}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3 px-4 flex items-center gap-3">
            <Route className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Routing Profile</div>
              <div className="text-sm font-medium truncate mt-0.5">{defaultProfile.data?.name ?? "Not set"}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3 px-4 flex items-center gap-3">
            <ShieldCheck className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Governance</div>
              <div className="text-sm font-medium mt-0.5 text-green-500">Enforced</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ActionCard
          icon={Plug}
          title="Connect"
          desc={cfg?.configured ? "Connected — manage keys" : "Set up your API key"}
          href="/openrouter/connect"
          signal={cfg?.configured ? "ok" : "needed"}
        />
        <ActionCard
          icon={Route}
          title="Routing"
          desc={defaultProfile.data ? `Active: ${defaultProfile.data.name}` : "Configure routing"}
          href="/openrouter/routing"
        />
        <ActionCard
          icon={FlaskConical}
          title="Playground"
          desc="Test chat, embeddings, structured output"
          href="/openrouter/playground"
        />
      </div>

      {/* Recent activity */}
      {recentActivity.data && recentActivity.data.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" /> Recent Activity
              </CardTitle>
              <Link href="/openrouter/activity">
                <span className="text-[10px] text-primary hover:underline cursor-pointer">View all</span>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-1">
            {recentActivity.data.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-xs py-1">
                <Badge variant="outline" className="text-[9px] shrink-0">{a.action}</Badge>
                <span className="text-muted-foreground truncate flex-1">{a.details}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {new Date(a.createdAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Components ──────────────────────────────────────────────────

function ReadinessBadge({ configured, enabled, health }: { configured?: boolean; enabled?: boolean; health?: string }) {
  if (configured && enabled && health === "healthy") {
    return <Badge className="bg-green-600 text-[10px]">Ready</Badge>;
  }
  if (configured && enabled) {
    return <Badge variant="default" className="text-[10px]">Active</Badge>;
  }
  if (configured) {
    return <Badge variant="secondary" className="text-[10px]">Disabled</Badge>;
  }
  return <Badge variant="outline" className="text-[10px] text-orange-500 border-orange-500">Setup Required</Badge>;
}

function ReadinessItem({ done, label, href }: { done: boolean; label: string; href: string }) {
  return (
    <Link href={href}>
      <div className="flex items-center gap-2 text-xs py-0.5 cursor-pointer hover:text-foreground">
        {done ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground" />}
        <span className={done ? "text-muted-foreground line-through" : ""}>{label}</span>
      </div>
    </Link>
  );
}

function MetricCard({ label, value, icon: Icon, href, accent }: {
  label: string; value: string; icon: React.ElementType; href: string; accent?: string;
}) {
  return (
    <Link href={href}>
      <Card className="cursor-pointer hover:bg-muted/30 transition-colors h-full">
        <CardContent className="pt-3 pb-2.5 px-4">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Icon className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
          </div>
          <div className={`text-xl font-bold ${accent ?? "text-foreground"}`}>{value}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

function ActionCard({ icon: Icon, title, desc, href, signal }: {
  icon: React.ElementType; title: string; desc: string; href: string; signal?: "ok" | "needed";
}) {
  return (
    <Link href={href}>
      <Card className="cursor-pointer hover:bg-muted/30 transition-colors h-full">
        <CardContent className="pt-3.5 pb-3 px-4 flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-orange-500/10 shrink-0">
            <Icon className="w-4 h-4 text-orange-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{title}</div>
            <div className="text-xs text-muted-foreground truncate">{desc}</div>
          </div>
          {signal === "ok" && <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />}
          {signal === "needed" && <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />}
        </CardContent>
      </Card>
    </Link>
  );
}
