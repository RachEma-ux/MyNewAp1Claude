import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Clock, Play, Edit, Trash2, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";

export default function WCPWorkflowsList() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Load workflows from database
  const { data: workflows = [], isLoading, refetch } = trpc.wcpWorkflows.getWorkflows.useQuery();
  const deleteWorkflowMutation = trpc.wcpWorkflows.deleteWorkflow.useMutation();
  const createExecutionMutation = trpc.wcpWorkflows.createExecution.useMutation();

  const handleDelete = async (id: number) => {
    try {
      await deleteWorkflowMutation.mutateAsync({ id });
      toast({
        title: "Workflow Deleted",
        description: "Workflow has been deleted successfully",
      });
      refetch();
    } catch (error: any) {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading workflows...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">WCP Workflows</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Create and manage WCP-compliant workflows
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setLocation("/wcp/executions")}
            >
              Executions
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button onClick={() => setLocation("/wcp/workflows/builder")}>
              <Plus className="w-4 h-4 mr-2" />
              New Workflow
            </Button>
          </div>
        </div>

        {/* Workflows Grid */}
        {workflows.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Plus className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No workflows yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first WCP workflow to get started
              </p>
              <Button onClick={() => setLocation("/wcp/workflows/builder")}>
                <Plus className="w-4 h-4 mr-2" />
                Create Workflow
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workflows.map((workflow: any) => {
              const nodesCount = workflow.nodes ? (Array.isArray(workflow.nodes) ? workflow.nodes.length : 0) : 0;
              const edgesCount = workflow.edges ? (Array.isArray(workflow.edges) ? workflow.edges.length : 0) : 0;
              
              return (
                <Card key={workflow.id} className="p-4 hover:shadow-lg transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-1">{workflow.name}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {workflow.description || "No description"}
                      </p>
                    </div>
                    <div
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        workflow.status === "active"
                          ? "bg-green-500/10 text-green-500"
                          : "bg-gray-500/10 text-gray-500"
                      }`}
                    >
                      {workflow.status}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                    <span>{nodesCount} blocks</span>
                    <span>•</span>
                    <span>{edgesCount} connections</span>
                  </div>

                  {workflow.lastRunAt && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
                      <Clock className="w-3 h-3" />
                      <span>Last run: {new Date(workflow.lastRunAt).toLocaleString()}</span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setLocation(`/wcp/workflows/builder?id=${workflow.id}`)}
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      disabled={createExecutionMutation.isLoading}
                      onClick={async () => {
                        console.log('Run button clicked for workflow:', workflow.id, workflow.name);
                        try {
                          const result = await createExecutionMutation.mutateAsync({
                            workflowId: workflow.id,
                            workflowName: workflow.name,
                            status: "running",
                          });
                          console.log('Execution created:', result);
                          toast({
                            title: "Workflow Started",
                            description: `${workflow.name} is now running`,
                          });
                          // Navigate to executions page after a short delay
                          setTimeout(() => {
                            setLocation("/wcp/executions");
                          }, 500);
                        } catch (error: any) {
                          console.error('Run failed:', error);
                          toast({
                            title: "Run Failed",
                            description: error.message || 'Unknown error occurred',
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      <Play className="w-4 h-4 mr-1" />
                      Run
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleDelete(workflow.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
