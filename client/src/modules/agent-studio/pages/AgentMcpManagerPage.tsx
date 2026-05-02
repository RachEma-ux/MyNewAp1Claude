/**
 * AI Agent Studio — Global MCP Manager Page (Phase 19 follow-up)
 *
 * Cross-draft visibility for the MCP manager subsystem rebuilt in Phase
 * 19a (dispatcher) → 19b (FSM) → 19c (versioned registry). The
 * per-agent MCP page (`AgentMcpPage.tsx`) only shows the servers
 * attached to ONE draft; this page shows EVERY MCP server across EVERY
 * draft, with its rich FSM state and live connection metadata.
 *
 * Useful for ops:
 *   • spot servers stuck in `failed` state with backoff timing
 *   • see which servers are awaiting OAuth (`needs_auth`)
 *   • see which drafts share the same external server (future Scenario A)
 *   • quick-connect / quick-disconnect from one place
 *   • count totals (rows / connected / per-state breakdown)
 *
 * Data: `trpc.agentStudio.mcp.getManagerSnapshot()` joins
 * `agsDraftMcpServers` rows with the in-memory FSM state map and the
 * live connection map into a single response. No client-side joining.
 *
 * Refresh: 5-second polling. Connect / disconnect mutations invalidate
 * the snapshot query immediately so state changes appear in <1s.
 */
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2,
  Network,
  Power,
  PowerOff,
  AlertCircle,
  CheckCircle2,
  Clock,
  KeyRound,
  Ban,
  RefreshCw,
} from "lucide-react";
import {
  PageHeader,
  EmptyState,
  LoadingState,
  SectionLabel,
} from "../components/ui";

// ── State rendering ────────────────────────────────────────────────────────

const STATE_BADGES: Record<
  string,
  { color: string; icon: React.ElementType; label: string }
> = {
  pending: {
    color: "border-zinc-500/40 text-zinc-400",
    icon: Clock,
    label: "pending",
  },
  connecting: {
    color: "border-blue-500/40 text-blue-400",
    icon: Loader2,
    label: "connecting",
  },
  connected: {
    color: "border-emerald-500/40 text-emerald-400",
    icon: CheckCircle2,
    label: "connected",
  },
  needs_auth: {
    color: "border-amber-500/40 text-amber-400",
    icon: KeyRound,
    label: "needs auth",
  },
  failed: {
    color: "border-red-500/40 text-red-400",
    icon: AlertCircle,
    label: "failed",
  },
  disabled: {
    color: "border-zinc-700/40 text-zinc-600",
    icon: Ban,
    label: "disabled",
  },
};

function formatRelativeMs(ts: number | undefined): string {
  if (!ts) return "—";
  const delta = Date.now() - ts;
  if (delta < 0) {
    const future = Math.abs(delta);
    if (future < 60_000) return `in ${Math.round(future / 1000)}s`;
    return `in ${Math.round(future / 60_000)}m`;
  }
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  return `${Math.round(delta / 3_600_000)}h ago`;
}

function describeState(state: any): string {
  switch (state.kind) {
    case "pending":
      return "Never connected";
    case "connecting":
      return `Connecting since ${formatRelativeMs(state.startedAt)}`;
    case "connected":
      return `Connected ${formatRelativeMs(state.connectedAt)} · ${state.toolCount} tools, ${state.promptCount} prompts, ${state.resourceCount} resources`;
    case "needs_auth":
      return `OAuth required: ${state.reason}`;
    case "failed":
      return `Attempt ${state.attemptCount} failed: ${state.reason}${
        state.nextRetryAt
          ? ` · next retry ${formatRelativeMs(state.nextRetryAt)}`
          : ""
      }`;
    case "disabled":
      return `Disabled ${formatRelativeMs(state.disabledAt)}`;
    default:
      return "Unknown state";
  }
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AgentMcpManagerPage() {
  const utils = trpc.useUtils();
  const snapshotQuery = trpc.agentStudio.mcp.getManagerSnapshot.useQuery(
    undefined,
    { refetchInterval: 5_000 }
  );

  const connectMut = trpc.agentStudio.mcp.connect.useMutation({
    onSuccess: (r) => {
      if (r.status === "connected") {
        toast.success(`Server ${r.serverId} connected (${r.toolCount} tools)`);
      } else {
        toast.error(`Connect failed: ${r.error ?? "unknown"}`);
      }
      utils.agentStudio.mcp.getManagerSnapshot.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const disconnectMut = trpc.agentStudio.mcp.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Server disconnected");
      utils.agentStudio.mcp.getManagerSnapshot.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (snapshotQuery.isLoading) {
    return <LoadingState label="Loading MCP manager snapshot…" />;
  }

  const data = snapshotQuery.data;
  if (!data) {
    return <LoadingState label="No snapshot data" />;
  }

  // Group by FSM state for the summary tiles
  const stateCounts: Record<string, number> = {
    pending: 0,
    connecting: 0,
    connected: 0,
    needs_auth: 0,
    failed: 0,
    disabled: 0,
  };
  for (const s of data.servers) {
    const k = s.state.kind;
    stateCounts[k] = (stateCounts[k] ?? 0) + 1;
  }

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="MCP Manager"
        subtitle="Cross-draft visibility for the dispatcher / FSM / registry chokepoint architecture (Phase 19a + 19b + 19c). Shows every MCP server across every draft."
        icon={<Network className="h-4 w-4" />}
        badges={
          <>
            <Badge variant="outline" className="text-[9px] uppercase tracking-wider ml-2">
              {data.totalServers} servers
            </Badge>
            <Badge
              variant="outline"
              className="text-[9px] uppercase tracking-wider ml-1 border-emerald-500/40 text-emerald-400"
            >
              {data.totalConnected} connected
            </Badge>
          </>
        }
      />

      {/* Summary tiles — count by FSM state */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {Object.entries(STATE_BADGES).map(([kind, def]) => {
          const Icon = def.icon;
          return (
            <Card key={kind} className={`border ${def.color}`}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Icon
                    className={`h-3.5 w-3.5 ${
                      kind === "connecting" ? "animate-spin" : ""
                    }`}
                  />
                  <span className="text-[10px] uppercase tracking-wider opacity-80">
                    {def.label}
                  </span>
                </div>
                <div className="text-2xl font-mono font-bold mt-1">
                  {stateCounts[kind] ?? 0}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Phase 19 architecture banner */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="p-3 text-[10px] text-muted-foreground space-y-1">
          <div className="font-semibold text-blue-300">
            Architecture (Phase 19a + 19b + 19c)
          </div>
          <ul className="list-disc list-inside space-y-0.5">
            <li>
              <strong>Dispatcher:</strong> every MCP tool call across the
              codebase flows through one chokepoint that owns governance
              pre/post-invoke + sync audit row writes to{" "}
              <code className="font-mono">agsRuntimePolicyEvents</code>.
            </li>
            <li>
              <strong>FSM:</strong> connection state is a discriminated
              union. Every status flip goes through a single transition
              function with backoff math built-in.
            </li>
            <li>
              <strong>Registry:</strong> tool/prompt/resource discovery
              comes from frozen versioned snapshots — no torn reads.
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Server list */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel icon={<Network className="h-3 w-3" />}>
            All attached servers
          </SectionLabel>
          {data.servers.length === 0 ? (
            <EmptyState
              icon={<Network className="h-7 w-7" />}
              title="No MCP servers attached anywhere"
              description="Open any agent's MCP page to attach a server, then return here to see it in the manager."
            />
          ) : (
            <ul className="space-y-2">
              {data.servers.map((s) => {
                const def =
                  STATE_BADGES[s.state.kind] ?? STATE_BADGES.pending;
                const Icon = def.icon;
                const isConnected = s.state.kind === "connected";
                const canConnect =
                  s.state.kind === "pending" ||
                  s.state.kind === "failed" ||
                  s.state.kind === "needs_auth";
                return (
                  <li
                    key={s.id}
                    className="border rounded p-3 text-xs space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0 flex-1 min-w-[200px]">
                        <div className="font-medium flex items-center gap-2 flex-wrap">
                          <span>{s.name}</span>
                          <Badge
                            variant="outline"
                            className="text-[9px] uppercase tracking-wider"
                          >
                            {s.transport}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-[9px] uppercase tracking-wider ${def.color}`}
                          >
                            <Icon
                              className={`h-2.5 w-2.5 mr-1 ${
                                s.state.kind === "connecting"
                                  ? "animate-spin"
                                  : ""
                              }`}
                            />
                            {def.label}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="text-[9px] border-zinc-500/40 text-zinc-400"
                          >
                            draft #{s.draftId}
                          </Badge>
                          {!s.enabled && (
                            <Badge
                              variant="outline"
                              className="text-[9px] border-zinc-500/40 text-zinc-400"
                            >
                              row disabled
                            </Badge>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {describeState(s.state)}
                        </div>
                        {s.command && (
                          <div className="text-[10px] text-muted-foreground font-mono mt-1">
                            <span className="opacity-60">$</span> {s.command}
                          </div>
                        )}
                        {s.url && (
                          <div className="text-[10px] text-muted-foreground font-mono mt-1">
                            {s.url}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {canConnect && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-emerald-400"
                            title="Connect"
                            onClick={() =>
                              connectMut.mutate({ serverId: s.id })
                            }
                            disabled={connectMut.isPending}
                          >
                            {connectMut.isPending &&
                            connectMut.variables?.serverId === s.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Power className="h-3 w-3" />
                            )}
                          </Button>
                        )}
                        {isConnected && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-amber-400"
                            title="Disconnect"
                            onClick={() => disconnectMut.mutate({ serverId: s.id })}
                            disabled={disconnectMut.isPending}
                          >
                            {disconnectMut.isPending &&
                            disconnectMut.variables?.serverId === s.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <PowerOff className="h-3 w-3" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <RefreshCw className="h-3 w-3" />
        Snapshot refreshes every 5 seconds · generated{" "}
        {formatRelativeMs(data.generatedAt)}
      </div>
    </div>
  );
}
