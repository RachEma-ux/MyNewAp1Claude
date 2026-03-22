/**
 * InboxPage — Cross-project follow-up inbox
 *
 * Route: /pm-central/inbox
 * Aggregates attention items across ALL projects for the current user.
 */

import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  Inbox, CheckSquare, ShieldCheck, AlertTriangle,
  Lock, Clock, ListChecks, ArrowRight,
} from "lucide-react";

export default function InboxPage() {
  const [, setLocation] = useLocation();
  const projectsQuery = trpc.modules.pmt.shell.projects.list.useQuery();
  const allProjects = projectsQuery.data ?? [];

  // Categorize projects needing attention
  const frozenProjects = allProjects.filter((p: any) => p.status === "control_hold");
  const gatingProjects = allProjects.filter((p: any) =>
    ["intake_review", "plan_gate_pending", "close_gate_pending", "change_pending"].includes(p.status)
  );
  const executingProjects = allProjects.filter((p: any) =>
    ["authorized", "executing"].includes(p.status)
  );
  const draftProjects = allProjects.filter((p: any) => p.status === "draft_shell");

  const totalAttention = frozenProjects.length + gatingProjects.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Inbox className="h-7 w-7" />
            PM Inbox
          </h1>
          <p className="text-muted-foreground mt-1">
            Cross-project follow-ups — approvals, overdue items, freezes, and mentions
          </p>
        </div>
        {totalAttention > 0 && (
          <Badge variant="destructive" className="text-sm px-3 py-1">
            {totalAttention} items need attention
          </Badge>
        )}
      </div>

      {/* Frozen projects — highest priority */}
      {frozenProjects.length > 0 && (
        <Card className="border-red-500/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-red-500">
              <Lock className="h-4 w-4" />
              Projects on Control Hold ({frozenProjects.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {frozenProjects.map((p: any) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-3 rounded-lg bg-red-500/5 border border-red-500/20 cursor-pointer hover:border-red-500/50 transition-colors"
                onClick={() => setLocation(`/pm-central/p/${p.id}/freeze-holds`)}
              >
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">G3 compliance failure — execution frozen</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">Frozen</Badge>
                  <ArrowRight className="h-4 w-4 text-red-500" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Pending gate reviews */}
      {gatingProjects.length > 0 && (
        <Card className="border-yellow-500/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-yellow-500" />
              Pending Gate Reviews ({gatingProjects.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {gatingProjects.map((p: any) => {
              const gateLabel = p.status === "intake_review" ? "G0 Intake" :
                p.status === "plan_gate_pending" ? "G1 Planning" :
                p.status === "change_pending" ? "G2 Change" :
                "G4 Closure";
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => setLocation(`/pm-central/p/${p.id}/gates`)}
                >
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">Awaiting {gateLabel} evaluation</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-yellow-500 text-yellow-600">{gateLabel}</Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Active projects summary */}
      {executingProjects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-emerald-500" />
              Active Projects ({executingProjects.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {executingProjects.map((p: any) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setLocation(`/pm-central/p/${p.id}/follow-ups`)}
              >
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{p.status?.replace(/_/g, " ")}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Draft projects needing intake */}
      {draftProjects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-blue-500" />
              Drafts Needing Intake ({draftProjects.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {draftProjects.map((p: any) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setLocation(`/pm-central/p/${p.id}/charter`)}
              >
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">Complete charter and submit for G0 intake</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {allProjects.length === 0 && (
        <Card><CardContent className="py-12 text-center">
          <Inbox className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="text-lg font-medium">Inbox Empty</h3>
          <p className="text-muted-foreground mt-1">No projects yet. Create a project in PM Shell to get started.</p>
        </CardContent></Card>
      )}
    </div>
  );
}
