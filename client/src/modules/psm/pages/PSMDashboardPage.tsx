import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Library, FolderKanban, Compass, Activity, CheckCircle2, PlayCircle, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function PSMDashboardPage() {
  const [, navigate] = useLocation();
  const healthQuery = trpc.psm.health.useQuery();
  const summaryQuery = trpc.psm.analytics.summary.useQuery();
  const casesQuery = trpc.psm.cases.list.useQuery({ limit: 5 });

  const deleteMutation = trpc.psm.cases.delete.useMutation({
    onSuccess: () => { toast.success("Case deleted"); casesQuery.refetch(); summaryQuery.refetch(); },
    onError: () => toast.error("Failed to delete case"),
  });

  const health = healthQuery.data;
  const summary = summaryQuery.data;
  const cases = casesQuery.data ?? [];

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Problem Solving Methods</h1>
          <p className="text-xs text-muted-foreground">Browse methods, get recommendations, and run workflows</p>
        </div>
        <Badge variant={health?.connected ? "default" : "destructive"} className="text-[9px]">
          {health?.connected ? `PSMDB Connected (${health.tableCount} tables)` : "PSMDB Disconnected"}
        </Badge>
      </div>

      {/* My Cases — top action */}
      <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate("/psm/cases")}>
        <FolderKanban className="h-3 w-3 mr-1" /> My Cases
      </Button>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <Library className="h-8 w-8 text-teal-500 opacity-60" />
            <div>
              <p className="text-2xl font-bold">{summary?.methodCount ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground">Methods</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <FolderKanban className="h-8 w-8 text-blue-500 opacity-60" />
            <div>
              <p className="text-2xl font-bold">{summary?.caseCount ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground">Cases</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <PlayCircle className="h-8 w-8 text-amber-500 opacity-60" />
            <div>
              <p className="text-2xl font-bold">{summary?.activeRunCount ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground">Active Runs</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-green-500 opacity-60" />
            <div>
              <p className="text-2xl font-bold">{summary?.completedCaseCount ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2">
        <Button size="sm" className="text-xs" onClick={() => navigate("/psm/library")}>
          <Library className="h-3 w-3 mr-1" /> Browse Library
        </Button>
        <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate("/psm/selector")}>
          <Compass className="h-3 w-3 mr-1" /> Method Selector
        </Button>
      </div>

      {/* Recent Cases */}
      <Card>
        <CardContent className="p-3">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Activity className="h-3.5 w-3.5" /> Recent Cases
          </h3>
          {casesQuery.isLoading && (
            <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
          )}
          {!casesQuery.isLoading && cases.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No cases yet. Create one from the Selector or Cases page.</p>
          )}
          {cases.length > 0 && (
            <div className="space-y-1.5">
              {cases.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted/50 cursor-pointer text-xs"
                  onClick={() => navigate(`/psm/cases/${c.id}`)}>
                  <span className="truncate">{c.title}</span>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <Badge variant="outline" className="text-[9px] capitalize">{c.status}</Badge>
                    <button
                      title="Delete case"
                      className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete case "${c.title}"?`)) {
                          deleteMutation.mutate({ id: c.id });
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
