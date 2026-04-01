/**
 * AI Types Governance Page
 *
 * Shows governance state of catalog entries:
 * review states, promotion pipeline status, and compliance overview.
 */
import { trpc } from "@/lib/trpc";
import {
  Shield,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const reviewStateConfig: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  approved: {
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    color: "text-emerald-400",
    bg: "bg-emerald-500/15 border-emerald-500/30",
  },
  pending: {
    icon: <Clock className="h-3.5 w-3.5" />,
    color: "text-yellow-400",
    bg: "bg-yellow-500/15 border-yellow-500/30",
  },
  rejected: {
    icon: <XCircle className="h-3.5 w-3.5" />,
    color: "text-red-400",
    bg: "bg-red-500/15 border-red-500/30",
  },
  draft: {
    icon: <AlertCircle className="h-3.5 w-3.5" />,
    color: "text-zinc-400",
    bg: "bg-zinc-500/15 border-zinc-500/30",
  },
};

const typeColors: Record<string, string> = {
  provider: "text-blue-400",
  llm: "text-purple-400",
  model: "text-emerald-400",
  agent: "text-orange-400",
  bot: "text-pink-400",
};

export default function AITypesGovernancePage() {
  const { data: registryData, isLoading } = trpc.aiTypes.registry.bundle.useQuery();

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  const entries = (registryData?.entries || []) as Array<{
    id: number;
    name: string;
    displayName?: string;
    entryType: string;
    status: string;
    reviewState: string;
  }>;

  // Group by review state
  const byState: Record<string, typeof entries> = {};
  for (const entry of entries) {
    const state = entry.reviewState || "draft";
    if (!byState[state]) byState[state] = [];
    byState[state].push(entry);
  }

  const stateOrder = ["pending", "draft", "rejected", "approved"];
  const stateCounts = stateOrder.map((s) => ({
    state: s,
    count: byState[s]?.length || 0,
    ...(reviewStateConfig[s] || reviewStateConfig.draft),
  }));

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="h-6 w-6 text-yellow-400" />
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">AI Types Governance</h1>
          <p className="text-sm text-zinc-500">Review states and promotion pipeline across all catalog entries</p>
        </div>
      </div>

      {/* State summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {stateCounts.map(({ state, count, icon, color }) => (
          <Card key={state} className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="pt-4 pb-3 text-center">
              <div className={`flex justify-center mb-1 ${color}`}>{icon}</div>
              <div className="text-2xl font-bold text-zinc-100">{count}</div>
              <div className="text-xs text-zinc-500 capitalize">{state}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Entries needing attention (pending + rejected first) */}
      {["pending", "rejected"].map((state) => {
        const items = byState[state];
        if (!items || items.length === 0) return null;
        const cfg = reviewStateConfig[state] || reviewStateConfig.draft;
        return (
          <Card key={state} className="bg-zinc-900/50 border-zinc-800 mb-4">
            <CardHeader>
              <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
                <span className={cfg.color}>{cfg.icon}</span>
                <span className="capitalize">{state}</span>
                <Badge variant="outline" className={`text-[10px] ${cfg.bg}`}>
                  {items.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 max-h-[40vh] overflow-y-auto">
                {items.map((entry) => (
                  <div key={entry.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-zinc-800/50">
                    <span className={`text-xs ${typeColors[entry.entryType] || "text-zinc-400"}`}>
                      {entry.entryType}
                    </span>
                    <span className="text-sm text-zinc-300 truncate">{entry.displayName || entry.name}</span>
                    <Badge variant="outline" className="text-[10px] text-zinc-500 border-zinc-700 ml-auto">
                      {entry.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* All entries table */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-400">
            All Entries ({entries.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {entries.map((entry) => {
              const cfg = reviewStateConfig[entry.reviewState] || reviewStateConfig.draft;
              return (
                <div key={entry.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-zinc-800/50">
                  <span className={cfg.color}>{cfg.icon}</span>
                  <Badge variant="outline" className={`text-[10px] ${cfg.bg}`}>
                    {entry.reviewState || "draft"}
                  </Badge>
                  <span className={`text-xs ${typeColors[entry.entryType] || "text-zinc-400"}`}>
                    {entry.entryType}
                  </span>
                  <span className="text-sm text-zinc-300 truncate max-w-[200px]">
                    {entry.displayName || entry.name}
                  </span>
                  <Badge variant="outline" className="text-[10px] text-zinc-500 border-zinc-700 ml-auto">
                    {entry.status}
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
