import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Zap, Clock, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RemediationTask {
  id: string;
  agentId: number;
  agentName: string;
  violationType: string;
  severity: "low" | "medium" | "high";
  status: "pending" | "in_progress" | "completed" | "failed";
  createdAt: Date;
  completedAt?: Date;
  result?: string;
}

export default function AutoRemediationPage() {
  const { toast } = useToast();
  const [remediationTasks, setRemediationTasks] = useState<RemediationTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isRemediating, setIsRemediating] = useState(false);

  // Queries
  const agentsQuery = trpc.agents.list.useQuery();

  // Mutations
  const remediateMutation = trpc.agents.autoRemediate.useMutation({
    onSuccess: (result) => {
      toast({
        title: "Remediation successful",
        description: result.message,
      });
      setIsRemediating(false);
      // Update task status
      setRemediationTasks((prev) =>
        prev.map((t) =>
          t.id === selectedTaskId
            ? {
                ...t,
                status: "completed",
                completedAt: new Date(),
                result: result.message,
              }
            : t
        )
      );
    },
    onError: (error) => {
      toast({
        title: "Remediation failed",
        description: error.message,
        variant: "destructive",
      });
      setIsRemediating(false);
    },
  });

  const handleAutoRemediate = async (task: RemediationTask) => {
    setIsRemediating(true);
    setSelectedTaskId(task.id);
    await remediateMutation.mutateAsync({
      agentId: task.agentId,
      violationType: task.violationType,
    });
  };

  const handleCreateRemediationTask = (agentId: number, agentName: string) => {
    const newTask: RemediationTask = {
      id: `task_${Date.now()}`,
      agentId,
      agentName,
      violationType: "temperature_out_of_range",
      severity: "medium",
      status: "pending",
      createdAt: new Date(),
    };
    setRemediationTasks((prev) => [newTask, ...prev]);
    toast({
      title: "Remediation task created",
      description: `Created task for ${agentName}`,
    });
  };

  const completedTasks = remediationTasks.filter((t) => t.status === "completed")
    .length;
  const failedTasks = remediationTasks.filter((t) => t.status === "failed").length;
  const pendingTasks = remediationTasks.filter((t) => t.status === "pending")
    .length;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Auto-Remediation</h1>
          <p className="text-gray-600 mt-1">
            Automatically fix policy violations and configuration drift
          </p>
        </div>
      </div>

      {/* Stats */}
      {remediationTasks.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4 bg-blue-50 border-blue-200">
            <div className="text-sm text-blue-600 font-semibold">
              Total Tasks
            </div>
            <div className="text-3xl font-bold text-blue-900 mt-2">
              {remediationTasks.length}
            </div>
          </Card>
          <Card className="p-4 bg-green-50 border-green-200">
            <div className="text-sm text-green-600 font-semibold">Completed</div>
            <div className="text-3xl font-bold text-green-900 mt-2">
              {completedTasks}
            </div>
          </Card>
          <Card className="p-4 bg-orange-50 border-orange-200">
            <div className="text-sm text-orange-600 font-semibold">Pending</div>
            <div className="text-3xl font-bold text-orange-900 mt-2">
              {pendingTasks}
            </div>
          </Card>
          <Card className="p-4 bg-red-50 border-red-200">
            <div className="text-sm text-red-600 font-semibold">Failed</div>
            <div className="text-3xl font-bold text-red-900 mt-2">
              {failedTasks}
            </div>
          </Card>
        </div>
      )}

      {/* Available Agents */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Create Remediation Tasks</h2>
        {agentsQuery.isLoading ? (
          <div className="text-center py-8 text-gray-500">Loading agents...</div>
        ) : agentsQuery.data && agentsQuery.data.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agentsQuery.data.map((agent) => (
              <div
                key={agent.id}
                className="p-4 border rounded-lg hover:border-blue-300 transition-all"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold">{agent.name}</h3>
                    <p className="text-sm text-gray-600">
                      Status: {agent.status}
                    </p>
                  </div>
                  <Badge variant="outline">{agent.roleClass}</Badge>
                </div>
                <Button
                  onClick={() =>
                    handleCreateRemediationTask(agent.id, agent.name)
                  }
                  size="sm"
                  className="w-full"
                >
                  <Zap className="h-3 w-3 mr-2" />
                  Create Task
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No agents available
          </div>
        )}
      </Card>

      {/* Remediation Tasks */}
      {remediationTasks.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Remediation Tasks</h2>
          {remediationTasks.map((task) => (
            <Card
              key={task.id}
              className={`p-4 cursor-pointer transition-all ${
                selectedTaskId === task.id
                  ? "border-blue-500 bg-blue-50"
                  : "hover:border-gray-400"
              }`}
              onClick={() =>
                setSelectedTaskId(
                  selectedTaskId === task.id ? null : task.id
                )
              }
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-start gap-3">
                  {task.status === "completed" ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-1" />
                  ) : task.status === "failed" ? (
                    <AlertCircle className="h-5 w-5 text-red-500 mt-1" />
                  ) : task.status === "in_progress" ? (
                    <Clock className="h-5 w-5 text-blue-500 mt-1 animate-spin" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-orange-500 mt-1" />
                  )}
                  <div>
                    <h3 className="font-semibold text-lg">{task.agentName}</h3>
                    <p className="text-sm text-gray-600">
                      Violation: {task.violationType}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Created: {task.createdAt.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Badge
                    variant={
                      task.severity === "high"
                        ? "destructive"
                        : task.severity === "medium"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {task.severity.charAt(0).toUpperCase() +
                      task.severity.slice(1)}
                  </Badge>
                  <Badge
                    variant={
                      task.status === "completed"
                        ? "default"
                        : task.status === "failed"
                          ? "destructive"
                          : task.status === "in_progress"
                            ? "secondary"
                            : "outline"
                    }
                  >
                    {task.status.charAt(0).toUpperCase() +
                      task.status.slice(1)}
                  </Badge>
                </div>
              </div>

              {/* Expanded Details */}
              {selectedTaskId === task.id && (
                <div className="mt-4 space-y-3 border-t pt-4">
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Task Details</h4>
                    <div className="bg-white p-3 rounded border border-gray-200 space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-gray-600 font-semibold">
                            Agent ID:
                          </span>
                          <div className="font-mono text-gray-700">
                            {task.agentId}
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-600 font-semibold">
                            Violation Type:
                          </span>
                          <div className="font-mono text-gray-700">
                            {task.violationType}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {task.result && (
                    <div>
                      <h4 className="font-semibold text-sm mb-2">Result</h4>
                      <div className="bg-green-50 p-3 rounded border border-green-200 text-sm text-green-800">
                        {task.result}
                      </div>
                    </div>
                  )}

                  {task.status === "pending" && (
                    <Button
                      onClick={() => handleAutoRemediate(task)}
                      disabled={isRemediating}
                      className="w-full mt-2"
                    >
                      <Zap className="h-3 w-3 mr-2" />
                      {isRemediating ? "Remediating..." : "Execute Remediation"}
                    </Button>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-12 text-center">
          <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700">
            No remediation tasks yet
          </h3>
          <p className="text-gray-600 mt-2">
            Create a task by selecting an agent above
          </p>
        </Card>
      )}
    </div>
  );
}
