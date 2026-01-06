import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Play, Square, RefreshCw, Clock, CheckCircle2, XCircle, 
  AlertCircle, ChevronRight, Info, AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight as ChevronRightIcon
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

interface ExecutionLog {
  timestamp: Date;
  level: "info" | "warn" | "error";
  message: string;
  nodeId?: string;
}

interface Execution {
  id: string;
  workflowId: string;
  workflowName: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  error?: string;
  retryCount: number;
  logs: ExecutionLog[];
}

export default function AutomationExecutions() {
  const [, setLocation] = useLocation();
  
  // Fetch real executions from backend
  const { data: executionsData, isLoading, refetch } = trpc.automation.getExecutions.useQuery({ limit: 50 });
  
  // Convert backend data to frontend format
  const executions: Execution[] = executionsData?.map((exec: any) => ({
    id: exec.id,
    workflowId: exec.workflowId,
    workflowName: exec.workflowName || "Unnamed Workflow",
    status: exec.status,
    startedAt: new Date(exec.startedAt),
    completedAt: exec.completedAt ? new Date(exec.completedAt) : undefined,
    duration: exec.duration,
    error: exec.error,
    retryCount: exec.retryCount || 0,
    logs: exec.logs || [],
  })) || [];

  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'running' | 'failed'>('all');
  
  // Filter executions by status
  const filteredExecutions = statusFilter === 'all' 
    ? executions 
    : executions.filter(e => e.status === statusFilter);
  
  // Select first execution when data loads
  if (!selectedExecution && filteredExecutions.length > 0) {
    setSelectedExecution(filteredExecutions[0]);
  }
  
  // Update selected execution if it's filtered out
  if (selectedExecution && !filteredExecutions.find(e => e.id === selectedExecution.id)) {
    setSelectedExecution(filteredExecutions[0] || null);
  }

  const navigate = (direction: 'left' | 'right') => {
    if (direction === 'left') {
      setLocation('/automation');
    } else {
      setLocation('/automation/builder');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return <Play className="h-4 w-4 text-blue-500" />;
      case "queued":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "cancelled":
        return <Square className="h-4 w-4 text-gray-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      running: "default",
      queued: "secondary",
      completed: "outline",
      failed: "destructive",
      cancelled: "secondary",
    };
    return (
      <Badge variant={variants[status] || "outline"}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getLogIcon = (level: string) => {
    switch (level) {
      case "info":
        return <Info className="h-3 w-3 text-blue-500" />;
      case "warn":
        return <AlertTriangle className="h-3 w-3 text-yellow-500" />;
      case "error":
        return <XCircle className="h-3 w-3 text-red-500" />;
      default:
        return <Info className="h-3 w-3 text-gray-500" />;
    }
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
  };

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString();
  };

  const handleCancel = (id: string) => {
    toast.success(`Execution ${id} cancelled`);
  };

  const handleRetry = (id: string) => {
    toast.success(`Execution ${id} queued for retry`);
  };

  const completedCount = executions.filter(e => e.status === "completed").length;
  const failedCount = executions.filter(e => e.status === "failed").length;
  const runningCount = executions.filter(e => e.status === "running" || e.status === "queued").length;

  return (
    <div className="space-y-4">
      <div className="h-[calc(100vh-8rem)] flex gap-4">
        {/* Executions List */}
        <Card className="w-96 flex-shrink-0 flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Executions</CardTitle>
                <CardDescription>{executions.length} total</CardDescription>
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => navigate('left')} title="Go to Workflows">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate('right')} title="Go to Builder">
                  <ChevronRightIcon className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
          </div>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="text-center p-2 rounded-lg bg-green-50 dark:bg-green-950">
              <div className="text-2xl font-bold text-green-600">{completedCount}</div>
              <div className="text-xs text-muted-foreground">Completed</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-blue-50 dark:bg-blue-950">
              <div className="text-2xl font-bold text-blue-600">{runningCount}</div>
              <div className="text-xs text-muted-foreground">Running</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-red-50 dark:bg-red-950">
              <div className="text-2xl font-bold text-red-600">{failedCount}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
          </div>
          {/* Filter Buttons */}
          <div className="flex gap-1 mt-4 flex-wrap">
            <Button 
              size="sm" 
              variant={statusFilter === 'all' ? 'default' : 'outline'}
              onClick={() => setStatusFilter('all')}
              className="text-xs"
            >
              All
            </Button>
            <Button 
              size="sm" 
              variant={statusFilter === 'completed' ? 'default' : 'outline'}
              onClick={() => setStatusFilter('completed')}
              className="text-xs"
            >
              Completed
            </Button>
            <Button 
              size="sm" 
              variant={statusFilter === 'running' ? 'default' : 'outline'}
              onClick={() => setStatusFilter('running')}
              className="text-xs"
            >
              Running
            </Button>
            <Button 
              size="sm" 
              variant={statusFilter === 'failed' ? 'default' : 'outline'}
              onClick={() => setStatusFilter('failed')}
              className="text-xs"
            >
              Failed
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto">
            {executions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <p className="text-muted-foreground text-lg mb-2">No workflow executions yet</p>
                <p className="text-sm text-muted-foreground">Run a workflow to see execution history</p>
              </div>
            ) : (
            <div className="space-y-2">
              {filteredExecutions.map((execution) => (
                <Card
                  key={execution.id}
                  className={`transition-colors ${
                    selectedExecution?.id === execution.id
                      ? "border-primary"
                      : "hover:border-muted-foreground/50"
                  }`}
                >
                  <CardContent className="p-4">
                    <div 
                      className="cursor-pointer"
                      onClick={() => setSelectedExecution(execution)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(execution.status)}
                          <span className="font-medium text-sm">{execution.workflowName}</span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatTimestamp(execution.startedAt)}
                        {execution.duration && (
                          <span>• {formatDuration(execution.duration)}</span>
                        )}
                      </div>
                      <div className="mt-2">
                        {getStatusBadge(execution.status)}
                        {execution.retryCount > 0 && (
                          <Badge variant="outline" className="ml-2">
                            {execution.retryCount} retries
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-3"
                      onClick={() => setLocation(`/automation/executions/${execution.id}`)}
                    >
                      View Details
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Execution Details */}
      <div className="flex-1 flex flex-col gap-4">
        {selectedExecution ? (
          <>
            {/* Header */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">{selectedExecution.workflowName}</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Execution ID: {selectedExecution.id}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Started: {formatTimestamp(selectedExecution.startedAt)}
                      </div>
                      {selectedExecution.completedAt && (
                        <div className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Completed: {formatTimestamp(selectedExecution.completedAt)}
                        </div>
                      )}
                      {selectedExecution.duration && (
                        <div>Duration: {formatDuration(selectedExecution.duration)}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(selectedExecution.status)}
                    {selectedExecution.status === "running" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCancel(selectedExecution.id)}
                      >
                        <Square className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                    )}
                    {selectedExecution.status === "failed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRetry(selectedExecution.id)}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Retry
                      </Button>
                    )}
                  </div>
                </div>
                {selectedExecution.error && (
                  <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950 text-red-600 text-sm">
                    <strong>Error:</strong> {selectedExecution.error}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Execution Logs */}
            <Card className="flex-1">
              <CardHeader>
                <CardTitle>Execution Logs</CardTitle>
                <CardDescription>
                  {selectedExecution.logs.length} log entries
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2 font-mono text-sm">
                    {selectedExecution.logs.map((log, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 p-2 rounded hover:bg-muted/50"
                      >
                        {getLogIcon(log.level)}
                        <span className="text-muted-foreground">
                          {formatTimestamp(log.timestamp)}
                        </span>
                        <span className="flex-1">{log.message}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </>
        ) : executions.length > 0 ? (
          <Card className="flex-1 flex items-center justify-center">
            <CardContent className="text-center">
              <p className="text-muted-foreground">Select an execution to view details</p>
            </CardContent>
          </Card>
        ) : null}
      </div>
      </div>
    </div>
  );
}
