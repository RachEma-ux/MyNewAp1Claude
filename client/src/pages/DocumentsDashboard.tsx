import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, Search, Filter, Calendar, Database, 
  Eye, Trash2, CheckCircle, XCircle, Clock, Loader2,
  Upload, BarChart3
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { useLocation } from "wouter";

export default function DocumentsDashboard() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCollection, setFilterCollection] = useState<string>("all");
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkActionMode, setBulkActionMode] = useState(false);

  // Get user's workspaces and use the first one
  const { data: workspaces } = trpc.workspaces.list.useQuery();
  const activeWorkspaceId = workspaces?.[0]?.id;

  // Fetch real documents from database
  const { data: documents, isLoading: documentsLoading } = trpc.documentsManagement.listDocuments.useQuery({
    workspaceId: activeWorkspaceId!,
  }, {
    enabled: !!activeWorkspaceId,
  });

  const deleteDocumentMutation = trpc.documentsManagement.deleteDocument.useMutation({
    onSuccess: () => {
      toast.success("Document deleted successfully");
    },
    onError: (error: any) => {
      toast.error(`Failed to delete document: ${error.message}`);
    },
  });

  const bulkDeleteMutation = trpc.documentsManagement.bulkDeleteDocuments.useMutation({
    onSuccess: () => {
      toast.success(`${selectedIds.size} documents deleted`);
      setSelectedIds(new Set());
      setBulkActionMode(false);
    },
    onError: (error: any) => {
      toast.error(`Failed to delete documents: ${error.message}`);
    },
  });

  const emptyDocuments: any[] = [];

  const handleDeleteDocument = async (documentId: number) => {
    if (!confirm("Are you sure you want to delete this document? This will also remove all associated vectors.")) {
      return;
    }
    await deleteDocumentMutation.mutateAsync({ documentId });
  };

  const handleToggleSelect = (documentId: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(documentId)) {
      newSelected.delete(documentId);
    } else {
      newSelected.add(documentId);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredDocuments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredDocuments.map((d: any) => d.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} documents? This will also remove all associated vectors.`)) {
      return;
    }
    await bulkDeleteMutation.mutateAsync({ documentIds: Array.from(selectedIds) });
  };

  const handlePreviewDocument = (document: any) => {
    setSelectedDocument(document);
    setShowPreviewModal(true);
  };

  const displayDocuments = documents || emptyDocuments;

  // Filter documents
  const filteredDocuments = displayDocuments.filter((doc: any) => {
    const matchesSearch = 
      doc.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.collection.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = filterStatus === "all" || doc.status === filterStatus;
    const matchesCollection = filterCollection === "all" || doc.collection === filterCollection;

    return matchesSearch && matchesStatus && matchesCollection;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="default" className="gap-1">
            <CheckCircle className="h-3 w-3" />
            Completed
          </Badge>
        );
      case "processing":
        return (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Processing
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Failed
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Calculate statistics
  const stats = {
    total: displayDocuments.length,
    completed: displayDocuments.filter((d: any) => d.status === "completed").length,
    processing: displayDocuments.filter((d: any) => d.status === "processing").length,
    failed: displayDocuments.filter((d: any) => d.status === "failed").length,
    totalChunks: displayDocuments.reduce((sum: number, d: any) => sum + d.chunksCreated, 0),
    totalVectors: displayDocuments.reduce((sum: number, d: any) => sum + d.vectorsStored, 0),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Document Management</h1>
          <p className="text-muted-foreground mt-1">
            View and manage all uploaded documents and their processing status
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={bulkActionMode ? "default" : "outline"}
            onClick={() => {
              setBulkActionMode(!bulkActionMode);
              setSelectedIds(new Set());
            }}
          >
            {bulkActionMode ? "Cancel" : "Select Multiple"}
          </Button>
          {bulkActionMode && selectedIds.size > 0 && (
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
            >
              Delete {selectedIds.size} Selected
            </Button>
          )}
          <Button onClick={() => setLocation("/documents/upload")} className="gap-2">
            <Upload className="h-4 w-4" />
            Upload Document
          </Button>
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      {bulkActionMode && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                >
                  {selectedIds.size === filteredDocuments.length ? "Deselect All" : "Select All"}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {selectedIds.size} of {filteredDocuments.length} selected
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              {stats.completed} completed, {stats.processing} processing
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Chunks</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalChunks}</div>
            <p className="text-xs text-muted-foreground">
              Across all documents
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vectors Stored</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalVectors}</div>
            <p className="text-xs text-muted-foreground">
              In vector database
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.failed}</div>
            <p className="text-xs text-muted-foreground">
              Requires attention
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Search & Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCollection} onValueChange={setFilterCollection}>
              <SelectTrigger className="w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Collections" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Collections</SelectItem>
                <SelectItem value="documents">Documents</SelectItem>
                <SelectItem value="notes">Notes</SelectItem>
                <SelectItem value="data">Data</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Documents List */}
      {documentsLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Loading documents...</p>
          </CardContent>
        </Card>
      ) : filteredDocuments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No documents found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || filterStatus !== "all" || filterCollection !== "all"
                ? "Try adjusting your search or filters"
                : "Upload your first document to get started"}
            </p>
            <Button onClick={() => setLocation("/documents/upload")}>
              Upload Document
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredDocuments.map((document) => (
            <Card key={document.id} className="hover:border-primary/50 transition-colors">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  {bulkActionMode && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(document.id)}
                      onChange={() => handleToggleSelect(document.id)}
                      className="mt-1 h-4 w-4 rounded border-gray-300"
                    />
                  )}
                  <div className="flex-1 space-y-3">
                    {/* Filename and Status */}
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <h3 className="text-lg font-semibold">{document.filename}</h3>
                      {getStatusBadge(document.status || "pending")}
                    </div>

                    {/* Metadata */}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                      <div className="flex items-center gap-1">
                        <Database className="h-4 w-4" />
                        {document.collection}
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(document.uploadedAt), "MMM d, yyyy h:mm a")}
                      </div>
                      <div className="flex items-center gap-1">
                        <FileText className="h-4 w-4" />
                        {document.fileSize}
                      </div>
                      {document.status === "completed" && (
                        <>
                          <div className="flex items-center gap-1">
                            <BarChart3 className="h-4 w-4" />
                            {document.chunksCreated} chunks
                          </div>
                          <div className="flex items-center gap-1">
                            <Database className="h-4 w-4" />
                            {document.vectorsStored} vectors
                          </div>
                        </>
                      )}
                    </div>

                    {/* Error Message */}
                    {document.status === "failed" && document.error && (
                      <div className="text-sm text-destructive">
                        Error: {document.error}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {document.status === "completed" && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handlePreviewDocument(document)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDeleteDocument(document.id)}
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

      {/* Preview Modal */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedDocument?.filename}</DialogTitle>
            <DialogDescription>
              Document details and chunk preview
            </DialogDescription>
          </DialogHeader>
          {selectedDocument && (
            <div className="space-y-4">
              {/* Document Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium">Collection</p>
                  <p className="text-sm text-muted-foreground">{selectedDocument.collection}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">File Size</p>
                  <p className="text-sm text-muted-foreground">{selectedDocument.fileSize}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Chunks Created</p>
                  <p className="text-sm text-muted-foreground">{selectedDocument.chunksCreated}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Vectors Stored</p>
                  <p className="text-sm text-muted-foreground">{selectedDocument.vectorsStored}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Word Count</p>
                  <p className="text-sm text-muted-foreground">{selectedDocument.wordCount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Character Count</p>
                  <p className="text-sm text-muted-foreground">{selectedDocument.charCount.toLocaleString()}</p>
                </div>
              </div>

              {/* Chunk Preview */}
              <div>
                <h4 className="text-sm font-medium mb-2">Chunk Preview</h4>
                <div className="space-y-2">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline">Chunk 1 of {selectedDocument.chunksCreated}</Badge>
                        <span className="text-xs text-muted-foreground">1024 characters</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        This is a preview of the first chunk. In production, this would show the actual
                        chunk content retrieved from the vector database...
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
