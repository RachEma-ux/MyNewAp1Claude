import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Play,
  RotateCcw,
  Eye,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function AutomationExecutionDetails() {
  const [, params] = useRoute("/automation/executions/:id");
  const [, setLocation] = useLocation();
  const executionId = params?.id ? parseInt(params.id) : null;

  // Fetch execution data
  const { data: executionsData, isLoading } = trpc.automation.getExecutions.useQuery({ limit: 100 });
  const execution = executionsData?.find((e: any) => e.id === executionId);

  // Fetch execution logs
  const { data: logs = [] } = trpc.automation.getExecutionLogs.useQuery(
    { executionId: executionId! },
    { enabled: !!executionId }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading execution details...</p>
        </div>
      </div>
    );
  }

  if (!execution) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Execution Not Found</h2>
          <p className="text-muted-foreground mb-4">
            The execution you're looking for doesn't exist or has been deleted.
          </p>
          <Button onClick={() => setLocation("/automation/executions")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Executions
          </Button>
        </div>
      </div>
    );
  }

  const startedAt = new Date(execution.startedAt);
  const completedAt = execution.completedAt ? new Date(execution.completedAt) : null;
  const duration = execution.duration ? Math.floor(execution.duration / 1000) : null;

  const getStatusBadge = (status: string) => {
    const config: Record<
      string,
      { variant: "default" | "secondary" | "destructive" | "outline"; icon: any }
    > = {
      pending: { variant: "secondary", icon: Clock },
      running: { variant: "default", icon: Play },
      completed: { variant: "outline", icon: CheckCircle2 },
      failed: { variant: "destructive", icon: XCircle },
      cancelled: { variant: "secondary", icon: AlertCircle },
    };

    const { variant, icon: Icon } = config[status] || config.pending;

    return (
      <Badge variant={variant} className="gap-1">
        <Icon className="w-3 h-3" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getLogStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-green-500 bg-green-500/10 border-green-500/20";
      case "failed":
        return "text-red-500 bg-red-500/10 border-red-500/20";
      case "running":
        return "text-blue-500 bg-blue-500/10 border-blue-500/20";
      case "skipped":
        return "text-yellow-500 bg-yellow-500/10 border-yellow-500/20";
      default:
        return "text-gray-500 bg-gray-500/10 border-gray-500/20";
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => setLocation("/automation/executions")}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Executions
        </Button>

        <Card className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">
                {execution.workflowName || "Unnamed Workflow"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Execution ID: {execution.id}
              </p>
            </div>
            {getStatusBadge(execution.status)}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Started At</div>
              <div className="font-medium">
                {formatDistanceToNow(startedAt, { addSuffix: true })}
              </div>
              <div className="text-xs text-muted-foreground">
                {startedAt.toLocaleString()}
              </div>
            </div>
            {completedAt && (
              <div>
                <div className="text-sm text-muted-foreground mb-1">Completed At</div>
                <div className="font-medium">
                  {formatDistanceToNow(completedAt, { addSuffix: true })}
                </div>
                <div className="text-xs text-muted-foreground">
                  {completedAt.toLocaleString()}
                </div>
              </div>
            )}
            {duration !== null && (
              <div>
                <div className="text-sm text-muted-foreground mb-1">Duration</div>
                <div className="font-medium">
                  {duration < 60 
                    ? `${duration} seconds` 
                    : `${Math.floor(duration / 60)}m ${duration % 60}s`}
                </div>
              </div>
            )}
          </div>
          {execution.error && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <div className="flex items-start gap-2">
                <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
                <div>
                  <div className="font-medium text-red-500 mb-1">Error</div>
                  <div className="text-sm text-red-400">{execution.error}</div>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Execution Logs */}
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-4">Execution Timeline</h2>
        {logs.length === 0 ? (
          <Card className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No execution logs available</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {logs.map((log: any, index: number) => {
              const logStartedAt = new Date(log.startedAt);
              const logCompletedAt = log.completedAt ? new Date(log.completedAt) : null;
              const logDuration = log.duration ? Math.floor(log.duration / 1000) : null;

              return (
                <Card key={index} className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Status Indicator */}
                    <div className="flex-shrink-0">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${getLogStatusColor(
                          log.status
                        )}`}
                      >
                        {log.status === "completed" && <CheckCircle2 className="w-5 h-5" />}
                        {log.status === "failed" && <XCircle className="w-5 h-5" />}
                        {log.status === "running" && <Play className="w-5 h-5" />}
                        {log.status === "skipped" && <AlertCircle className="w-5 h-5" />}
                      </div>
                    </div>

                    {/* Log Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h3 className="font-semibold">
                            {log.nodeLabel || log.nodeType || "Unknown Block"}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {log.nodeType} • Node ID: {log.nodeId}
                          </p>
                        </div>
                        <Badge variant="outline" className="ml-2">
                          {log.status}
                        </Badge>
                      </div>

                      <div className="text-sm text-muted-foreground mb-2">
                        <Clock className="w-3 h-3 inline mr-1" />
                        Started: {logStartedAt.toLocaleTimeString()}
                        {logCompletedAt && (
                          <>
                            {" • "}
                            Completed: {logCompletedAt.toLocaleTimeString()}
                          </>
                        )}
                        {logDuration !== null && (
                          <>
                            {" • "}
                            Duration: {logDuration}ms
                          </>
                        )}
                      </div>

                      {log.message && (
                        <div className="text-sm mb-2">{log.message}</div>
                      )}

                      {log.output && (
                        <details className="text-sm">
                          <summary className="cursor-pointer text-primary hover:underline">
                            View Output
                          </summary>
                          <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-x-auto">
                            {typeof log.output === "string"
                              ? log.output
                              : JSON.stringify(log.output, null, 2)}
                          </pre>
                        </details>
                      )}

                      {log.error && (
                        <div className="mt-2 p-3 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-400">
                          {log.error}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => setLocation(`/automation/builder?id=${execution.workflowId}`)}
        >
          <Eye className="w-4 h-4 mr-2" />
          View Workflow
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            // TODO: Implement re-run functionality
            alert("Re-run functionality coming soon!");
          }}
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Re-run
        </Button>
      </div>
    </div>
  );
}
