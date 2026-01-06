import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Bot, Plus, Settings, Trash2, MessageSquare, Wrench, Sparkles } from "lucide-react";
import { AGENT_TEMPLATES, type AgentTemplate } from "@/lib/agentTemplates";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Agent, AgentMode, GovernanceStatus, AgentRoleClass } from "@shared/types";
// Toast functionality - using console for now

export default function Agents() {
  const [, setLocation] = useLocation();
  const toast = (msg: any) => console.log(msg.title, msg.description);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<number | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState([0.7]);
  const [hasDocumentAccess, setHasDocumentAccess] = useState(false);
  const [hasToolAccess, setHasToolAccess] = useState(false);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [maxIterations, setMaxIterations] = useState(10);

  // Queries
  const workspacesQuery = trpc.workspaces.list.useQuery();
  const agentsQuery = trpc.agents.list.useQuery();
  const toolsQuery = trpc.agents.listTools.useQuery();

  // Mutations
  const createAgentMutation = trpc.agents.create.useMutation({
    onSuccess: () => {
      toast({ title: "Agent created successfully" });
      setCreateDialogOpen(false);
      resetForm();
      agentsQuery.refetch();
    },
    onError: (error) => {
      toast({ title: "Failed to create agent", description: error.message, variant: "destructive" });
    },
  });

  const deleteAgentMutation = trpc.agents.delete.useMutation({
    onSuccess: () => {
      toast({ title: "Agent deleted successfully" });
      agentsQuery.refetch();
    },
    onError: (error) => {
      toast({ title: "Failed to delete agent", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setSystemPrompt("");
    setTemperature([0.7]);
    setHasDocumentAccess(false);
    setHasToolAccess(false);
    setSelectedTools([]);
    setMaxIterations(10);
  };

  const handleCreateAgent = () => {
    if (!selectedWorkspace) {
      toast({ title: "Please select a workspace first", variant: "destructive" });
      return;
    }

    if (!name || !systemPrompt) {
      toast({ title: "Name and system prompt are required", variant: "destructive" });
      return;
    }

    createAgentMutation.mutate({
      name,
      description,
      systemPrompt,
      temperature: temperature[0].toString(),
      hasDocumentAccess,
      hasToolAccess,
      allowedTools: hasToolAccess ? selectedTools : undefined,
      maxIterations,
    });
  };

  const handleToolToggle = (toolName: string) => {
    setSelectedTools((prev) =>
      prev.includes(toolName) ? prev.filter((t) => t !== toolName) : [...prev, toolName]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agents</h1>
          <p className="text-muted-foreground mt-2">
            Create and manage AI agents with custom capabilities
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Agent
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Agent</DialogTitle>
              <DialogDescription>
                Configure your AI agent with custom instructions, tools, and capabilities
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Template Selection */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <Label>Start with a Template (Optional)</Label>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {AGENT_TEMPLATES.map((template) => (
                    <Card
                      key={template.id}
                      className="cursor-pointer hover:border-primary transition-colors"
                      onClick={() => {
                        setName(template.name);
                        setDescription(template.description);
                        setSystemPrompt(template.systemPrompt);
                        setTemperature([template.temperature]);
                        setHasDocumentAccess(template.hasDocumentAccess);
                        setHasToolAccess(template.hasToolAccess);
                        setSelectedTools(template.allowedTools);
                        setMaxIterations(template.maxIterations);
                      }}
                    >
                      <CardContent className="p-4 text-center">
                        <div className="text-3xl mb-2">{template.icon}</div>
                        <div className="font-medium text-sm">{template.name}</div>
                        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {template.description}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Click a template to pre-fill the form, then customize as needed
                </p>
              </div>

              {/* Basic Information */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Agent Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Research Assistant, Code Helper"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    placeholder="Brief description of what this agent does"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="systemPrompt">System Prompt *</Label>
                  <Textarea
                    id="systemPrompt"
                    placeholder="You are a helpful assistant that..."
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={6}
                  />
                  <p className="text-xs text-muted-foreground">
                    Define the agent's personality, role, and behavior
                  </p>
                </div>
              </div>

              {/* Temperature */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Temperature</Label>
                  <span className="text-sm text-muted-foreground">{temperature[0].toFixed(1)}</span>
                </div>
                <Slider
                  value={temperature}
                  onValueChange={setTemperature}
                  min={0}
                  max={2}
                  step={0.1}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Lower values make responses more focused, higher values more creative
                </p>
              </div>

              {/* Document Access (RAG) */}
              <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Document Access (RAG)</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow agent to search and use uploaded documents
                  </p>
                </div>
                <Switch checked={hasDocumentAccess} onCheckedChange={setHasDocumentAccess} />
              </div>

              {/* Tool Access */}
              <div className="space-y-4">
                <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label>Tool Access</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow agent to use tools for calculations, parsing, etc.
                    </p>
                  </div>
                  <Switch checked={hasToolAccess} onCheckedChange={setHasToolAccess} />
                </div>

                {hasToolAccess && (
                  <div className="space-y-3 pl-4">
                    <Label>Available Tools</Label>
                    {toolsQuery.data?.map((tool) => (
                      <div key={tool.name} className="flex items-start space-x-3">
                        <Checkbox
                          id={tool.name}
                          checked={selectedTools.includes(tool.name)}
                          onCheckedChange={() => handleToolToggle(tool.name)}
                        />
                        <div className="space-y-1">
                          <Label htmlFor={tool.name} className="font-medium cursor-pointer">
                            {tool.name}
                          </Label>
                          <p className="text-sm text-muted-foreground">{tool.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Max Iterations */}
              {hasToolAccess && (
                <div className="space-y-2">
                  <Label htmlFor="maxIterations">Max Tool Iterations</Label>
                  <Input
                    id="maxIterations"
                    type="number"
                    min={1}
                    max={50}
                    value={maxIterations}
                    onChange={(e) => setMaxIterations(parseInt(e.target.value) || 10)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum number of tool calls allowed per conversation turn
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateAgent} disabled={createAgentMutation.isPending}>
                {createAgentMutation.isPending ? "Creating..." : "Create Agent"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Workspace Selector */}
      <div className="flex items-center gap-4">
        <Label>Workspace:</Label>
        <Select
          value={selectedWorkspace?.toString() || ""}
          onValueChange={(value) => setSelectedWorkspace(parseInt(value))}
        >
          <SelectTrigger className="w-[300px]">
            <SelectValue placeholder="Select workspace" />
          </SelectTrigger>
          <SelectContent>
            {workspacesQuery.data?.map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id.toString()}>
                {workspace.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Agents List */}
      {!selectedWorkspace ? (
        <Card className="border-dashed">
          <CardHeader className="text-center py-12">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent">
              <Bot className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle>Select a Workspace</CardTitle>
            <CardDescription className="max-w-md mx-auto">
              Choose a workspace from the dropdown above to view and manage its agents
            </CardDescription>
          </CardHeader>
        </Card>
      ) : agentsQuery.isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading agents...</div>
      ) : agentsQuery.data && agentsQuery.data.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader className="text-center py-12">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent">
              <Bot className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle>No Agents Yet</CardTitle>
            <CardDescription className="max-w-md mx-auto">
              Create your first AI agent to get started with automated conversations and tool execution
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agentsQuery.data?.map((agent) => (
            <Card key={agent.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{agent.name}</CardTitle>
                      {agent.description && (
                        <CardDescription className="mt-1">{agent.description}</CardDescription>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Wrench className="h-4 w-4" />
                    <span>
                      {agent.hasToolAccess ? `${agent.allowedTools ? JSON.parse(agent.allowedTools as string).length : 0} tools` : "No tools"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MessageSquare className="h-4 w-4" />
                    <span>Temperature: {agent.temperature || "0.7"}</span>
                  </div>
                  {agent.hasDocumentAccess && (
                    <div className="text-sm text-muted-foreground">✓ Document access enabled</div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1"
                      onClick={() => setLocation(`/agents/${agent.id}/chat`)}
                    >
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Chat
                    </Button>
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Delete agent "${agent.name}"?`)) {
                          deleteAgentMutation.mutate({ id: agent.id });
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
