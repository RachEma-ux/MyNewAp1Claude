import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  ArrowLeft, 
  Play, 
  CheckCircle2, 
  XCircle, 
  Clock,
  AlertCircle,
  FileText
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function WCPExecutionDetails() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const executionId = parseInt(params.id || "0");

  // Fetch execution data
  const { data: executions, isLoading } = trpc.wcpWorkflows.getExecutions.useQuery();
  const execution = executions?.find((e: any) => e.id === executionId);

  // Parse logs if available
  const logs = execution?.executionLog ? JSON.parse(execution.executionLog) : [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">Loading execution details...</div>
      </div>
    );
  }

  if (!execution) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground" />
        <div className="text-muted-foreground">Execution not found</div>
        <Button onClick={() => setLocation("/wcp/executions")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Executions
        </Button>
      </div>
    );
  }

  // Calculate duration
  const startedAt = new Date(execution.startedAt);
  const completedAt = execution.completedAt ? new Date(execution.completedAt) : null;
  const duration = completedAt 
    ? Math.round((completedAt.getTime() - startedAt.getTime()) / 1000) 
    : null;

  // Status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <div className="flex items-center gap-2 text-green-500">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-medium">Completed</span>
          </div>
        );
      case "failed":
        return (
          <div className="flex items-center gap-2 text-red-500">
            <XCircle className="w-5 h-5" />
            <span className="font-medium">Failed</span>
          </div>
        );
      case "running":
        return (
          <div className="flex items-center gap-2 text-blue-500">
            <Clock className="w-5 h-5 animate-spin" />
            <span className="font-medium">Running</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-2 text-gray-500">
            <Clock className="w-5 h-5" />
            <span className="font-medium">{status}</span>
          </div>
        );
    }
  };

  // Log status icon
  const getLogStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-500" />;
      case "running":
        return <Clock className="w-4 h-4 text-blue-500 animate-spin" />;
      case "pending":
        return <Clock className="w-4 h-4 text-gray-400" />;
      default:
        return <FileText className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/wcp/executions")}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Executions
        </Button>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2">
              {execution.workflowName}
            </h1>
            <p className="text-sm text-muted-foreground">
              Execution ID: {execution.id}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {getStatusBadge(execution.status)}
          </div>
        </div>
      </div>

      {/* Execution Summary */}
      <div className="max-w-6xl mx-auto mb-6">
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Execution Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          {execution.errorMessage && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <div className="flex items-start gap-2">
                <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
                <div>
                  <div className="font-medium text-red-500 mb-1">Error</div>
                  <div className="text-sm text-red-400">{execution.errorMessage}</div>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Execution Logs */}
      <div className="max-w-6xl mx-auto">
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Execution Timeline</h2>
          {logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No execution logs available
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((log: any, index: number) => (
                <div
                  key={index}
                  className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors"
                >
                  {/* Status Icon */}
                  <div className="mt-1">
                    {getLogStatusIcon(log.status)}
                  </div>

                  {/* Log Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{log.blockLabel}</span>
                      {log.blockType !== "system" && (
                        <span className="text-xs text-muted-foreground px-2 py-0.5 bg-background rounded">
                          {log.blockType}
                        </span>
                      )}
                      {log.duration !== undefined && (
                        <span className="text-xs text-muted-foreground">
                          ({log.duration}ms)
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mb-2">
                      {log.message}
                    </div>
                    {log.output && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-primary hover:underline">
                          View Output
                        </summary>
                        <pre className="mt-2 p-3 bg-background rounded border overflow-x-auto">
                          {JSON.stringify(log.output, null, 2)}
                        </pre>
                      </details>
                    )}
                    {log.error && (
                      <div className="mt-2 p-3 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-400">
                        {log.error}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-2">
                      {new Date(log.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Actions */}
      <div className="max-w-6xl mx-auto mt-6 flex gap-4">
        <Button
          variant="outline"
          onClick={() => setLocation(`/wcp/workflows/builder?id=${execution.workflowId}`)}
        >
          <FileText className="w-4 h-4 mr-2" />
          View Workflow
        </Button>
        {execution.status !== "running" && (
          <Button
            onClick={() => {
              // Re-run workflow (would need to implement this)
              alert("Re-run functionality coming soon!");
            }}
          >
            <Play className="w-4 h-4 mr-2" />
            Re-run Workflow
          </Button>
        )}
      </div>
    </div>
  );
}
