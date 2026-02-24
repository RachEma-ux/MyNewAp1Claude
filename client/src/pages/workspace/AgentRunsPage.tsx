/**
 * Agent Runs — Run history with status and detail links
 */

import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, CheckCircle2, XCircle, Clock, Play } from "lucide-react";

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="h-4 w-4 text-yellow-500" />,
  running: <Play className="h-4 w-4 text-blue-500" />,
  completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
};

export function AgentRunsPage({ workspaceId }: { workspaceId: number }) {
  const { data: runs, isLoading } = trpc.modules.agentOrch.runs.list.useQuery({ workspaceId });

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Activity className="h-6 w-6" />
        Agent Runs
      </h1>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : runs && runs.length > 0 ? (
        <div className="space-y-2">
          {runs.map((run) => (
            <Link key={run.id} href={`/w/${workspaceId}/agents/runs/${run.id}`}>
              <Card className="cursor-pointer hover:border-primary/30 transition-colors">
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {statusIcons[run.status] || <Activity className="h-4 w-4" />}
                    <div>
                      <p className="text-sm font-medium">
                        Run #{run.id}
                        <span className="text-muted-foreground ml-2">
                          Agent #{run.agentId}
                        </span>
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span>{new Date(run.createdAt).toLocaleString()}</span>
                        {run.startedAt && run.completedAt && (
                          <span>
                            Duration:{" "}
                            {Math.round(
                              (new Date(run.completedAt).getTime() -
                                new Date(run.startedAt).getTime()) /
                                1000
                            )}s
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      run.status === "completed"
                        ? "text-green-500"
                        : run.status === "failed"
                        ? "text-red-500"
                        : run.status === "running"
                        ? "text-blue-500"
                        : ""
                    }`}
                  >
                    {run.status}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No agent runs yet.</p>
        </div>
      )}
    </div>
  );
}
