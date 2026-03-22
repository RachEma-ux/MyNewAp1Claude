import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageShell, EmptyState } from "@/components/app";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { trpc } from "@/lib/trpc";
import { AppBlockerAlert } from "@/components/errors/AppBlockerAlert";
import { getAppBlocker, showBlockerToast } from "@/lib/appBlockers";
import { Plus, FolderOpen, Settings, Trash2, Loader2, ExternalLink, User, Target, Microscope } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import type { AppBlockerPayload } from "@shared/blockers";

export default function Workspaces() {
  const [, setLocation] = useLocation();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [workspaceType, setWorkspaceType] = useState<"generic" | "personal" | "project" | "research">("generic");
  const [embeddingModel, setEmbeddingModel] = useState("bge-small-en-v1.5");
  const [chunkingStrategy, setChunkingStrategy] = useState<"semantic" | "fixed" | "recursive">("semantic");
  const [createBlocker, setCreateBlocker] = useState<AppBlockerPayload | null>(null);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const utils = trpc.useUtils();
  const { data: workspaces, isLoading } = trpc.workspaces.list.useQuery();
  const seedMutation = trpc.modules.manage.seed.useMutation();

  const resetCreateForm = () => {
    setName("");
    setDescription("");
    setWorkspaceType("generic");
    setCreateBlocker(null);
  };

  const createMutation = trpc.workspaces.create.useMutation({
    onSuccess: (data) => {
      const createdType = workspaceType;
      utils.workspaces.list.invalidate();
      setCreateDialogOpen(false);
      resetCreateForm();
      const seedType = createdType === "generic" ? "team" : createdType;
      seedMutation.mutate(
        { workspaceId: data.id, workspaceType: seedType, _evidence: { types: ["reason"], refs: ["workspace-create"] } } as any,
        {
          onError: (error) => {
            showBlockerToast(error, "Workspace setup needs attention");
          },
          onSettled: () => {
            toast.success("Workspace created successfully");
            const routes: Record<string, string> = {
              generic: `/w/${data.id}/overview`,
              personal: `/personal/${data.id}`,
              project: `/project/${data.id}`,
              research: `/research/${data.id}`,
            };
            setLocation(routes[createdType] || `/w/${data.id}/overview`);
          },
        }
      );
    },
    onError: (error) => {
      setCreateBlocker(getAppBlocker(error));
    },
  });

  const deleteMutation = trpc.workspaces.delete.useMutation({
    onSuccess: () => {
      utils.workspaces.list.invalidate();
      toast.success("Workspace deleted successfully");
    },
    onError: (error) => {
      showBlockerToast(error, "Workspace deletion blocked");
    },
  });

  const handleCreate = () => {
    setCreateBlocker(null);

    if (!name.trim()) {
      setCreateBlocker({
        code: "workspace_name_missing",
        category: "missing_input",
        title: "A workspace name is required",
        summary: "This workspace cannot be created until it has a name.",
        details: [],
        missingRequirements: ["Workspace name"],
        fieldIssues: [],
        recommendedActions: ["Enter a workspace name, then try again."],
        retryable: false,
        context: { field: "name" },
      });
      return;
    }

    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      type: workspaceType,
      embeddingModel,
      chunkingStrategy,
    });
  };

  const handleDelete = (id: number, workspaceName: string) => {
    confirm(
      () => deleteMutation.mutate({ id }),
      {
        title: `Delete "${workspaceName}"?`,
        description: "This action cannot be undone. All documents and agents in this workspace will be removed.",
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PageShell
      title="Workspaces"
      subtitle="Organize your AI projects with isolated workspaces"
      actions={
        <Dialog
          open={createDialogOpen}
          onOpenChange={(open) => {
            setCreateDialogOpen(open);
            if (!open) {
              setCreateBlocker(null);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Workspace
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create New Workspace</DialogTitle>
              <DialogDescription>
                Set up a new workspace for your AI project. Configure embedding and chunking settings.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {createBlocker && <AppBlockerAlert blocker={createBlocker} />}
              <div className="space-y-2">
                <Label>Template</Label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: "generic" as const, label: "Generic", desc: "Blank workspace", icon: FolderOpen, color: "text-muted-foreground" },
                    { value: "personal" as const, label: "Personal", desc: "Tasks, notes, AI chat", icon: User, color: "text-blue-400" },
                    { value: "project" as const, label: "Project", desc: "PMT, agents, collab", icon: Target, color: "text-orange-400" },
                    { value: "research" as const, label: "Research", desc: "Datasets, experiments", icon: Microscope, color: "text-purple-400" },
                  ]).map((tpl) => (
                    <button
                      key={tpl.value}
                      type="button"
                      onClick={() => setWorkspaceType(tpl.value)}
                      className={`flex items-start gap-2 rounded-lg border p-3 text-left transition-colors ${
                        workspaceType === tpl.value
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-muted-foreground/50"
                      }`}
                    >
                      <tpl.icon className={`mt-0.5 h-4 w-4 shrink-0 ${tpl.color}`} />
                      <div>
                        <div className="text-sm font-medium">{tpl.label}</div>
                        <div className="text-xs text-muted-foreground">{tpl.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Workspace Name *</Label>
                <Input
                  id="name"
                  placeholder="My AI Project"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="What is this workspace for?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Embedding Model</Label>
                  <Select value={embeddingModel} onValueChange={setEmbeddingModel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bge-small-en-v1.5">BGE Small</SelectItem>
                      <SelectItem value="bge-base-en-v1.5">BGE Base</SelectItem>
                      <SelectItem value="text-embedding-3-small">OpenAI Small</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Chunking Strategy</Label>
                  <Select value={chunkingStrategy} onValueChange={(value) => setChunkingStrategy(value as "semantic" | "fixed" | "recursive")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="semantic">Semantic</SelectItem>
                      <SelectItem value="fixed">Fixed</SelectItem>
                      <SelectItem value="recursive">Recursive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending || seedMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Workspace"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      {workspaces && workspaces.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((workspace: any) => (
            <Card key={workspace.id} className="group hover:border-primary/50 transition-colors">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FolderOpen className="h-5 w-5 text-primary" />
                      {workspace.name}
                    </CardTitle>
                    <CardDescription className="mt-2">
                      {workspace.description || "No description"}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setLocation(`/w/${workspace.id}/overview`)}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(workspace.id, workspace.name)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-medium capitalize">{workspace.type || "generic"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Updated</span>
                    <span>{new Date(workspace.updatedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="pt-3 border-t flex gap-2">
                    <Button
                      variant="default"
                      className="flex-1"
                      onClick={() => setLocation(`/w/${workspace.id}/overview`)}
                    >
                      Open
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setLocation(`/w/${workspace.id}/settings`)}
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FolderOpen}
          title="No workspaces yet"
          description="Create your first workspace to start organizing your AI projects"
          action={
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Workspace
            </Button>
          }
        />
      )}
      <ConfirmDialog />
    </PageShell>
  );
}
