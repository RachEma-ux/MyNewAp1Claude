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
import { Plus, FolderOpen, Settings, Trash2, Loader2, ExternalLink, User, Target, Microscope } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Workspaces() {
  const [, setLocation] = useLocation();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [workspaceType, setWorkspaceType] = useState<"generic" | "personal" | "project" | "research">("generic");
  const [embeddingModel, setEmbeddingModel] = useState("bge-small-en-v1.5");
  const [chunkingStrategy, setChunkingStrategy] = useState<"semantic" | "fixed" | "recursive">("semantic");
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const utils = trpc.useUtils();
  const { data: workspaces, isLoading } = trpc.workspaces.list.useQuery();
  
  const seedMutation = trpc.modules.manage.seed.useMutation();

  const createMutation = trpc.workspaces.create.useMutation({
    onSuccess: (data) => {
      const createdType = workspaceType;
      utils.workspaces.list.invalidate();
      setCreateDialogOpen(false);
      setName("");
      setDescription("");
      setWorkspaceType("generic");
      // Map workspace type to seed preset
      const seedType = createdType === "generic" ? "team" : createdType;
      // Auto-seed modules, then navigate to correct shell
      seedMutation.mutate(
        { workspaceId: data.id, workspaceType: seedType, _evidence: { types: ["reason"], refs: ["workspace-create"] } } as any,
        {
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
      toast.error(error.message || "Failed to create workspace");
    },
  });

  const deleteMutation = trpc.workspaces.delete.useMutation({
    onSuccess: () => {
      utils.workspaces.list.invalidate();
      toast.success("Workspace deleted successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete workspace");
    },
  });

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error("Please enter a workspace name");
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
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
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
                      className={`flex items-start gap-2 p-3 rounded-lg border text-left transition-colors ${
                        workspaceType === tpl.value
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-muted-foreground/50"
                      }`}
                    >
                      <tpl.icon className={`h-4 w-4 mt-0.5 shrink-0 ${tpl.color}`} />
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
                  placeholder="Describe what this workspace is for..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="embedding">Embedding Model</Label>
                <Select value={embeddingModel} onValueChange={setEmbeddingModel}>
                  <SelectTrigger id="embedding">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bge-small-en-v1.5">BGE Small EN v1.5</SelectItem>
                    <SelectItem value="minilm-l6-v2">MiniLM L6 v2</SelectItem>
                    <SelectItem value="e5-base-v2">E5 Base v2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="chunking">Chunking Strategy</Label>
                <Select value={chunkingStrategy} onValueChange={(v) => setChunkingStrategy(v as any)}>
                  <SelectTrigger id="chunking">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semantic">Semantic (Smart boundaries)</SelectItem>
                    <SelectItem value="fixed">Fixed (Uniform size)</SelectItem>
                    <SelectItem value="recursive">Recursive (Hierarchical)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Workspace
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >

      {/* Workspaces Grid */}
      {!workspaces || workspaces.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No workspaces yet"
          description="Create your first workspace to start organizing your AI projects, documents, and agents"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((workspace) => (
            <Card key={workspace.id} className="hover:bg-accent/50 transition-colors">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <FolderOpen className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{workspace.name}</CardTitle>
                      <CardDescription className="mt-1 line-clamp-2">
                        {workspace.description || "No description"}
                      </CardDescription>
                      {(workspace as any).type && (workspace as any).type !== "generic" && (
                        <span className={`inline-block mt-1 text-xs px-1.5 py-0.5 rounded-full ${
                          (workspace as any).type === "personal" ? "bg-blue-500/10 text-blue-400" :
                          (workspace as any).type === "project" ? "bg-orange-500/10 text-orange-400" :
                          (workspace as any).type === "research" ? "bg-purple-500/10 text-purple-400" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {(workspace as any).type}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Embedding Model</span>
                    <span className="font-medium">{workspace.embeddingModel}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Chunking</span>
                    <span className="font-medium capitalize">{workspace.chunkingStrategy}</span>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        const wsType = (workspace as any).type || "generic";
                        const routes: Record<string, string> = {
                          personal: `/personal/${workspace.id}`,
                          project: `/project/${workspace.id}`,
                          research: `/research/${workspace.id}`,
                        };
                        setLocation(routes[wsType] || `/w/${workspace.id}/overview`);
                      }}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation(`/w/${workspace.id}`)}
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(workspace.id, workspace.name)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog />
    </PageShell>
  );
}
