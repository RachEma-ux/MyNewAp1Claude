import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, Save, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";

interface AgentConfig {
  name: string;
  description: string;
  roleClass: string;
  systemPrompt: string;
  modelId: number;
  temperature: string;
  hasDocumentAccess: boolean;
  hasToolAccess: boolean;
  allowedTools?: string[];
}

export default function AgentDetailPage() {
  const [, params] = useRoute("/agents/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const agentId = params?.id ? parseInt(params.id) : null;

  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [originalConfig, setOriginalConfig] = useState<AgentConfig | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch agent data
  const { data: agent, isLoading } = trpc.agents.get.useQuery(
    { id: agentId! },
    { enabled: !!agentId }
  );

  const updateMutation = trpc.agents.update.useMutation();
  const deleteMutation = trpc.agents.delete.useMutation();

  useEffect(() => {
    if (agent) {
      const agentConfig: AgentConfig = {
        name: agent.name,
        description: agent.description || "",
        roleClass: agent.roleClass,
        systemPrompt: agent.systemPrompt,
        modelId: agent.modelId,
        temperature: agent.temperature,
        hasDocumentAccess: agent.hasDocumentAccess,
        hasToolAccess: agent.hasToolAccess,
        allowedTools: agent.allowedTools as string[] | undefined,
      };
      setConfig(agentConfig);
      setOriginalConfig(agentConfig);
    }
  }, [agent]);

  const handleConfigChange = (field: keyof AgentConfig, value: any) => {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  };

  const handleSave = async () => {
    if (!config || !agentId) return;

    try {
      setIsSaving(true);
      await updateMutation.mutateAsync({
        id: agentId,
        name: config.name,
        description: config.description,
        roleClass: config.roleClass,
        systemPrompt: config.systemPrompt,
        modelId: config.modelId,
        temperature: config.temperature,
        hasDocumentAccess: config.hasDocumentAccess,
        hasToolAccess: config.hasToolAccess,
        allowedTools: config.allowedTools,
      });
      setOriginalConfig(config);
      setIsEditing(false);
      toast({ title: "Success", description: "Agent configuration saved" });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save agent configuration",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!agentId) return;

    try {
      setIsDeleting(true);
      await deleteMutation.mutateAsync({ id: agentId });
      toast({ title: "Success", description: "Agent deleted successfully" });
      navigate("/agents");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete agent",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const hasChanges = JSON.stringify(config) !== JSON.stringify(originalConfig);

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!agent || !config) {
    return (
      <div className="container py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Agent Not Found</h1>
          <Button onClick={() => navigate("/agents")}>Back to Agents</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/agents")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{agent.name}</h1>
            <p className="text-muted-foreground mt-1">
              {agent.status === "governed" ? (
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  Governed Agent
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-600" />
                  Draft Agent
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {isEditing && (
            <Button
              variant="outline"
              onClick={() => {
                setConfig(originalConfig);
                setIsEditing(false);
              }}
            >
              Cancel
            </Button>
          )}
          {isEditing ? (
            <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          ) : (
            <Button onClick={() => setIsEditing(true)}>Edit</Button>
          )}
        </div>
      </div>

      {/* Agent Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Role Class</p>
          <p className="text-lg font-semibold">{agent.roleClass}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Model</p>
          <p className="text-lg font-semibold">Model #{agent.modelId}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Temperature</p>
          <p className="text-lg font-semibold">{agent.temperature}</p>
        </Card>
      </div>

      {/* Configuration */}
      <Card className="p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Configuration</h2>
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-sm font-medium mb-2 block">Name</label>
            <input
              type="text"
              value={config.name}
              onChange={(e) => handleConfigChange("name", e.target.value)}
              disabled={!isEditing}
              className="w-full px-3 py-2 border rounded-md bg-background disabled:opacity-50"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium mb-2 block">Description</label>
            <textarea
              value={config.description}
              onChange={(e) => handleConfigChange("description", e.target.value)}
              disabled={!isEditing}
              className="w-full px-3 py-2 border rounded-md bg-background disabled:opacity-50 h-20"
            />
          </div>

          {/* Role Class */}
          <div>
            <label className="text-sm font-medium mb-2 block">Role Class</label>
            <select
              value={config.roleClass}
              onChange={(e) => handleConfigChange("roleClass", e.target.value)}
              disabled={!isEditing}
              className="w-full px-3 py-2 border rounded-md bg-background disabled:opacity-50"
            >
              <option value="assistant">Assistant</option>
              <option value="analyst">Analyst</option>
              <option value="support">Support</option>
              <option value="reviewer">Reviewer</option>
            </select>
          </div>

          {/* System Prompt */}
          <div>
            <label className="text-sm font-medium mb-2 block">System Prompt</label>
            <textarea
              value={config.systemPrompt}
              onChange={(e) => handleConfigChange("systemPrompt", e.target.value)}
              disabled={!isEditing}
              className="w-full px-3 py-2 border rounded-md bg-background disabled:opacity-50 h-32 font-mono text-sm"
            />
          </div>

          {/* Temperature */}
          <div>
            <label className="text-sm font-medium mb-2 block">Temperature</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={config.temperature}
              onChange={(e) => handleConfigChange("temperature", e.target.value)}
              disabled={!isEditing}
              className="w-full px-3 py-2 border rounded-md bg-background disabled:opacity-50"
            />
          </div>

          {/* Permissions */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="docAccess"
                checked={config.hasDocumentAccess}
                onChange={(e) => handleConfigChange("hasDocumentAccess", e.target.checked)}
                disabled={!isEditing}
                className="w-4 h-4"
              />
              <label htmlFor="docAccess" className="text-sm font-medium cursor-pointer">
                Document Access
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="toolAccess"
                checked={config.hasToolAccess}
                onChange={(e) => handleConfigChange("hasToolAccess", e.target.checked)}
                disabled={!isEditing}
                className="w-4 h-4"
              />
              <label htmlFor="toolAccess" className="text-sm font-medium cursor-pointer">
                Tool Access
              </label>
            </div>
          </div>
        </div>
      </Card>

      {/* Metadata */}
      <Card className="p-6 mb-6 bg-muted/50">
        <h3 className="font-semibold mb-3">Metadata</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Created:</span>
            <p className="font-medium">{format(new Date(agent.createdAt), "PPp")}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Last Updated:</span>
            <p className="font-medium">{format(new Date(agent.updatedAt), "PPp")}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Status:</span>
            <p className="font-medium">
              <Badge variant={agent.status === "governed" ? "default" : "secondary"}>
                {agent.status}
              </Badge>
            </p>
          </div>
        </div>
      </Card>

      {/* Delete Section */}
      {!isEditing && (
        <Card className="p-6 border-red-200 bg-red-50">
          <h3 className="font-semibold text-red-900 mb-2">Danger Zone</h3>
          <p className="text-sm text-red-800 mb-4">
            Deleting this agent is permanent and cannot be undone.
          </p>
          <Button
            variant="destructive"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Agent
          </Button>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Agent</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{agent.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
