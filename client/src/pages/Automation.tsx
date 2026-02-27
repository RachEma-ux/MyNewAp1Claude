import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap, Plus, Play, Trash2, Edit, Clock, Home, ArrowRight, Mail, Database, Webhook, Timer, Zap as ZapIcon, GitBranch, FolderKanban } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { PageShell, EmptyState, StatusPill } from "@/components/app";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

export default function Automation() {
  const [, setLocation] = useLocation();
  const { confirm, ConfirmDialog } = useConfirmDialog();

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
    confirm(
      () => deleteMutation.mutate({ id: workflowId }),
      { title: `Delete "${workflowName}"?`, description: "This action cannot be undone." },
    );
  };

  const handleTestWorkflow = (workflow: any) => {
    toast.info("Starting workflow execution...");
    setLocation("/automation/executions");
  };

  const getStatusPillVariant = (status: string) => {
    switch (status) {
      case "active": return "active" as const;
      case "paused": return "pending" as const;
      case "draft": return "draft" as const;
      default: return "disabled" as const;
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
    },
    {
      id: 7,
      name: "Project Management Lifecycle",
      description: "Full PM process from scoping to closure",
      icon: FolderKanban,
      details: "Complete project lifecycle: Initiating → Planning → Executing → Closing with phase gates, reviews, and approvals"
    }
  ];

  return (
    <PageShell
      title="Automation"
      subtitle="Create workflows with triggers and automated actions"
      icon={Zap}
      backHref="/"
      actions={
        <>
          <Button variant="outline" onClick={() => setLocation("/automation/executions")}>
            Executions
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button onClick={handleCreateWorkflow}>
            <Plus className="mr-2 h-4 w-4" />
            Create Workflow
          </Button>
        </>
      }
    >

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
                    <StatusPill status={getStatusPillVariant(workflow.status)} label={workflow.status} />
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
                      <div className="text-sm flex items-center gap-2">
                        <span className="text-muted-foreground">Last run: </span>
                        <StatusPill
                          status={
                            workflow.lastRunStatus === "success"
                              ? "success"
                              : workflow.lastRunStatus === "error"
                              ? "error"
                              : "active"
                          }
                          label={workflow.lastRunStatus}
                        />
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
        <EmptyState
          icon={Zap}
          title="Get Started with Automation"
          description='Click "Create Workflow" to build your first automated workflow with triggers and actions'
          action={
            <Button onClick={handleCreateWorkflow}>
              <Plus className="mr-2 h-4 w-4" />
              Create Workflow
            </Button>
          }
        />
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
                  setLocation(`/automation/builder?template=${template.id}`);
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
      <ConfirmDialog />
    </PageShell>
  );
}
