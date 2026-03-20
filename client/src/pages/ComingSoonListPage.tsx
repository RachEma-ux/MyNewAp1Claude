import { useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Search } from "lucide-react";
import { AgentStatusBadge } from "@/components/agents/AgentStatusBadge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

const meta: Record<string, { title: string; description: string }> = {
  providers: { title: "Providers List", description: "Coming soon" },
  llms: { title: "LLMs List", description: "Coming soon" },
  agents: { title: "Agents List", description: "AI agent definitions from AI Types" },
  bots: { title: "Bots List", description: "Coming soon" },
  models: { title: "Models List", description: "Coming soon" },
};

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

export default function ComingSoonListPage() {
  const [, params] = useRoute("/list/:type");
  const type = params?.type ?? "";
  const { title, description } = meta[type] ?? { title: "List", description: "Coming soon" };

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-muted-foreground">{description}</p>
      </div>

      {type === "agents" ? (
        <AgentsListView />
      ) : (
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
