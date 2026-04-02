/**
 * PRM Dashboard — Open cases, overdue actions, severity mix, KPIs
 */
import { trpc } from "@/lib/trpc";
import { Loader2, AlertTriangle, CheckCircle2, Clock, Wrench } from "lucide-react";

export default function PRMDashboardPage() {
  const { data: health } = trpc.prm.health.useQuery();
  const { data: kpis, isLoading } = trpc.prm.analytics.dashboard.useQuery(undefined, {
    enabled: !!health?.connected,
  });

  if (!health?.connected) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Wrench className="h-5 w-5 text-orange-500" />
          PRM — Problem Resolution Methods
        </h1>
        <div className="border rounded-lg p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Connect to PRMDB to begin. The PRM module uses a dedicated PostgreSQL database.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Set <code>DATABASE_URL_PRMDB</code> or ensure the <code>prmdb</code> database exists.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  const cases = kpis?.cases || { totalCases: 0, openCases: 0, criticalOpen: 0, closedCases: 0, cancelledCases: 0, reopenedCases: 0 };
  const actions = kpis?.actions || { totalActions: 0, overdueActions: 0, pendingActions: 0, completedActions: 0 };
  const methods = kpis?.methods || { totalRuns: 0, completedRuns: 0 };

  const cards = [
    { label: "Open Cases", value: cases.openCases, icon: Clock, color: "text-blue-500" },
    { label: "Critical", value: cases.criticalOpen, icon: AlertTriangle, color: "text-red-500" },
    { label: "Overdue Actions", value: actions.overdueActions, icon: AlertTriangle, color: "text-orange-500" },
    { label: "Closed", value: cases.closedCases, icon: CheckCircle2, color: "text-green-500" },
  ];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <Wrench className="h-5 w-5 text-orange-500" />
        PRM Dashboard
      </h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <card.icon className={`h-4 w-4 ${card.color}`} />
              <span className="text-xs text-muted-foreground">{card.label}</span>
            </div>
            <p className="text-2xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">Status Breakdown</h3>
          {kpis?.statusBreakdown?.length ? (
            <div className="space-y-1.5">
              {kpis.statusBreakdown.map((s: any) => (
                <div key={s.status} className="flex items-center justify-between text-xs">
                  <span className="capitalize">{s.status?.replace(/_/g, " ")}</span>
                  <span className="font-medium">{s.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No cases yet.</p>
          )}
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">Quick Stats</h3>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Cases</span>
              <span className="font-medium">{cases.totalCases}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Actions</span>
              <span className="font-medium">{actions.totalActions}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Method Runs</span>
              <span className="font-medium">{methods.totalRuns}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pending Actions</span>
              <span className="font-medium">{actions.pendingActions}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reopened</span>
              <span className="font-medium">{cases.reopenedCases}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
