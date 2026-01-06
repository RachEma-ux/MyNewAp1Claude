import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileText, CheckCircle, XCircle, Loader2, File } from "lucide-react";
import { useDropzone } from "react-dropzone";

type ChunkingStrategy = "fixed" | "semantic" | "recursive";
type EmbeddingModel = "bge-large-en" | "bge-base-en" | "minilm-l6" | "e5-large" | "e5-base";

interface UploadedFile {
  file: File;
  status: "pending" | "uploading" | "processing" | "completed" | "error";
  progress: number;
  error?: string;
  documentId?: string;
  chunksCreated?: number;
}

export default function DocumentUpload() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [chunkingStrategy, setChunkingStrategy] = useState<ChunkingStrategy>("semantic");
  const [chunkSize, setChunkSize] = useState(1000);
  const [chunkOverlap, setChunkOverlap] = useState(200);
  const [embeddingModel, setEmbeddingModel] = useState<EmbeddingModel>("bge-base-en");
  const [collectionName, setCollectionName] = useState("documents");
  
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map((file) => ({
      file,
      status: "pending" as const,
      progress: 0,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/plain": [".txt"],
      "text/csv": [".csv"],
      "text/markdown": [".md"],
    },
  });
  
  const uploadMutation = trpc.documentsApi.uploadFile.useMutation();
  
  const handleUpload = async () => {
    for (const uploadedFile of files) {
      if (uploadedFile.status !== "pending") continue;
      
      try {
        // Update status to uploading
        setFiles((prev) =>
          prev.map((f) =>
            f.file === uploadedFile.file
              ? { ...f, status: "uploading" as const, progress: 10 }
              : f
          )
        );
        
        // Read file as base64
        const fileContent = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result as string;
            // Remove data URL prefix (e.g., "data:application/pdf;base64,")
            const base64Content = base64.split(',')[1];
            resolve(base64Content);
          };
          reader.onerror = reject;
          reader.readAsDataURL(uploadedFile.file);
        });
        
        // Update status to processing
        setFiles((prev) =>
          prev.map((f) =>
            f.file === uploadedFile.file
              ? { ...f, status: "processing" as const, progress: 40 }
              : f
          )
        );
        
        // Call tRPC mutation to process document
        const result = await uploadMutation.mutateAsync({
          filename: uploadedFile.file.name,
          fileContent,
          workspaceId: 1, // Default workspace
          collectionName,
          chunkingStrategy,
          chunkSize,
          chunkOverlap,
          embeddingModel,
        });
        
        // Update status to completed
        setFiles((prev) =>
          prev.map((f) =>
            f.file === uploadedFile.file
              ? {
                  ...f,
                  status: "completed" as const,
                  progress: 100,
                  documentId: result.documentId,
                  chunksCreated: result.chunksCreated,
                }
              : f
          )
        );
      } catch (error: any) {
        // Update status to error
        setFiles((prev) =>
          prev.map((f) =>
            f.file === uploadedFile.file
              ? {
                  ...f,
                  status: "error" as const,
                  progress: 0,
                  error: error.message || "Failed to process document",
                }
              : f
          )
        );
      }
    }
  };
  
  const removeFile = (file: File) => {
    setFiles((prev) => prev.filter((f) => f.file !== file));
  };
  
  const getStatusIcon = (status: UploadedFile["status"]) => {
    switch (status) {
      case "pending":
        return <File className="h-4 w-4 text-muted-foreground" />;
      case "uploading":
      case "processing":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };
  
  const getStatusBadge = (status: UploadedFile["status"]) => {
    const variants: Record<UploadedFile["status"], "default" | "secondary" | "destructive"> = {
      pending: "secondary",
      uploading: "default",
      processing: "default",
      completed: "default",
      error: "destructive",
    };
    
    return <Badge variant={variants[status]}>{status}</Badge>;
  };
  
  return (
    <div className="container py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Document Upload</h1>
        <p className="text-muted-foreground">
          Upload documents to build your knowledge base for RAG
        </p>
      </div>
      
      {/* Upload Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Configuration</CardTitle>
          <CardDescription>Configure how documents will be processed</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Chunking Strategy */}
            <div className="space-y-2">
              <Label>Chunking Strategy</Label>
              <Select value={chunkingStrategy} onValueChange={(v) => setChunkingStrategy(v as ChunkingStrategy)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed Size</SelectItem>
                  <SelectItem value="semantic">Semantic (Paragraphs)</SelectItem>
                  <SelectItem value="recursive">Recursive (Hierarchical)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {chunkingStrategy === "fixed" && "Split text into fixed-size chunks"}
                {chunkingStrategy === "semantic" && "Split at natural boundaries (paragraphs)"}
                {chunkingStrategy === "recursive" && "Split hierarchically (paragraphs → sentences)"}
              </p>
            </div>
            
            {/* Embedding Model */}
            <div className="space-y-2">
              <Label>Embedding Model</Label>
              <Select value={embeddingModel} onValueChange={(v) => setEmbeddingModel(v as EmbeddingModel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bge-large-en">BGE Large EN (Best Quality)</SelectItem>
                  <SelectItem value="bge-base-en">BGE Base EN (Balanced)</SelectItem>
                  <SelectItem value="minilm-l6">MiniLM L6 (Fastest)</SelectItem>
                  <SelectItem value="e5-large">E5 Large</SelectItem>
                  <SelectItem value="e5-base">E5 Base</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Chunk Size */}
            <div className="space-y-2">
              <Label>Chunk Size (characters)</Label>
              <Input
                type="number"
                value={chunkSize}
                onChange={(e) => setChunkSize(Number(e.target.value))}
                min={100}
                max={4000}
              />
              <p className="text-xs text-muted-foreground">
                Recommended: 500-1500 for most documents
              </p>
            </div>
            
            {/* Chunk Overlap */}
            <div className="space-y-2">
              <Label>Chunk Overlap (characters)</Label>
              <Input
                type="number"
                value={chunkOverlap}
                onChange={(e) => setChunkOverlap(Number(e.target.value))}
                min={0}
                max={500}
              />
              <p className="text-xs text-muted-foreground">
                Overlap between chunks to preserve context
              </p>
            </div>
            
            {/* Collection Name */}
            <div className="space-y-2 md:col-span-2">
              <Label>Collection Name</Label>
              <Input
                value={collectionName}
                onChange={(e) => setCollectionName(e.target.value)}
                placeholder="documents"
              />
              <p className="text-xs text-muted-foreground">
                Vector database collection to store embeddings
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* File Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Files</CardTitle>
          <CardDescription>
            Drag and drop files or click to browse (PDF, DOCX, TXT, CSV, Markdown)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
              isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            {isDragActive ? (
              <p className="text-lg font-medium">Drop files here...</p>
            ) : (
              <>
                <p className="text-lg font-medium mb-2">Drag & drop files here</p>
                <p className="text-sm text-muted-foreground">or click to select files</p>
              </>
            )}
          </div>
          
          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{files.length} file(s) selected</h3>
                <Button
                  onClick={handleUpload}
                  disabled={files.every((f) => f.status !== "pending")}
                >
                  Upload & Process
                </Button>
              </div>
              
              <div className="space-y-2">
                {files.map((uploadedFile, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {getStatusIcon(uploadedFile.status)}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{uploadedFile.file.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {(uploadedFile.file.size / 1024).toFixed(1)} KB
                          {uploadedFile.chunksCreated && ` • ${uploadedFile.chunksCreated} chunks created`}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {getStatusBadge(uploadedFile.status)}
                      {uploadedFile.status === "pending" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(uploadedFile.file)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
