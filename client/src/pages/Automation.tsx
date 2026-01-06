import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, Plus, Play, Trash2, Edit, Clock, ArrowLeft, Home, ArrowRight, Mail, Database, Webhook, Timer, Zap as ZapIcon, GitBranch } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export default function Automation() {
  const [, setLocation] = useLocation();
  
  const handleBack = () => {
    setLocation("/");
  };
  const utils = trpc.useUtils();

  // Fetch workflows from database
  const { data: workflows, isLoading, error, status } = trpc.automation.listWorkflows.useQuery();
  console.log('[Automation] Query Status:', status);
  console.log('[Automation] isLoading:', isLoading);
  console.log('[Automation] workflows:', workflows);
  console.log('[Automation] error:', error);
  console.log('[Automation] workflows?.length:', workflows?.length);

  // Delete workflow mutation
  const deleteMutation = trpc.automation.deleteWorkflow.useMutation({
    onSuccess: () => {
      toast.success("Workflow deleted successfully");
      utils.automation.listWorkflows.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to delete workflow: ${error.message}`);
    },
  });

  const handleCreateWorkflow = () => {
    setLocation("/automation/builder");
  };

  const handleEditWorkflow = (workflowId: number) => {
    setLocation(`/automation/builder?id=${workflowId}`);
  };

  const handleDeleteWorkflow = (workflowId: number, workflowName: string) => {
    if (confirm(`Are you sure you want to delete "${workflowName}"?`)) {
      deleteMutation.mutate({ id: workflowId });
    }
  };

  const handleTestWorkflow = (workflow: any) => {
    toast.info("Starting workflow execution...");
    setLocation("/automation/executions");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "paused":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "draft":
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  const templates = [
    {
      id: 1,
      name: "Email Notification",
      description: "Send email notifications on trigger",
      icon: Mail,
      details: "Automatically send emails when specific events occur"
    },
    {
      id: 2,
      name: "Data Processing",
      description: "Process and transform data",
      icon: Database,
      details: "Transform and process incoming data with custom logic"
    },
    {
      id: 3,
      name: "Webhook Integration",
      description: "Trigger workflows via webhooks",
      icon: Webhook,
      details: "Receive and process webhook requests from external services"
    },
    {
      id: 4,
      name: "Scheduled Task",
      description: "Run workflows on a schedule",
      icon: Timer,
      details: "Execute workflows at specific times or intervals"
    },
    {
      id: 5,
      name: "API Call",
      description: "Make HTTP requests to APIs",
      icon: ZapIcon,
      details: "Call external APIs and process responses"
    },
    {
      id: 6,
      name: "Conditional Logic",
      description: "Branch workflows based on conditions",
      icon: GitBranch,
      details: "Create complex workflows with conditional branches"
    }
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="sm" onClick={handleBack} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Dashboard
        </Button>
      </div>
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Automation</h1>
          <p className="text-muted-foreground mt-2">
            Create workflows with triggers and automated actions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLocation("/automation/executions")}>
            Executions
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button onClick={handleCreateWorkflow}>
            <Plus className="mr-2 h-4 w-4" />
            Create Workflow
          </Button>
        </div>
      </div>

      {workflows && workflows.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {workflows.map((workflow: any) => {
            const nodes = JSON.parse(workflow.nodes || "[]");
            const edges = JSON.parse(workflow.edges || "[]");
            
            return (
              <Card key={workflow.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{workflow.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {workflow.description || "No description"}
                      </CardDescription>
                    </div>
                    <Badge className={getStatusColor(workflow.status)}>
                      {workflow.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Workflow Stats */}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Zap className="h-4 w-4" />
                        <span>{nodes.length} blocks</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        <span>
                          {workflow.updatedAt
                            ? formatDistanceToNow(new Date(workflow.updatedAt), {
                                addSuffix: true,
                              })
                            : "Never"}
                        </span>
                      </div>
                    </div>

                    {/* Last Run Status */}
                    {workflow.lastRunAt && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Last run: </span>
                        <Badge
                          variant="outline"
                          className={
                            workflow.lastRunStatus === "success"
                              ? "bg-green-500/10 text-green-500"
                              : workflow.lastRunStatus === "error"
                              ? "bg-red-500/10 text-red-500"
                              : "bg-blue-500/10 text-blue-500"
                          }
                        >
                          {workflow.lastRunStatus}
                        </Badge>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditWorkflow(workflow.id)}
                        className="flex-1"
                      >
                        <Edit className="mr-1 h-3 w-3" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTestWorkflow(workflow)}
                        className="flex-1"
                      >
                        <Play className="mr-1 h-3 w-3" />
                        Test
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteWorkflow(workflow.id, workflow.name)}
                        className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardHeader className="text-center py-12">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent">
              <Zap className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle>Get Started with Automation</CardTitle>
            <CardDescription className="max-w-md mx-auto">
              Click "Create Workflow" to build your first automated workflow with triggers and actions
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Templates Section */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight mb-4">Workflow Templates</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => {
            const IconComponent = template.icon;
            return (
              <Card 
                key={template.id} 
                className="hover:shadow-lg transition-shadow cursor-pointer hover:border-primary/50"
                onClick={() => {
                  toast.info("Template feature coming soon");
                }}
              >
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-accent">
                      <IconComponent className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      <CardDescription>{template.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">{template.details}</p>
                  <Button variant="outline" size="sm" className="w-full">
                    Use Template
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
