import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Save, Loader2, File, Bot, Settings as SettingsIcon, Route } from "lucide-react";
import { toast } from "sonner";
import { WorkspaceRoutingProfile } from "@/components/WorkspaceRoutingProfile";

export default function WorkspaceDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const workspaceId = params?.id ? parseInt(params.id) : null;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [chunkingStrategy, setChunkingStrategy] = useState<"semantic" | "fixed" | "recursive">("semantic");

  const { data: workspace, isLoading } = trpc.workspaces.get.useQuery(
    { id: workspaceId! },
    { enabled: !!workspaceId }
  );

  useEffect(() => {
    if (workspace) {
      setName(workspace.name);
      setDescription(workspace.description || "");
      setEmbeddingModel(workspace.embeddingModel || "bge-small-en-v1.5");
      setChunkingStrategy(workspace.chunkingStrategy || "semantic");
    }
  }, [workspace]);

  const { data: documents } = trpc.documents.list.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId }
  );

  const { data: agents } = trpc.agents.list.useQuery();

  const utils = trpc.useUtils();
  const updateMutation = trpc.workspaces.update.useMutation({
    onSuccess: () => {
      utils.workspaces.get.invalidate({ id: workspaceId! });
      utils.workspaces.list.invalidate();
      toast.success("Workspace updated successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update workspace");
    },
  });

  const handleSave = () => {
    if (!workspaceId) return;

    updateMutation.mutate({
      id: workspaceId,
      name: name.trim(),
      description: description.trim() || undefined,
      embeddingModel,
      chunkingStrategy,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold mb-2">Workspace not found</h2>
        <Button onClick={() => setLocation("/workspaces")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Workspaces
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/workspaces")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{workspace.name}</h1>
            <p className="text-muted-foreground mt-2">
              {workspace.description || "No description"}
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="settings">
            <SettingsIcon className="mr-2 h-4 w-4" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="routing">
            <Route className="mr-2 h-4 w-4" />
            Routing
          </TabsTrigger>
          <TabsTrigger value="documents">
            <File className="mr-2 h-4 w-4" />
            Documents ({documents?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="agents">
            <Bot className="mr-2 h-4 w-4" />
            Agents ({agents?.length || 0})
          </TabsTrigger>
        </TabsList>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>
                Configure workspace name and description
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Workspace Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My AI Project"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this workspace is for..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Document Processing</CardTitle>
              <CardDescription>
                Configure embedding and chunking strategies for documents
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                <p className="text-xs text-muted-foreground">
                  Model used to generate embeddings for semantic search
                </p>
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
                <p className="text-xs text-muted-foreground">
                  Method used to split documents into chunks
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Metadata</CardTitle>
              <CardDescription>
                Workspace information and statistics
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Workspace ID</span>
                <span className="font-mono">{workspace.id}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Collection Name</span>
                <span className="font-mono">{workspace.collectionName}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Created</span>
                <span>{new Date(workspace.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Last Updated</span>
                <span>{new Date(workspace.updatedAt).toLocaleDateString()}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Routing Tab */}
        <TabsContent value="routing" className="space-y-4">
          {workspaceId && (
            <WorkspaceRoutingProfile workspaceId={workspaceId} />
          )}
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-4">
          {!documents || documents.length === 0 ? (
            <Card className="border-dashed">
              <CardHeader className="text-center py-12">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent">
                  <File className="h-8 w-8 text-muted-foreground" />
                </div>
                <CardTitle>No documents</CardTitle>
                <CardDescription className="max-w-md mx-auto">
                  Upload documents to this workspace from the Documents page
                </CardDescription>
                <div className="mt-4">
                  <Button onClick={() => setLocation("/documents")}>
                    Go to Documents
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {documents.map((doc) => (
                <Card key={doc.id}>
                  <CardHeader>
                    <CardTitle className="text-base truncate">
                      {doc.title || doc.filename}
                    </CardTitle>
                    <CardDescription className="truncate">
                      {doc.filename}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Status</span>
                        <Badge variant={doc.status === "completed" ? "default" : "secondary"} className="capitalize">
                          {doc.status}
                        </Badge>
                      </div>
                      {doc.chunkCount !== null && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Chunks</span>
                          <span className="font-medium">{doc.chunkCount}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Agents Tab */}
        <TabsContent value="agents" className="space-y-4">
          {!agents || agents.length === 0 ? (
            <Card className="border-dashed">
              <CardHeader className="text-center py-12">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent">
                  <Bot className="h-8 w-8 text-muted-foreground" />
                </div>
                <CardTitle>No agents</CardTitle>
                <CardDescription className="max-w-md mx-auto">
                  Create agents for this workspace from the Agents page
                </CardDescription>
                <div className="mt-4">
                  <Button onClick={() => setLocation("/agents")}>
                    Go to Agents
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {agents.map((agent) => (
                <Card key={agent.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{agent.name}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {agent.description || "No description"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Document Access</span>
                        <Badge variant={agent.hasDocumentAccess ? "default" : "outline"}>
                          {agent.hasDocumentAccess ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Tool Access</span>
                        <Badge variant={agent.hasToolAccess ? "default" : "outline"}>
                          {agent.hasToolAccess ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
