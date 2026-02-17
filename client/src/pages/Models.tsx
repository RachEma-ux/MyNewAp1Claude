import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Package, Download, Loader2, CheckCircle2, AlertCircle, Cpu, History, Clock, XCircle, RotateCw, Trash2 } from "lucide-react";
import { useLocation } from "wouter";

export default function Models() {
  const [, setLocation] = useLocation();
  const [selectedType, setSelectedType] = useState<"llm" | "embedding" | "reranker" | undefined>(undefined);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const toast = (msg: any) => console.log(msg.title, msg.description);
  
  const { data: models, isLoading } = trpc.models.list.useQuery({ type: selectedType });
  const { data: downloadHistory } = trpc.modelDownloads.getAll.useQuery();
  const { data: catalogModels } = trpc.modelDownloads.getUnifiedCatalog.useQuery({});
  const deleteDownload = trpc.modelDownloads.delete.useMutation({
    onSuccess: () => {
      toast({ title: "Download history entry deleted" });
    },
  });
  const retryDownload = trpc.modelDownloads.updateStatus.useMutation({
    onSuccess: () => {
      toast({ title: "Download restarted" });
    },
  });

  const getStatusIcon = (status: string | null) => {
    if (!status) return null;
    switch (status) {
      case "ready":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "downloading":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "converting":
        return <Loader2 className="h-4 w-4 animate-spin text-orange-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string | null) => {
    if (!status) return <Badge variant="outline">Unknown</Badge>;
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      ready: "default",
      downloading: "secondary",
      converting: "secondary",
      error: "destructive",
    };
    return (
      <Badge variant={variants[status] || "outline"} className="capitalize">
        {status}
      </Badge>
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Model Management</h1>
          <p className="text-muted-foreground mt-2">
            Browse, download, and manage AI models for local inference
          </p>
        </div>
        <Button onClick={() => setLocation("/models/browser")}>
          <Download className="mr-2 h-4 w-4" />
          Browse All Models
        </Button>
      </div>

      {/* Dropdown Card */}
      <Card>
        <CardContent className="pt-6">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="h-9 px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Select a model...</option>
            {catalogModels
              ?.filter((m) => (m.name || "").trim() !== "")
              .map((m) => (
                <option key={`${m.source}-${m.id}`} value={m.name}>
                  {m.displayName}{m.isProviderModel && m.providerName ? ` (${m.providerName})` : ""}
                </option>
              ))}
          </select>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="all" onClick={() => setSelectedType(undefined)}>
            All Models
          </TabsTrigger>
          <TabsTrigger value="llm" onClick={() => setSelectedType("llm")}>
            LLM Models
          </TabsTrigger>
          <TabsTrigger value="embedding" onClick={() => setSelectedType("embedding")}>
            Embedding Models
          </TabsTrigger>
          <TabsTrigger value="reranker" onClick={() => setSelectedType("reranker")}>
            Reranker Models
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="mr-2 h-4 w-4" />
            Download History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {!models || models.length === 0 ? (
            <Card className="border-dashed">
              <CardHeader className="text-center py-12">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent">
                  <Package className="h-8 w-8 text-muted-foreground" />
                </div>
                <CardTitle>No models installed</CardTitle>
                <CardDescription className="max-w-md mx-auto">
                  Download AI models from the model hub to start using local inference
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {models.map((model) => (
                <Card key={model.id} className="hover:bg-accent/50 transition-colors">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                          <Package className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <CardTitle className="text-lg">{model.displayName}</CardTitle>
                          <CardDescription className="mt-1">
                            {model.architecture || model.name || "Unknown"}
                          </CardDescription>
                        </div>
                      </div>
                      {getStatusIcon(model.status)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Type</span>
                        <Badge variant="outline" className="capitalize">
                          {model.modelType}
                        </Badge>
                      </div>
                      {model.parameterCount && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Parameters</span>
                          <span className="font-medium">{model.parameterCount || "Unknown"}</span>
                        </div>
                      )}
                      {model.quantization && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Quantization</span>
                          <span className="font-medium">{model.quantization}</span>
                        </div>
                      )}
                      {model.contextLength && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Context Length</span>
                          <span className="font-medium">{model.contextLength.toLocaleString()}</span>
                        </div>
                      )}
                      {model.fileSize && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Size</span>
                          <span className="font-medium">{model.fileSize}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Status</span>
                        {getStatusBadge(model.status)}
                      </div>
                      {model.status === "downloading" && model.downloadProgress !== undefined && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Downloading...</span>
                            <span>{model.downloadProgress}%</span>
                          </div>
                          <div className="h-2 bg-accent rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${model.downloadProgress}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {model.status === "ready" && model.tokensPerSecond && (
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground pt-2 border-t">
                          <Cpu className="h-4 w-4" />
                          <span>{model.tokensPerSecond} tokens/s</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Download History Tab */}
        <TabsContent value="history" className="space-y-4">
          {!downloadHistory || downloadHistory.length === 0 ? (
            <Card className="border-dashed">
              <CardHeader className="text-center py-12">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent">
                  <History className="h-8 w-8 text-muted-foreground" />
                </div>
                <CardTitle>No download history</CardTitle>
                <CardDescription className="max-w-md mx-auto">
                  Your model download history will appear here
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="space-y-3">
              {downloadHistory.map((download) => {
                const isCompleted = download.status === "completed";
                const isFailed = download.status === "failed";
                const isActive = download.status === "downloading" || download.status === "queued" || download.status === "paused";
                
                return (
                  <Card key={download.id} className={isFailed ? "border-destructive/50" : ""}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            {isCompleted && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                            {isFailed && <XCircle className="h-5 w-5 text-destructive" />}
                            {isActive && <Loader2 className="h-5 w-5 animate-spin text-blue-500" />}
                            <h3 className="font-semibold">Model ID: {download.modelId}</h3>
                            <Badge variant={isCompleted ? "default" : isFailed ? "destructive" : "secondary"} className="capitalize">
                              {download.status}
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground mt-3">
                            <div className="flex items-center space-x-2">
                              <Clock className="h-4 w-4" />
                              <span>Started: {new Date(download.createdAt).toLocaleString()}</span>
                            </div>
                            {download.completedAt && (
                              <div className="flex items-center space-x-2">
                                <CheckCircle2 className="h-4 w-4" />
                                <span>Completed: {new Date(download.completedAt).toLocaleString()}</span>
                              </div>
                            )}
                            {download.fileSize && (
                              <div>
                                <span className="font-medium">Size:</span> {download.fileSize}
                              </div>
                            )}
                            {download.progress !== null && (
                              <div>
                                <span className="font-medium">Progress:</span> {download.progress}%
                              </div>
                            )}
                          </div>

                          {download.errorMessage && (
                            <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                              <p className="text-sm text-destructive font-medium">Error:</p>
                              <p className="text-sm text-destructive/80 mt-1">{download.errorMessage}</p>
                            </div>
                          )}

                          {download.sourceUrl && (
                            <div className="mt-2 text-xs text-muted-foreground truncate">
                              Source: {download.sourceUrl}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center space-x-2 ml-4">
                          {isFailed && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => retryDownload.mutate({
                                downloadId: download.id,
                                status: "queued",
                              })}
                            >
                              <RotateCw className="h-4 w-4 mr-1" />
                              Retry
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteDownload.mutate({ downloadId: download.id })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
