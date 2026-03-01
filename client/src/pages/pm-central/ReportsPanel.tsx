import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { BarChart3, Clock, ShieldCheck, Activity, TrendingUp, Loader2 } from "lucide-react";

export default function ReportsPanel() {
  const projectsQuery = trpc.modules.pmt.shell.projects.list.useQuery();
  const allProjects = projectsQuery.data ?? [];

  const activeProjects = allProjects.filter((p: any) =>
    !["closed", "archived", "rejected"].includes(p.status)
  );
  const closedProjects = allProjects.filter((p: any) =>
    ["closed", "archived"].includes(p.status)
  );

  // State distribution
  const stateCounts: Record<string, number> = {};
  allProjects.forEach((p: any) => {
    stateCounts[p.status] = (stateCounts[p.status] || 0) + 1;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground mt-1">
          Portfolio analytics — gate throughput, lifecycle timing, and project status distribution
        </p>
      </div>

      {projectsQuery.isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      )}

      {/* Top-level metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allProjects.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <Activity className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeProjects.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Closed</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{closedProjects.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {allProjects.length > 0
                ? Math.round((closedProjects.length / allProjects.length) * 100)
                : 0}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* State distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project State Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          {allProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No project data available yet. Create projects in PM Shell to see distribution.
            </p>
          ) : (
            <div className="space-y-3">
              {Object.entries(stateCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([state, count]) => {
                  const pct = Math.round((count / allProjects.length) * 100);
                  return (
                    <div key={state} className="flex items-center gap-3">
                      <span className="text-sm w-40 capitalize">
                        {state.replace(/_/g, " ")}
                      </span>
                      <div className="flex-1 bg-muted rounded-full h-2.5">
                        <div
                          className="bg-primary rounded-full h-2.5 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium w-12 text-right">{count}</span>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gate throughput */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Gate Throughput
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-4">
            {[
              { id: "G0", name: "Intake", color: "bg-blue-500" },
              { id: "G1", name: "Planning Auth", color: "bg-indigo-500" },
              { id: "G2", name: "Change Control", color: "bg-orange-500" },
              { id: "G3", name: "Compliance", color: "bg-emerald-500" },
              { id: "G4", name: "Closure", color: "bg-purple-500" },
            ].map((gate) => (
              <div key={gate.id} className="text-center space-y-2">
                <Badge variant="outline">{gate.id}</Badge>
                <div className="text-lg font-bold text-muted-foreground">—</div>
                <div className="text-xs text-muted-foreground">{gate.name}</div>
                <div className="flex justify-center gap-1">
                  <span className="text-xs text-green-500">0 pass</span>
                  <span className="text-xs text-muted-foreground">/</span>
                  <span className="text-xs text-red-500">0 fail</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Gate pass/fail metrics will populate as projects progress through governance gates.
          </p>
        </CardContent>
      </Card>

      {/* Lifecycle timing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Average Time per Lifecycle Stage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { stage: "Draft → Intake", time: "—" },
              { stage: "Planning", time: "—" },
              { stage: "Executing", time: "—" },
              { stage: "Closing", time: "—" },
            ].map((item) => (
              <div key={item.stage} className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-sm text-muted-foreground">{item.stage}</div>
                <div className="text-xl font-bold mt-1">{item.time}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Stage duration averages will be calculated from state transition timestamps.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
