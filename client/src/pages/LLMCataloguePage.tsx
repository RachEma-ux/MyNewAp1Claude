import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, Search, Filter, Loader2, Cloud, Server, Package, Download, HardDrive, Zap } from "lucide-react";

export default function LLMCataloguePage() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState<"text" | "code" | "embedding" | "all">("all");
  const [source, setSource] = useState<"all" | "hub" | "providers">("all");

  const { data: catalogModels, isLoading } = trpc.modelDownloads.getUnifiedCatalog.useQuery({
    search: searchQuery || undefined,
    category,
    source,
  });
  const { data: providers } = trpc.providers.list.useQuery();
  const { data: availableProviders = [] } = trpc.llm.listProviders.useQuery();
  const { data: downloads = [] } = trpc.modelDownloads.getAll.useQuery();
  const { data: installedModels = [] } = trpc.models.list.useQuery({});

  const availableProviderCount = availableProviders.length;
  const configuredProviderCount = providers?.length ?? 0;
  const downloadableCount = catalogModels?.filter((m) => !m.isProviderModel).length ?? 0;
  const availableModelCount = downloads.filter((d: any) => d.status === "completed").length;
  const activeModelCount = installedModels.length;

  return (
    <div className="container mx-auto py-8 max-w-6xl px-4">
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/llm")}>
        <ChevronLeft className="h-4 w-4 mr-1" />Back to LLM
      </Button>

      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Catalogue</h1>
        <p className="text-muted-foreground mt-1">
          Unified view of all hub models and registered provider models
        </p>
      </div>

      {/* Row 1: Providers */}
      <div className="grid gap-3 grid-cols-4 mb-3">
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <Server className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
            <p className="text-2xl font-bold">{availableProviderCount || <span className="text-sm text-muted-foreground">Coming soon</span>}</p>
            <p className="text-[11px] text-muted-foreground">Available</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <Cloud className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
            <p className="text-2xl font-bold">{configuredProviderCount || <span className="text-sm text-muted-foreground">Coming soon</span>}</p>
            <p className="text-[11px] text-muted-foreground">Configured</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <Zap className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
            <p className="text-2xl font-bold text-muted-foreground text-sm">Coming soon</p>
            <p className="text-[11px] text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <Server className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
            <p className="text-2xl font-bold text-muted-foreground text-sm">Coming soon</p>
            <p className="text-[11px] text-muted-foreground">Offline</p>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Models */}
      <div className="grid gap-3 grid-cols-4 mb-6">
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <Download className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
            <p className="text-2xl font-bold">{downloadableCount || <span className="text-sm text-muted-foreground">Coming soon</span>}</p>
            <p className="text-[11px] text-muted-foreground">Downloadable</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <HardDrive className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
            <p className="text-2xl font-bold">{availableModelCount || <span className="text-sm text-muted-foreground">Coming soon</span>}</p>
            <p className="text-[11px] text-muted-foreground">Available</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <Zap className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
            <p className="text-2xl font-bold">{activeModelCount || <span className="text-sm text-muted-foreground">Coming soon</span>}</p>
            <p className="text-[11px] text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <Package className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
            <p className="text-2xl font-bold text-muted-foreground text-sm">Coming soon</p>
            <p className="text-[11px] text-muted-foreground">Deprecated</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search models..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={category} onValueChange={(v: any) => setCategory(v)}>
          <SelectTrigger className="w-[180px]">
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
        <Select value={source} onValueChange={(v: any) => setSource(v)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="hub">Hub Models</SelectItem>
            <SelectItem value="providers">Provider Models</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Catalog Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : catalogModels && catalogModels.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {catalogModels
            .filter((m) => (m.name || "").trim() !== "")
            .map((model) => (
              <Card key={`${model.source}-${model.id}`} className="hover:bg-accent/50 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{model.displayName}</CardTitle>
                    {model.isProviderModel ? (
                      <Badge className="bg-blue-600 text-white text-xs">Provider</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Hub</Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs">{model.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-1.5 flex-wrap">
                    <Badge variant="secondary" className="text-xs">{model.category}</Badge>
                    {model.parameters && <Badge variant="outline" className="text-xs">{model.parameters}</Badge>}
                    {model.size && <Badge variant="outline" className="text-xs">{model.size}</Badge>}
                    {model.isProviderModel && model.providerName && (
                      <Badge variant="outline" className="text-xs">{model.providerName}</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No models found matching your filters.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
