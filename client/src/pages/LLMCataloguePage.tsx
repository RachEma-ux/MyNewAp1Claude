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
import { Separator } from "@/components/ui/separator";
import { ChevronLeft, Search, Filter, Loader2, Cloud, Server, Package, Download, HardDrive, Zap, Brain, FlaskConical, ShieldCheck, ShieldX } from "lucide-react";

export default function LLMCataloguePage() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState<"text" | "code" | "embedding" | "all">("all");
  const [source, setSource] = useState<"all" | "hub" | "providers" | "registry">("all");

  const { data: catalogModels, isLoading } = trpc.modelDownloads.getUnifiedCatalog.useQuery({
    search: searchQuery || undefined,
    category,
    source,
  });
  const { data: providers } = trpc.providers.list.useQuery();
  const { data: availableProviders = [] } = trpc.llm.listProviders.useQuery();
  const { data: downloads = [] } = trpc.modelDownloads.getAll.useQuery();
  const { data: installedModels = [] } = trpc.models.list.useQuery({});
  const { data: llmIdentities = [] } = trpc.llm.list.useQuery({});
  const { data: creationProjects = [] } = trpc.llm.listCreationProjects.useQuery({});
  const { data: registryEntries = [] } = trpc.catalogRegistry.listForDropdown.useQuery({});

  const availableProviderCount = availableProviders.length;
  const configuredProviderCount = providers?.length ?? 0;
  const downloadableCount = catalogModels?.filter((m) => !m.isProviderModel).length ?? 0;
  const availableModelCount = downloads.filter((d: any) => d.status === "completed").length;
  const activeModelCount = installedModels.length;

  return (
    <div className="container mx-auto py-8 max-w-6xl px-4">
      <div className="flex gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/llm")}>
          <ChevronLeft className="h-4 w-4 mr-1" />Back to LLM
        </Button>
        <Button variant="ghost" size="sm" onClick={() => navigate("/llm/catalogue/manage")}>
          <ChevronLeft className="h-4 w-4 mr-1" />Back to Manage Catalogue
        </Button>
      </div>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Catalogue</h1>
          <p className="text-muted-foreground mt-1">
            Unified view of all hub models and registered provider models
          </p>
        </div>
        <Button onClick={() => navigate("/llm/catalogue/manage")}>Manage</Button>
      </div>

      {/* Row 1: Providers */}
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Providers</p>
      <div className="grid gap-2 grid-cols-4 mb-4">
        <Card>
          <CardContent className="py-2 px-3 text-center">
            <Server className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-0.5" />
            <p className="text-lg font-bold leading-tight">{availableProviderCount || <span className="text-[10px] text-muted-foreground">Coming soon</span>}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Available</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2 px-3 text-center">
            <Cloud className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-0.5" />
            <p className="text-lg font-bold leading-tight">{configuredProviderCount || <span className="text-[10px] text-muted-foreground">Coming soon</span>}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Configured</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2 px-3 text-center">
            <Brain className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-0.5" />
            <p className="text-lg font-bold leading-tight">{llmIdentities.length || <span className="text-[10px] text-muted-foreground">0</span>}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Registered LLMs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2 px-3 text-center">
            <FlaskConical className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-0.5" />
            <p className="text-lg font-bold leading-tight">{creationProjects.length || <span className="text-[10px] text-muted-foreground">0</span>}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Projects</p>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Models */}
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Models</p>
      <div className="grid gap-2 grid-cols-4 mb-6">
        <Card>
          <CardContent className="py-2 px-3 text-center">
            <Download className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-0.5" />
            <p className="text-lg font-bold leading-tight">{downloadableCount || <span className="text-[10px] text-muted-foreground">Coming soon</span>}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Downloadable</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2 px-3 text-center">
            <HardDrive className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-0.5" />
            <p className="text-lg font-bold leading-tight">{availableModelCount || <span className="text-[10px] text-muted-foreground">Coming soon</span>}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Available</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2 px-3 text-center">
            <Zap className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-0.5" />
            <p className="text-lg font-bold leading-tight">{activeModelCount || <span className="text-[10px] text-muted-foreground">Coming soon</span>}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2 px-3 text-center">
            <Package className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-0.5" />
            <p className="text-lg font-bold leading-tight text-muted-foreground text-[10px]">Coming soon</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Deprecated</p>
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
            <SelectItem value="registry">Published Registry</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Registered LLMs */}
      {llmIdentities.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">Registered LLMs</h2>
            <Badge variant="secondary" className="text-xs">{llmIdentities.length}</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {llmIdentities
              .filter((llm: any) => !searchQuery || llm.name.toLowerCase().includes(searchQuery.toLowerCase()))
              .map((llm: any) => (
                <Card key={`llm-${llm.id}`} className="hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => navigate(`/llm/${llm.id}`)}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base">{llm.name}</CardTitle>
                      <Badge className="bg-purple-600 text-white text-xs">LLM</Badge>
                    </div>
                    <CardDescription className="text-xs">{llm.description || "No description"}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-1.5 flex-wrap">
                      <Badge variant="secondary" className="text-xs capitalize">{llm.role}</Badge>
                      {llm.ownerTeam && <Badge variant="outline" className="text-xs">{llm.ownerTeam}</Badge>}
                      {llm.archived && <Badge variant="destructive" className="text-xs">Archived</Badge>}
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>
      )}

      {/* Creation Projects */}
      {creationProjects.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <FlaskConical className="h-4 w-4 text-orange-500" />
            <h2 className="text-lg font-semibold">Creation Projects</h2>
            <Badge variant="secondary" className="text-xs">{creationProjects.length}</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {creationProjects
              .filter((p: any) => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()))
              .map((project: any) => (
                <Card key={`proj-${project.id}`} className="hover:bg-accent/50 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base">{project.name}</CardTitle>
                      <Badge variant="outline" className="text-xs capitalize">{project.status}</Badge>
                    </div>
                    <CardDescription className="text-xs">
                      {project.baseModel?.name || "Custom model"} &middot; {project.target?.useCase?.replace(/_/g, " ") || "General"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-1.5 flex-wrap">
                      <Badge variant="secondary" className="text-xs">{project.baseModel?.size || "—"}</Badge>
                      <Badge variant="outline" className="text-xs capitalize">{project.currentPhase?.replace(/_/g, " ").replace("phase ", "P") || "Planning"}</Badge>
                      {project.progress > 0 && <Badge variant="outline" className="text-xs">{project.progress}%</Badge>}
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>
      )}

      {(llmIdentities.length > 0 || creationProjects.length > 0) && <Separator className="mb-6" />}

      {/* Providers Section */}
      {providers && providers.length > 0 && (source === "all" || source === "providers") && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Server className="h-4 w-4 text-blue-500" />
            <h2 className="text-lg font-semibold">Providers</h2>
            <Badge variant="secondary" className="text-xs">{providers.filter((p: any) => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())).length}</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {providers
              .filter((p: any) => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()))
              .map((provider: any) => {
                const config = provider.config || {};
                const modelCount = (config.models || []).length;
                const isLocal = provider.type?.startsWith("local-") || provider.kind === "local";
                const endpoint = config.apiEndpoint || config.baseUrl || config.baseURL || "";
                return (
                  <Card key={`provider-${provider.id}`} className="hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => navigate(`/providers/${provider.id}`)}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base">{provider.name}</CardTitle>
                        <Badge className="bg-blue-600 text-white text-xs">Provider</Badge>
                      </div>
                      <CardDescription className="text-xs">
                        {provider.type} {endpoint ? `\u2022 ${endpoint}` : ""}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-1.5 flex-wrap">
                        {isLocal ? (
                          <Badge variant="secondary" className="text-xs"><Server className="h-3 w-3 mr-1" />Local</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs"><Cloud className="h-3 w-3 mr-1" />Cloud</Badge>
                        )}
                        <Badge variant="outline" className="text-xs">{modelCount} model{modelCount !== 1 ? "s" : ""}</Badge>
                        {provider.enabled ? (
                          <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-xs">Active</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">Disabled</Badge>
                        )}
                        {provider.priority != null && (
                          <Badge variant="outline" className="text-xs">Priority {provider.priority}</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </div>
      )}

      {providers && providers.length > 0 && <Separator className="mb-6" />}

      {/* Models Section */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : catalogModels && catalogModels.filter((m) => (m.name || "").trim() !== "").length > 0 ? (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Package className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Models</h2>
            <Badge variant="secondary" className="text-xs">{catalogModels.filter((m) => (m.name || "").trim() !== "").length}</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {catalogModels
              .filter((m) => (m.name || "").trim() !== "")
              .map((model) => {
                const hubModelNames = new Set(installedModels.map((m: any) => m.name?.toLowerCase()));
                const isInHub = hubModelNames.has(model.name?.toLowerCase());
                const governanceNames = new Set(llmIdentities.map((l: any) => l.name?.toLowerCase()));
                const isInGovernance = governanceNames.has(model.name?.toLowerCase());
                const purposeBuilt = model.bestFor || "";
                return (
                  <Card key={`${model.source}-${model.id}`} className="hover:bg-accent/50 transition-colors">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base">{model.displayName}</CardTitle>
                        <Badge variant="outline" className="text-xs">Model</Badge>
                      </div>
                      <CardDescription className="text-xs">
                        {purposeBuilt ? `Purpose-built: ${purposeBuilt}` : "Purpose-built: empty"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-1.5 flex-wrap">
                        <Badge variant="secondary" className="text-xs">{model.category}</Badge>
                        {model.parameters && <Badge variant="outline" className="text-xs">{model.parameters}</Badge>}
                        {model.size && <Badge variant="outline" className="text-xs">{model.size}</Badge>}
                        {model.isProviderModel && (
                          <Badge className="bg-blue-600/20 text-blue-400 border-blue-600/30 text-xs">{model.providerName}</Badge>
                        )}
                        {isInHub ? (
                          <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-xs"><HardDrive className="h-3 w-3 mr-1" />Hub</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">Not in Hub</Badge>
                        )}
                        {isInGovernance ? (
                          <Badge className="bg-purple-600/20 text-purple-400 border-purple-600/30 text-xs"><ShieldCheck className="h-3 w-3 mr-1" />Governance</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground"><ShieldX className="h-3 w-3 mr-1" />Not in Governance</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No models found matching your filters.</p>
          </CardContent>
        </Card>
      )}

      {/* Published Registry Section */}
      {(source === "all" || source === "registry") && registryEntries.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-4 w-4 text-green-500" />
            <h2 className="text-lg font-semibold">Published Registry</h2>
            <Badge variant="secondary" className="text-xs">{registryEntries.length}</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {registryEntries.map((entry: any) => (
              <Card key={entry.id} className="hover:bg-accent/50 transition-colors border-green-900/30">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{entry.displayName || entry.name}</CardTitle>
                    <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-xs">
                      Published
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    {entry.entryType === "provider" ? "Provider" : "Model"} &middot; v{entry.versionLabel}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-1.5 flex-wrap">
                    <Badge variant="outline" className="text-xs">{entry.entryType}</Badge>
                    {(entry.tags || []).slice(0, 3).map((tag: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                    <Badge variant="outline" className="text-xs font-mono">
                      {entry.snapshotHash?.substring(0, 8)}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
