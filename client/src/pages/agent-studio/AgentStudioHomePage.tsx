/**
 * AI Agent Studio — Module Home Page
 *
 * Inventory: summary cards, filter panel, agent table, review queue.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Bot,
  Plus,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  PauseCircle,
  Search as SearchIcon,
} from "lucide-react";
import {
  PageHeader,
  EmptyState,
  LifecycleBadge,
  LoadingState,
} from "@/components/agent-studio/ui";

export default function AgentStudioHomePage({
  homeMode = "list",
}: {
  homeMode?: "list" | "templates" | "import";
}) {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string | undefined>(undefined);

  const summaryQuery = trpc.agentStudio.home.getHomeSummary.useQuery();
  const agentsQuery = trpc.agentStudio.home.listAgents.useQuery({
    state: stateFilter as any,
    search,
    limit: 100,
  });
  const reviewQuery = trpc.agentStudio.home.getReviewQueue.useQuery();

  const summary = summaryQuery.data;
  const agents = agentsQuery.data ?? [];
  const reviewQueue = reviewQuery.data ?? [];

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="AI Agent Studio"
        subtitle="Standalone agent lifecycle module — design, simulate, govern, test, release"
        icon={<Bot className="h-4 w-4 text-blue-500" />}
        actions={
          <Button size="sm" onClick={() => navigate("/agent-studio/new")}>
            <Plus className="h-3.5 w-3.5 mr-1" /> New Agent
          </Button>
        }
      />

      {/* Mode banner — when arriving via /agent-studio/templates or /agent-studio/import */}
      {homeMode === "templates" && (
        <Card>
          <CardContent className="p-3 flex items-center justify-between">
            <div className="text-xs">
              <strong>Template gallery</strong> —{" "}
              <span className="text-muted-foreground">
                Browse starting templates. Phase 5 will populate this gallery; for now
                use "Create from template" in New Agent.
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/agent-studio/new")}>
              Create from Template
            </Button>
          </CardContent>
        </Card>
      )}
      {homeMode === "import" && (
        <Card>
          <CardContent className="p-3 flex items-center justify-between">
            <div className="text-xs">
              <strong>Import agent definition</strong> —{" "}
              <span className="text-muted-foreground">
                Paste a JSON definition to create an agent from an external source.
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/agent-studio/new")}>
              Open Import
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <SummaryCard
          icon={<Bot className="h-7 w-7 text-blue-500 opacity-60" />}
          value={summary?.totalAgents ?? "—"}
          label="Total Agents"
        />
        <SummaryCard
          icon={<Bot className="h-7 w-7 text-cyan-500 opacity-60" />}
          value={summary?.drafts ?? "—"}
          label="Drafts"
        />
        <SummaryCard
          icon={<CheckCircle2 className="h-7 w-7 text-emerald-500 opacity-60" />}
          value={summary?.published ?? "—"}
          label="Published"
        />
        <SummaryCard
          icon={<AlertTriangle className="h-7 w-7 text-yellow-500 opacity-60" />}
          value={summary?.reviewRequired ?? "—"}
          label="Review Req."
        />
        <SummaryCard
          icon={<ShieldAlert className="h-7 w-7 text-red-500 opacity-60" />}
          value={summary?.blocked ?? "—"}
          label="Blocked"
        />
        <SummaryCard
          icon={<PauseCircle className="h-7 w-7 text-emerald-500 opacity-60" />}
          value={summary?.readyToPublish ?? "—"}
          label="Ready"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Inventory + filters */}
        <div className="lg:col-span-2 space-y-3">
          <Card>
            <CardContent className="p-3 space-y-3">
              {/* Filter row */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/60" />
                  <Input
                    placeholder="Search by name, key, or description…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-7 text-xs pl-7"
                  />
                </div>
                <select
                  className="h-7 px-2 rounded border bg-background text-xs"
                  value={stateFilter ?? ""}
                  onChange={(e) => setStateFilter(e.target.value || undefined)}
                >
                  <option value="">All states</option>
                  <option value="new">New</option>
                  <option value="draft">Draft</option>
                  <option value="in_design">In Design</option>
                  <option value="simulated">Simulated</option>
                  <option value="tested">Tested</option>
                  <option value="review_required">Review Required</option>
                  <option value="blocked">Blocked</option>
                  <option value="ready_to_publish">Ready to Publish</option>
                  <option value="published">Published</option>
                  <option value="deprecated">Deprecated</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              {agentsQuery.isLoading ? (
                <LoadingState label="Loading agents…" />
              ) : agents.length === 0 ? (
                <EmptyState
                  icon={<Bot className="h-7 w-7" />}
                  title="No agents yet"
                  description="Create a blank agent or pick a template to get started."
                  action={
                    <Button
                      size="sm"
                      onClick={() => navigate("/agent-studio/new")}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Create First Agent
                    </Button>
                  }
                />
              ) : (
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-muted-foreground/70 border-b">
                    <tr>
                      <th className="text-left py-1.5 font-semibold">Name</th>
                      <th className="text-left py-1.5 font-semibold">Class</th>
                      <th className="text-left py-1.5 font-semibold">State</th>
                      <th className="text-left py-1.5 font-semibold">Env</th>
                      <th className="text-left py-1.5 font-semibold">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((a: any) => (
                      <tr
                        key={a.id}
                        className="border-t hover:bg-muted/40 cursor-pointer transition-colors"
                        onClick={() => navigate(`/agent-studio/${a.id}/overview`)}
                      >
                        <td className="py-2">
                          <div className="font-medium">{a.name}</div>
                          <div className="text-[10px] text-muted-foreground/70 font-mono">
                            {a.internalKey}
                          </div>
                        </td>
                        <td>
                          <Badge variant="outline" className="text-[9px] uppercase tracking-wider">
                            {a.agentClass}
                          </Badge>
                        </td>
                        <td>
                          <LifecycleBadge state={a.lifecycleState} />
                        </td>
                        <td className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          {a.environment}
                        </td>
                        <td className="text-[10px] text-muted-foreground">
                          {a.updatedAt ? new Date(a.updatedAt).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Review queue */}
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 text-yellow-500" /> Review Queue
            </div>
            {reviewQueue.length === 0 ? (
              <EmptyState
                compact
                title="Nothing to review"
                description="Agents in review or blocked states appear here."
              />
            ) : (
              <ul className="space-y-1">
                {reviewQueue.slice(0, 8).map((a: any) => (
                  <li
                    key={a.id}
                    className="text-[10px] p-2 rounded border border-border/40 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/agent-studio/${a.id}/overview`)}
                  >
                    <div className="font-medium truncate">{a.name}</div>
                    <div className="mt-1">
                      <LifecycleBadge state={a.lifecycleState} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
}) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        {icon}
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-[10px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
