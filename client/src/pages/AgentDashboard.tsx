import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Play, Pause, Square, Activity, Clock, CheckCircle2, XCircle, 
  AlertCircle, Bot, Wrench, BarChart3, RefreshCw 
} from "lucide-react";
import { toast } from "sonner";

interface AgentExecution {
  id: string;
  agentId: string;
  agentName: string;
  status: "running" | "paused" | "completed" | "failed";
  startedAt: Date;
  completedAt?: Date;
  toolsUsed: number;
  currentStep?: string;
  progress: number;
}

interface ToolUsage {
  toolName: string;
  count: number;
  avgDuration: number;
}

export default function AgentDashboard() {
  const [executions] = useState<AgentExecution[]>([
    {
      id: "exec-1",
      agentId: "agent-1",
      agentName: "Data Analyzer",
      status: "running",
      startedAt: new Date(Date.now() - 300000),
      toolsUsed: 5,
      currentStep: "Processing dataset chunk 3/10",
      progress: 30,
    },
    {
      id: "exec-2",
      agentId: "agent-2",
      agentName: "Code Reviewer",
      status: "completed",
      startedAt: new Date(Date.now() - 600000),
      completedAt: new Date(Date.now() - 120000),
      toolsUsed: 12,
      progress: 100,
    },
    {
      id: "exec-3",
      agentId: "agent-3",
      agentName: "Content Generator",
      status: "paused",
      startedAt: new Date(Date.now() - 900000),
      toolsUsed: 3,
      currentStep: "Waiting for user input",
      progress: 45,
    },
  ]);

  const [toolStats] = useState<ToolUsage[]>([
    { toolName: "web_search", count: 24, avgDuration: 1200 },
    { toolName: "code_analyzer", count: 18, avgDuration: 3500 },
    { toolName: "file_reader", count: 32, avgDuration: 450 },
    { toolName: "database_query", count: 15, avgDuration: 890 },
  ]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return <Activity className="h-4 w-4 text-blue-500" />;
      case "paused":
        return <Pause className="h-4 w-4 text-yellow-500" />;
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      running: "default",
      paused: "secondary",
      completed: "outline",
      failed: "destructive",
    };
    return (
      <Badge variant={variants[status] || "outline"}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const handlePause = (id: string) => {
    toast.success(`Agent execution ${id} paused`);
  };

  const handleResume = (id: string) => {
    toast.success(`Agent execution ${id} resumed`);
  };

  const handleTerminate = (id: string) => {
    toast.success(`Agent execution ${id} terminated`);
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const activeExecutions = executions.filter(e => e.status === "running" || e.status === "paused");
  const completedToday = executions.filter(e => e.status === "completed").length;
  const totalToolCalls = toolStats.reduce((sum, t) => sum + t.count, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Agent Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Monitor and control agent executions
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Agents</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeExecutions.length}</div>
            <p className="text-xs text-muted-foreground">
              Currently running or paused
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedToday}</div>
            <p className="text-xs text-muted-foreground">
              Successfully finished executions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tool Calls</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalToolCalls}</div>
            <p className="text-xs text-muted-foreground">
              Across all agents today
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Active Executions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Active Executions</CardTitle>
              <CardDescription>Real-time agent execution monitoring</CardDescription>
            </div>
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-4">
              {executions.map((execution) => (
                <Card key={execution.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Bot className="h-6 w-6 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold">{execution.agentName}</h3>
                            {getStatusBadge(execution.status)}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Started {formatDuration(Date.now() - execution.startedAt.getTime())} ago
                            </div>
                            <div className="flex items-center gap-1">
                              <Wrench className="h-3 w-3" />
                              {execution.toolsUsed} tools used
                            </div>
                          </div>
                          {execution.currentStep && (
                            <p className="text-sm text-muted-foreground mb-2">
                              {execution.currentStep}
                            </p>
                          )}
                          {/* Progress Bar */}
                          <div className="w-full bg-secondary rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full transition-all"
                              style={{ width: `${execution.progress}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {execution.progress}% complete
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {execution.status === "running" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePause(execution.id)}
                          >
                            <Pause className="h-4 w-4" />
                          </Button>
                        )}
                        {execution.status === "paused" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleResume(execution.id)}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        {(execution.status === "running" || execution.status === "paused") && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleTerminate(execution.id)}
                          >
                            <Square className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Tool Usage Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>Tool Usage Statistics</CardTitle>
          <CardDescription>Most frequently used tools and their performance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {toolStats.map((tool) => (
              <div key={tool.toolName} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-secondary">
                    <Wrench className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium">{tool.toolName}</p>
                    <p className="text-sm text-muted-foreground">
                      {tool.count} calls • Avg {tool.avgDuration}ms
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{tool.count}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
