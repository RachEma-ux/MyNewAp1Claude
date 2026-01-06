import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RefreshCw, CheckCircle, XCircle, Clock, ArrowLeft, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export default function WCPExecutions() {
  const [, setLocation] = useLocation();

  // Load WCP executions from database
  const { data: executions = [], isLoading, refetch } = trpc.wcpWorkflows.getExecutions.useQuery();

  // Calculate stats
  const completedCount = executions.filter((e: any) => e.status === "completed").length;
  const runningCount = executions.filter((e: any) => e.status === "running").length;
  const failedCount = executions.filter((e: any) => e.status === "failed").length;

  const formatDuration = (startedAt: string, completedAt?: string) => {
    if (!completedAt) return "...";
    const start = new Date(startedAt).getTime();
    const end = new Date(completedAt).getTime();
    const durationSeconds = Math.floor((end - start) / 1000);
    return `${durationSeconds}s`;
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading executions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/wcp/workflows")}
              className="md:hidden"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">Executions</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {executions.length} total
              </p>
            </div>
          </div>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-6 bg-green-500/10 border-green-500/20">
            <div className="text-center">
              <div className="text-4xl font-bold text-green-500 mb-2">
                {completedCount}
              </div>
              <div className="text-sm text-green-500">Completed</div>
            </div>
          </Card>
          <Card className="p-6 bg-blue-500/10 border-blue-500/20">
            <div className="text-center">
              <div className="text-4xl font-bold text-blue-500 mb-2">
                {runningCount}
              </div>
              <div className="text-sm text-blue-500">Running</div>
            </div>
          </Card>
          <Card className="p-6 bg-red-500/10 border-red-500/20">
            <div className="text-center">
              <div className="text-4xl font-bold text-red-500 mb-2">
                {failedCount}
              </div>
              <div className="text-sm text-red-500">Failed</div>
            </div>
          </Card>
        </div>

        {/* Executions List */}
        {executions.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No executions yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Run a WCP workflow to see execution history here
              </p>
              <Button onClick={() => setLocation("/wcp/workflows")}>
                Go to Workflows
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {executions.map((execution: any) => (
              <Card
                key={execution.id}
                className={`p-4 ${
                  execution.status === "completed"
                    ? "border-l-4 border-l-green-500"
                    : execution.status === "failed"
                    ? "border-l-4 border-l-red-500"
                    : "border-l-4 border-l-blue-500"
                }`}
              >
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1">
                    {execution.status === "completed" ? (
                      <CheckCircle className="w-6 h-6 text-green-500" />
                    ) : execution.status === "failed" ? (
                      <XCircle className="w-6 h-6 text-red-500" />
                    ) : (
                      <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                    )}
                    <div className="flex-1">
                      <button
                        onClick={() => setLocation(`/wcp/executions/${execution.id}`)}
                        className="font-semibold text-lg hover:text-primary hover:underline text-left"
                      >
                        {execution.workflowName}
                      </button>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        <Clock className="w-3 h-3" />
                        <span>{formatTime(execution.startedAt)}</span>
                        <span>•</span>
                        <span>{formatDuration(execution.startedAt, execution.completedAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className={`px-3 py-1 rounded text-sm font-medium ${
                        execution.status === "completed"
                          ? "bg-green-500/10 text-green-500"
                          : execution.status === "failed"
                          ? "bg-red-500/10 text-red-500"
                          : "bg-blue-500/10 text-blue-500"
                      }`}
                    >
                      {execution.status.charAt(0).toUpperCase() + execution.status.slice(1)}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation(`/wcp/executions/${execution.id}`)}
                    >
                      View Details
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
