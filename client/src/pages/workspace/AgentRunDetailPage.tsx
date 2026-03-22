/**
 * Agent Run Detail — Events, artifacts, output for a single run
 */

import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Activity, FileText, Clock } from "lucide-react";

export function AgentRunDetailPage({ workspaceId }: { workspaceId: number }) {
  const params = useParams<{ runId: string }>();
  const runId = parseInt(params.runId || "0", 10);

  const { data: run } = trpc.modules.agentOrch.runs.get.useQuery(
    { id: runId, workspaceId },
    { enabled: runId > 0 }
  );

  const { data: events } = trpc.modules.agentOrch.runs.events.useQuery(
    { runId, workspaceId },
    { enabled: runId > 0 }
  );

  const { data: artifacts } = trpc.modules.agentOrch.runs.artifacts.useQuery(
    { runId, workspaceId },
    { enabled: runId > 0 }
  );

  const utils = trpc.useUtils();
  const executeMut = trpc.modules.agentOrch.runs.execute.useMutation({
    onSuccess: () => utils.modules.agentOrch.runs.get.invalidate(),
  });
  const completeMut = trpc.modules.agentOrch.runs.complete.useMutation({
    onSuccess: () => utils.modules.agentOrch.runs.get.invalidate(),
  });

  if (!run) {
    return (
      <div className="p-6 text-muted-foreground">
        Run not found
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link href={`/w/${workspaceId}/agents/runs`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Run #{run.id}</h1>
          <p className="text-sm text-muted-foreground">Agent #{run.agentId}</p>
        </div>
        <div className="flex-1" />
        <Badge
          variant="outline"
          className={
            run.status === "completed"
              ? "text-green-500"
              : run.status === "failed"
              ? "text-red-500"
              : ""
          }
        >
          {run.status}
        </Badge>
      </div>

      {/* Info Cards */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="text-lg font-bold capitalize">{run.status}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-xs text-muted-foreground">Started</p>
            <p className="text-sm">
              {run.startedAt ? new Date(run.startedAt).toLocaleString() : "Not started"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-xs text-muted-foreground">Duration</p>
            <p className="text-sm">
              {run.startedAt && run.completedAt
                ? `${Math.round(
                    (new Date(run.completedAt).getTime() -
                      new Date(run.startedAt).getTime()) /
                      1000
                  )}s`
                : "-"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      {run.status === "pending" && (
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => executeMut.mutate({ id: run.id, workspaceId })}
            disabled={executeMut.isPending}
          >
            Execute
          </Button>
        </div>
      )}
      {run.status === "running" && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              completeMut.mutate({
                id: run.id,
                workspaceId,
                status: "completed",
              })
            }
          >
            Mark Complete
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() =>
              completeMut.mutate({
                id: run.id,
                workspaceId,
                status: "failed",
                errorMessage: "Manually stopped",
              })
            }
          >
            Mark Failed
          </Button>
        </div>
      )}

      {/* Error */}
      {run.errorMessage && (
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="py-3">
            <p className="text-sm text-red-500 font-medium">Error</p>
            <p className="text-xs mt-1">{run.errorMessage}</p>
          </CardContent>
        </Card>
      )}

      {/* Output */}
      {run.output && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Output</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted rounded-md p-3 overflow-auto max-h-64">
              {JSON.stringify(run.output, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Events */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Events ({events?.length || 0})
        </h2>
        {events && events.length > 0 ? (
          <div className="space-y-1">
            {events.map((evt) => (
              <div key={evt.id} className="flex items-center gap-3 text-sm border rounded-md p-2">
                <Badge variant="outline" className="text-[10px]">
                  {evt.eventType}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(evt.createdAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No events</p>
        )}
      </div>

      {/* Artifacts */}
      {artifacts && artifacts.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Artifacts ({artifacts.length})
          </h2>
          <div className="space-y-1">
            {artifacts.map((art) => (
              <Card key={art.id}>
                <CardContent className="py-2 text-sm">
                  <span className="font-medium">{art.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {art.contentType}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
