import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Upload, Plus, Edit, Trash2, FileText, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ProtocolsPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedProtocol, setSelectedProtocol] = useState<any>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");

  const { data: protocols, isLoading, refetch } = trpc.protocols.list.useQuery({
    search: searchTerm,
  });

  const createMutation = trpc.protocols.create.useMutation({
    onSuccess: () => {
      toast({ title: "Protocol created successfully" });
      setIsCreateOpen(false);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast({ title: "Failed to create protocol", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = trpc.protocols.update.useMutation({
    onSuccess: () => {
      toast({ title: "Protocol updated successfully" });
      setIsEditOpen(false);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast({ title: "Failed to update protocol", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = trpc.protocols.delete.useMutation({
    onSuccess: () => {
      toast({ title: "Protocol deleted successfully" });
      refetch();
    },
    onError: (error) => {
      toast({ title: "Failed to delete protocol", description: error.message, variant: "destructive" });
    },
  });

  const uploadMutation = trpc.protocols.uploadFromFile.useMutation({
    onSuccess: () => {
      toast({ title: "Protocol uploaded successfully" });
      refetch();
    },
    onError: (error) => {
      toast({ title: "Failed to upload protocol", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setContent("");
    setTags("");
    setSelectedProtocol(null);
  };

  const handleCreate = () => {
    createMutation.mutate({
      name,
      description,
      content,
      tags: tags.split(",").map(t => t.trim()).filter(Boolean),
    });
  };

  const handleUpdate = () => {
    if (!selectedProtocol) return;
    updateMutation.mutate({
      id: selectedProtocol.id,
      name,
      description,
      content,
      tags: tags.split(",").map(t => t.trim()).filter(Boolean),
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this protocol?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.md')) {
      toast({ title: "Invalid file type", description: "Only .md files are allowed", variant: "destructive" });
      return;
    }

    const content = await file.text();
    const fileName = file.name.replace('.md', '');

    uploadMutation.mutate({
      name: fileName,
      content,
      fileName: file.name,
      fileSize: file.size,
    });
  };

  const openEditDialog = (protocol: any) => {
    setSelectedProtocol(protocol);
    setName(protocol.name);
    setDescription(protocol.description || "");
    setContent(protocol.content);
    setTags(Array.isArray(protocol.tags) ? protocol.tags.join(", ") : "");
    setIsEditOpen(true);
  };

  return (
    <div className="container py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Agent Protocols</h1>
          <p className="text-muted-foreground">Upload and manage markdown protocol files for your agents</p>
        </div>
        <div className="flex gap-2">
          <label htmlFor="file-upload">
            <Button variant="outline" size="sm" asChild>
              <span>
                <Upload className="h-4 w-4 mr-2" />
                Upload .md
              </span>
            </Button>
          </label>
          <input
            id="file-upload"
            type="file"
            accept=".md"
            className="hidden"
            onChange={handleFileUpload}
          />
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New Protocol
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Protocol</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Protocol name" />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description" />
                </div>
                <div>
                  <Label>Tags (comma-separated)</Label>
                  <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="agent, workflow, guidelines" />
                </div>
                <div>
                  <Label>Content (Markdown)</Label>
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="# Protocol Title&#10;&#10;## Overview&#10;&#10;Your protocol content here..."
                    rows={15}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreate} disabled={!name || !content || createMutation.isPending}>
                    Create Protocol
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search protocols..."
            className="pl-10"
          />
        </div>
      </div>

      {/* Protocols List */}
      {isLoading ? (
        <div className="text-center py-12">Loading protocols...</div>
      ) : protocols && protocols.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {protocols.map((protocol) => (
            <Card key={protocol.id} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">{protocol.name}</h3>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEditDialog(protocol)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(protocol.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
              {protocol.description && (
                <p className="text-sm text-muted-foreground mb-3">{protocol.description}</p>
              )}
              <div className="flex flex-wrap gap-2 mb-3">
                {Array.isArray(protocol.tags) && protocol.tags.map((tag: string) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
              <div className="text-xs text-muted-foreground">
                <div>Version: {protocol.version}</div>
                <div>Updated: {new Date(protocol.updatedAt).toLocaleDateString()}</div>
                {protocol.fileSize && <div>Size: {(protocol.fileSize / 1024).toFixed(1)} KB</div>}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-12 text-center">
          <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No protocols found</h3>
          <p className="text-muted-foreground mb-4">
            Upload a .md file or create a new protocol to get started
          </p>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create First Protocol
          </Button>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Protocol</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Protocol name" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description" />
            </div>
            <div>
              <Label>Tags (comma-separated)</Label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="agent, workflow, guidelines" />
            </div>
            <div>
              <Label>Content (Markdown)</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={15}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
              <Button onClick={handleUpdate} disabled={!name || !content || updateMutation.isPending}>
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
