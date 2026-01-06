import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Download, Search, Filter, Loader2, CheckCircle2, XCircle, Pause, Settings } from "lucide-react";
import { DownloadSchedulingDialog } from "../components/DownloadSchedulingDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

/**
 * Model Browser Page
 * Browse and download AI models from HuggingFace and Ollama
 */

export default function ModelBrowser() {
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState<"text" | "code" | "embedding" | "all">("all");
  const [schedulingDialogOpen, setSchedulingDialogOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<any>(null);

  // Fetch model catalog
  const { data: models, isLoading: catalogLoading } = trpc.modelDownloads.getCatalog.useQuery({
    search: searchQuery || undefined,
    category,
  });

  // Fetch active downloads
  const { data: activeDownloads, refetch: refetchDownloads } = trpc.modelDownloads.getActive.useQuery();

  // Fetch all downloads
  const { data: allDownloads } = trpc.modelDownloads.getAll.useQuery();

  // Fetch hardware profile for compatibility checking
  const { data: hardwareProfile } = trpc.hardware.getProfile.useQuery();

  const toast = (msg: any) => console.log(msg.title, msg.description);

  // Create download mutation
  const createDownload = trpc.modelDownloads.create.useMutation({
    onSuccess: (data) => {
      console.log("Download created successfully:", data);
      toast({
        title: "Download Started",
        description: "Model download has been queued successfully.",
      });
      refetchDownloads();
    },
    onError: (error) => {
      console.error("Download creation failed:", error);
      toast({
        title: "Download Failed",
        description: error.message || "Failed to start download. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update status mutation
  const updateStatus = trpc.modelDownloads.updateStatus.useMutation({
    onSuccess: () => {
      refetchDownloads();
    },
  });

  const handleDownload = (model: any, options?: { priority?: number; scheduledFor?: Date; bandwidthLimit?: number }) => {
    console.log("Starting download for model:", model, "with options:", options);
    createDownload.mutate({
      modelId: model.id,
      sourceUrl: model.downloadUrl,
      fileSize: model.size,
      priority: options?.priority,
      scheduledFor: options?.scheduledFor,
      bandwidthLimit: options?.bandwidthLimit,
    });
  };

  const openSchedulingDialog = (model: any) => {
    setSelectedModel(model);
    setSchedulingDialogOpen(true);
  };

  const handlePauseResume = (downloadId: number, currentStatus: string) => {
    const newStatus = currentStatus === "downloading" ? "paused" : "downloading";
    updateStatus.mutate({
      downloadId,
      status: newStatus as any,
    });
  };

  const getDownloadForModel = (modelId: number) => {
    return allDownloads?.find((d) => d.modelId === modelId);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-500" />;
      case "downloading":
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case "paused":
        return <Pause className="w-4 h-4 text-yellow-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Model Browser</h1>
        <p className="text-muted-foreground">
          Browse and download AI models from HuggingFace and Ollama
        </p>
      </div>

      {/* Active Downloads Section */}
      {activeDownloads && activeDownloads.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Active Downloads</CardTitle>
            <CardDescription>{activeDownloads.length} downloads in progress</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeDownloads.map((download) => (
              <div key={download.id} className="flex items-center gap-4 p-4 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {getStatusIcon(download.status || 'queued')}
                    <span className="font-medium">Model ID: {download.modelId}</span>
                    <Badge variant="outline">{download.status || 'queued'}</Badge>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${download.progress}%` }}
                    />
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {download.progress}% • {download.bytesDownloaded || '0'} downloaded
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handlePauseResume(download.id, download.status || 'queued')}
                >
                  {download.status === "downloading" ? <Pause className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Search and Filter */}
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search models..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={category} onValueChange={(v: any) => setCategory(v)}>
          <SelectTrigger className="w-[200px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="text">Text Generation</SelectItem>
            <SelectItem value="code">Code Generation</SelectItem>
            <SelectItem value="embedding">Embeddings</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Model Catalog */}
      {catalogLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {models?.map((model) => {
            const download = getDownloadForModel(model.id);
            const isDownloaded = download?.status === "completed";
            const isDownloading = download?.status === "downloading";

            return (
              <Card key={model.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{model.displayName}</CardTitle>
                        {model.currentVersion && (
                          <Badge variant="outline" className="text-xs">v{model.currentVersion}</Badge>
                        )}
                      </div>
                      <CardDescription className="mt-1">{model.description}</CardDescription>
                    </div>
                    {isDownloaded && <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant="secondary">{model.category}</Badge>
                      <Badge variant="outline">{model.parameters}</Badge>
                      <Badge variant="outline">{model.size}</Badge>
                      
                      {/* Hardware Compatibility Badges */}
                      {model.requirements && (
                        <>
                          {model.requirements.gpuRequired ? (
                            <Badge 
                              variant="outline" 
                              className={`${
                                hardwareProfile?.hasGPU 
                                  ? "border-green-500 text-green-500" 
                                  : "border-red-500 text-red-500"
                              }`}
                            >
                              GPU Required
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-blue-500 text-blue-500">
                              CPU-OK
                            </Badge>
                          )}
                          
                          {hardwareProfile?.hasGPU && hardwareProfile.gpuVRAM && (
                            <Badge 
                              variant="outline"
                              className={`${
                                hardwareProfile.gpuVRAM >= model.requirements.minVRAM
                                  ? "border-green-500 text-green-500"
                                  : "border-yellow-500 text-yellow-500"
                              }`}
                            >
                              VRAM: {model.requirements.minVRAM}GB+
                            </Badge>
                          )}
                          
                          {!hardwareProfile?.hasGPU && (
                            <Badge 
                              variant="outline"
                              className={`${
                                hardwareProfile && hardwareProfile.totalRAM >= model.requirements.minRAM
                                  ? "border-green-500 text-green-500"
                                  : "border-yellow-500 text-yellow-500"
                              }`}
                            >
                              RAM: {model.requirements.minRAM}GB+
                            </Badge>
                          )}
                        </>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Source: {model.source || 'Unknown'}</span>
                      {model.availableVersions && model.availableVersions.length > 1 && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs">Version:</span>
                          <Select defaultValue={model.currentVersion}>
                            <SelectTrigger className="w-[100px] h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {model.availableVersions.map((version: string) => (
                                <SelectItem key={version} value={version}>
                                  v{version}
                                  {version === model.currentVersion && " (Latest)"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    {isDownloaded || isDownloading || createDownload.isPending ? (
                      <Button
                        className="w-full"
                        disabled
                      >
                        {createDownload.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Starting...
                          </>
                        ) : isDownloaded ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 mr-2" />
                            Downloaded
                          </>
                        ) : (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Downloading...
                          </>
                        )}
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          className="flex-1"
                          onClick={() => handleDownload(model)}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => openSchedulingDialog(model)}
                          title="Schedule download"
                        >
                          <Settings className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {models && models.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No models found matching your search.</p>
        </div>
      )}

      {/* Download Scheduling Dialog */}
      {selectedModel && (
        <DownloadSchedulingDialog
          open={schedulingDialogOpen}
          onOpenChange={setSchedulingDialogOpen}
          model={selectedModel}
          onConfirm={(options) => handleDownload(selectedModel, options)}
        />
      )}
    </div>
  );
}
