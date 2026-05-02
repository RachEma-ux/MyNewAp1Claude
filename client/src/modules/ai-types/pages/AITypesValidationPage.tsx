import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ShieldCheck, AlertTriangle, AlertCircle, Info, Loader2, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Severity = "error" | "warning" | "info";

const severityConfig: Record<Severity, { icon: React.ReactNode; color: string; bg: string }> = {
  error: {
    icon: <AlertCircle className="h-3.5 w-3.5" />,
    color: "text-red-400",
    bg: "bg-red-500/15 border-red-500/30",
  },
  warning: {
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    color: "text-yellow-400",
    bg: "bg-yellow-500/15 border-yellow-500/30",
  },
  info: {
    icon: <Info className="h-3.5 w-3.5" />,
    color: "text-blue-400",
    bg: "bg-blue-500/15 border-blue-500/30",
  },
};

const typeColors: Record<string, string> = {
  provider: "text-blue-400",
  llm: "text-purple-400",
  model: "text-emerald-400",
  agent: "text-orange-400",
  bot: "text-pink-400",
};

type EntryType = "provider" | "llm" | "model" | "agent" | "bot";

export default function AITypesValidationPage() {
  const [filterType, setFilterType] = useState<EntryType | undefined>(undefined);
  const [filterSeverity, setFilterSeverity] = useState<Severity | "all">("all");

  const { data: result, isLoading } = trpc.aiTypes.validation.scan.useQuery(
    filterType ? { entryType: filterType } : undefined,
  );
  const { data: summary } = trpc.aiTypes.validation.summary.useQuery();

  const filteredIssues = result?.issues.filter(
    (i) => filterSeverity === "all" || i.severity === filterSeverity,
  ) || [];

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck className="h-6 w-6 text-emerald-400" />
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">AI Types Validation</h1>
          <p className="text-sm text-zinc-500">Completeness and consistency checks across all entries</p>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-emerald-400">{summary.healthy}</div>
              <div className="text-xs text-zinc-500">Healthy</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-yellow-400">{summary.warnings}</div>
              <div className="text-xs text-zinc-500">Warnings</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-red-400">{summary.errors}</div>
              <div className="text-xs text-zinc-500">Errors</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-zinc-200">{summary.healthPercent}%</div>
              <div className="text-xs text-zinc-500">Health Score</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Filter className="h-3.5 w-3.5" /> Type:
        </div>
        <button
          onClick={() => setFilterType(undefined)}
          className={`px-2.5 py-1 rounded text-xs transition-colors ${
            !filterType ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          All
        </button>
        {(["provider", "llm", "model", "agent", "bot"] as EntryType[]).map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-2.5 py-1 rounded text-xs transition-colors ${
              filterType === t ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t}
          </button>
        ))}

        <span className="mx-2 text-zinc-700">|</span>

        <div className="flex items-center gap-1.5 text-xs text-zinc-500">Severity:</div>
        {(["all", "error", "warning", "info"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterSeverity(s)}
            className={`px-2.5 py-1 rounded text-xs transition-colors ${
              filterSeverity === s ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Issues list */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-400">
            Issues ({filteredIssues.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredIssues.length === 0 ? (
            <p className="text-sm text-zinc-500 py-4 text-center">
              {result?.totalIssues === 0 ? "All entries are valid." : "No issues match the current filter."}
            </p>
          ) : (
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {filteredIssues.map((issue, i) => {
                const sev = severityConfig[issue.severity as Severity];
                return (
                  <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-zinc-800/50">
                    <span className={sev.color}>{sev.icon}</span>
                    <Badge variant="outline" className={`text-[10px] ${sev.bg}`}>
                      {issue.severity}
                    </Badge>
                    <span className={`text-xs ${typeColors[issue.entryType] || "text-zinc-400"}`}>
                      {issue.entryType}
                    </span>
                    <span className="text-sm text-zinc-300 truncate max-w-[200px]">{issue.entryName}</span>
                    <span className="text-xs text-zinc-500 truncate">{issue.message}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
