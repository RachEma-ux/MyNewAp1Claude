import { useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Search, Cloud, Server, Package, Bot } from "lucide-react";
import { AgentStatusBadge } from "@/components/agents/AgentStatusBadge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

const meta: Record<string, { title: string; description: string }> = {
  providers: { title: "Providers List", description: "All registered LLM providers" },
  llms: { title: "LLMs List", description: "Governed LLM registry" },
  agents: { title: "Agents List", description: "AI agent definitions from AI Types" },
  bots: { title: "Bots List", description: "Governed bot entities bound to agents and channels" },
  models: { title: "Models List", description: "Governed model catalog entries" },
};

// ── Agents List ─────────────────────────────────────────────────────

function AgentsListView() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const { data: agents = [], isLoading, error } = trpc.agents.list.useQuery();

  const filteredAgents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return agents;

    return agents.filter((agent) =>
      agent.name.toLowerCase().includes(query) ||
      (agent.description ?? "").toLowerCase().includes(query) ||
      (agent.roleClass ?? "").toLowerCase().includes(query) ||
      String(agent.modelId ?? "").toLowerCase().includes(query)
    );
  }, [agents, searchQuery]);

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-48 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>Failed to load agents</CardTitle>
          <CardDescription>{error.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search agents by name, role, description, or model..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="pl-10"
        />
      </div>

      {filteredAgents.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No agents found</CardTitle>
            <CardDescription>
              {searchQuery ? "No agent definitions match this search." : "No agent definitions are available yet."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredAgents.map((agent) => (
            <Card
              key={agent.id}
              className="cursor-pointer transition-colors hover:border-primary/40"
              onClick={() => navigate(`/agents/${agent.id}`)}
            >
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-lg">{agent.name}</CardTitle>
                    <CardDescription className="mt-2 line-clamp-2 min-h-[2.5rem]">
                      {agent.description?.trim() || "No description provided."}
                    </CardDescription>
                  </div>
                  <AgentStatusBadge status={agent.status || "draft"} />
                </div>
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  <span className="rounded-md bg-muted px-2 py-1 font-medium text-foreground">{agent.roleClass}</span>
                  <span className="rounded-md border px-2 py-1">{agent.modelId || "No model"}</span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Open agent details</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Providers List ──────────────────────────────────────────────────

function ProvidersListView() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const { data: providers = [], isLoading, error } = trpc.providers.list.useQuery({});

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return providers;
    return providers.filter((p) =>
      p.name.toLowerCase().includes(query) ||
      p.type.toLowerCase().includes(query)
    );
  }, [providers, searchQuery]);

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-40 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>Failed to load providers</CardTitle>
          <CardDescription>{error.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search providers by name or type..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="pl-10"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No providers found</CardTitle>
            <CardDescription>
              {searchQuery ? "No providers match this search." : "No providers registered yet."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((provider) => {
            const isLocal = ["local-llamacpp", "local-ollama"].includes(provider.type);
            return (
              <Card
                key={provider.id}
                className="cursor-pointer transition-colors hover:border-primary/40"
                onClick={() => navigate(`/providers/${provider.id}`)}
              >
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      {isLocal ? (
                        <Server className="h-5 w-5 text-orange-500 shrink-0" />
                      ) : (
                        <Cloud className="h-5 w-5 text-blue-500 shrink-0" />
                      )}
                      <CardTitle className="truncate text-lg">{provider.name}</CardTitle>
                    </div>
                    <Badge variant={provider.enabled ? "default" : "secondary"} className="text-xs shrink-0">
                      {provider.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <Badge variant="outline" className="text-xs">{provider.type}</Badge>
                    {(provider as any).lifecycleStatus && (
                      <Badge variant="outline" className="text-xs capitalize">
                        {(provider as any).lifecycleStatus}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Priority: {provider.priority ?? 50}
                    {provider.costPer1kTokens ? ` | Cost: $${provider.costPer1kTokens}/1k` : ""}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Models List ─────────────────────────────────────────────────────

function ModelsListView() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const { data: models = [], isLoading, error } = trpc.models.list.useQuery();

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return models;
    return models.filter((m: any) =>
      m.name.toLowerCase().includes(query) ||
      (m.displayName ?? "").toLowerCase().includes(query) ||
      (m.category ?? "").toLowerCase().includes(query)
    );
  }, [models, searchQuery]);

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-40 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>Failed to load models</CardTitle>
          <CardDescription>{error.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search models by name or category..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="pl-10"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No models found</CardTitle>
            <CardDescription>
              {searchQuery ? "No models match this search." : "No models registered yet."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((model: any) => (
            <Card
              key={model.id}
              className="cursor-pointer transition-colors hover:border-primary/40"
              onClick={() => navigate(`/models`)}
            >
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <Package className="h-5 w-5 text-purple-500 shrink-0" />
                    <CardTitle className="truncate text-lg">{model.displayName || model.name}</CardTitle>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-xs shrink-0 ${
                      model.status === "active" ? "text-green-500 border-green-500/30" :
                      model.status === "draft" ? "text-yellow-500 border-yellow-500/30" :
                      model.status === "deprecated" ? "text-gray-400 border-gray-500/30" :
                      ""
                    }`}
                  >
                    {model.status}
                  </Badge>
                </div>
                {model.description && (
                  <CardDescription className="line-clamp-2">{model.description}</CardDescription>
                )}
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge variant="outline" className="text-xs">{model.category || "uncategorized"}</Badge>
                  {model.reviewState && (
                    <Badge variant="outline" className="text-xs capitalize">{model.reviewState.replace("_", " ")}</Badge>
                  )}
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Bots List ───────────────────────────────────────────────────────

function BotsListView() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const { data: bots = [], isLoading, error } = trpc.bots.list.useQuery();

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return bots;
    return bots.filter((b: any) =>
      b.name.toLowerCase().includes(query) ||
      (b.displayName ?? "").toLowerCase().includes(query) ||
      (b.description ?? "").toLowerCase().includes(query)
    );
  }, [bots, searchQuery]);

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-40 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>Failed to load bots</CardTitle>
          <CardDescription>{error.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search bots by name or description..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="pl-10"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No bots found</CardTitle>
            <CardDescription>
              {searchQuery ? "No bots match this search." : "No bots created yet."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((bot: any) => {
            const config = (bot.config as Record<string, any>) || {};
            const lifecycle = config.lifecycleStatus || "draft";
            const channels: string[] = config.channels || [];
            return (
              <Card
                key={bot.id}
                className="cursor-pointer transition-colors hover:border-primary/40"
                onClick={() => navigate(`/bots/dashboard`)}
              >
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <Bot className="h-5 w-5 text-cyan-500 shrink-0" />
                      <CardTitle className="truncate text-lg">{bot.displayName || bot.name}</CardTitle>
                    </div>
                    <Badge variant="outline" className="text-xs capitalize shrink-0">{lifecycle}</Badge>
                  </div>
                  {bot.description && (
                    <CardDescription className="line-clamp-2">{bot.description}</CardDescription>
                  )}
                  <div className="flex flex-wrap gap-2 text-sm">
                    {config.agentId && (
                      <Badge variant="outline" className="text-xs">Agent #{config.agentId}</Badge>
                    )}
                    {config.llmId && (
                      <Badge variant="outline" className="text-xs">LLM #{config.llmId}</Badge>
                    )}
                    {channels.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {channels.length} channel{channels.length !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export default function ComingSoonListPage() {
  const [, params] = useRoute("/list/:type");
  const type = params?.type ?? "";
  const { title, description } = meta[type] ?? { title: "List", description: "" };

  const hasView = ["agents", "providers", "models", "bots"].includes(type);

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-muted-foreground">{description}</p>
      </div>

      {type === "agents" && <AgentsListView />}
      {type === "providers" && <ProvidersListView />}
      {type === "models" && <ModelsListView />}
      {type === "bots" && <BotsListView />}
      {!hasView && (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Card className="w-full max-w-md text-center">
            <CardHeader className="space-y-4 py-12">
              <Clock className="mx-auto h-12 w-12 text-muted-foreground" />
              <CardTitle className="text-xl">Coming soon</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}
    </div>
  );
}
