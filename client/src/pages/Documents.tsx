import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Database, Upload, Loader2, File, Trash2, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import FileUpload from "@/components/FileUpload";

export default function Documents() {
  const [selectedWorkspace, setSelectedWorkspace] = useState<number | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const { data: workspaces } = trpc.workspaces.list.useQuery();
  const { data: documents, isLoading } = trpc.documents.list.useQuery(
    { workspaceId: selectedWorkspace! },
    { enabled: !!selectedWorkspace }
  );

  const utils = trpc.useUtils();
  const deleteMutation = trpc.documents.delete.useMutation({
    onSuccess: () => {
      utils.documents.list.invalidate();
      toast.success("Document deleted successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete document");
    },
  });

  const uploadMutation = trpc.documents.upload.useMutation({
    onSuccess: () => {
      utils.documents.list.invalidate();
      toast.success("Document uploaded successfully! Processing in background.");
      setShowUpload(false);
    },
    onError: (error) => {
      toast.error(error.message || "Upload failed");
    },
  });

  const handleUpload = async (files: File[]) => {
    if (!selectedWorkspace) {
      toast.error("Please select a workspace first");
      return;
    }

    for (const file of files) {
      try {
        // Read file as base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        
        const base64Content = base64.split(',')[1]; // Remove data:...;base64, prefix

        await uploadMutation.mutateAsync({
          workspaceId: selectedWorkspace,
          filename: file.name,
          fileType: file.type || "application/octet-stream",
          fileSize: file.size,
          fileContent: base64Content,
        });
      } catch (error) {
        console.error("Upload error:", error);
        throw error;
      }
    }
  };

  const handleDelete = (id: number, filename: string) => {
    if (confirm(`Are you sure you want to delete "${filename}"?`)) {
      deleteMutation.mutate({ id });
    }
  };

  const getStatusIcon = (status: string | null) => {
    if (!status) return <Clock className="h-4 w-4 text-muted-foreground" />;
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "processing":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string | null) => {
    if (!status) return <Badge variant="outline">Unknown</Badge>;
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      completed: "default",
      processing: "secondary",
      pending: "outline",
      error: "destructive",
    };
    return (
      <Badge variant={variants[status] || "outline"} className="capitalize">
        {status}
      </Badge>
    );
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
          <p className="text-muted-foreground mt-2">
            Upload and manage documents for RAG and knowledge bases
          </p>
        </div>
        <div className="flex gap-2">
          <Select
            value={selectedWorkspace?.toString() || ""}
            onValueChange={(value) => setSelectedWorkspace(Number(value))}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select workspace" />
            </SelectTrigger>
            <SelectContent>
              {workspaces?.map((workspace) => (
                <SelectItem key={workspace.id} value={workspace.id.toString()}>
                  {workspace.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => setShowUpload(!showUpload)}
            disabled={!selectedWorkspace}
          >
            <Upload className="mr-2 h-4 w-4" />
            Upload Documents
          </Button>
        </div>
      </div>

      {/* Upload Section */}
      {showUpload && selectedWorkspace && (
        <FileUpload onUpload={handleUpload} />
      )}

      {/* Documents List */}
      {!selectedWorkspace ? (
        <Card className="border-dashed">
          <CardHeader className="text-center py-12">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent">
              <Database className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle>Select a Workspace</CardTitle>
            <CardDescription className="max-w-md mx-auto">
              Choose a workspace from the dropdown above to view and manage its documents
            </CardDescription>
          </CardHeader>
        </Card>
      ) : isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !documents || documents.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader className="text-center py-12">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent">
              <File className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle>No documents yet</CardTitle>
            <CardDescription className="max-w-md mx-auto">
              Upload documents to this workspace to start building your knowledge base
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => (
            <Card key={doc.id} className="hover:bg-accent/50 transition-colors">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary flex-shrink-0">
                      <File className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">
                        {doc.title || doc.filename}
                      </CardTitle>
                      <CardDescription className="mt-1 truncate">
                        {doc.filename}
                      </CardDescription>
                    </div>
                  </div>
                  {getStatusIcon(doc.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Size</span>
                    <span className="font-medium">{formatFileSize(doc.fileSize)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-medium">{doc.fileType.split("/")[1]?.toUpperCase() || "Unknown"}</span>
                  </div>
                  {doc.chunkCount !== null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Chunks</span>
                      <span className="font-medium">{doc.chunkCount}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    {getStatusBadge(doc.status)}
                  </div>
                  {doc.errorMessage && (
                    <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                      {doc.errorMessage}
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => window.open(doc.fileUrl, "_blank")}
                    >
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(doc.id, doc.filename)}
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
    </div>
  );
}
