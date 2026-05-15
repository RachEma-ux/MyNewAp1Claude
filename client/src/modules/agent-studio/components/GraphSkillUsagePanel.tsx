/**
 * Native Graph Workspace — Graph Skill Pack usage analytics panel.
 *
 * Phase 12.5 §9. Renders per-pack-version usage counts over a
 * look-back window so operators can answer "which Skill Packs is
 * Graph Agent Lite actually serving requests from?" without diffing
 * raw runtime traces.
 *
 * Data source: `agentStudio.graphSkill.listUsageCounts` (Phase 12.5
 * §8 tRPC procedure), backed by the §7 `listUsageCounts()` helper
 * over `ags_graph_skill_runtime_usages` rows produced by the §4–§6
 * recorder chain.
 *
 * The panel is intentionally read-only and self-contained — drop it
 * into any agent-studio page that wants the analytics card without
 * coupling the host page to the underlying data shape.
 */

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { BarChart3 } from "lucide-react";
import {
  EmptyState,
  ErrorCallout,
  LoadingState,
  PageHeader,
  SectionLabel,
} from "./ui";

const WINDOW_OPTIONS = [
  { label: "Last 24 hours", value: 24 * 60 * 60 * 1000 },
  { label: "Last 7 days", value: 7 * 24 * 60 * 60 * 1000 },
  { label: "Last 30 days", value: 30 * 24 * 60 * 60 * 1000 },
  { label: "Last 90 days", value: 90 * 24 * 60 * 60 * 1000 },
] as const;

const DEFAULT_WINDOW_MS = WINDOW_OPTIONS[1].value; // 7 days

function formatLatest(d: Date | null): string {
  if (!d) return "—";
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return "just now";
  if (ms < 60 * 60_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 24 * 60 * 60_000) return `${Math.floor(ms / (60 * 60_000))}h ago`;
  return `${Math.floor(ms / (24 * 60 * 60_000))}d ago`;
}

export default function GraphSkillUsagePanel() {
  const [windowMs, setWindowMs] = useState<number>(DEFAULT_WINDOW_MS);
  const [skillKeyFilter, setSkillKeyFilter] = useState<string>("");

  const trimmedKey = skillKeyFilter.trim();
  const usageQuery = trpc.agentStudio.graphSkill.listUsageCounts.useQuery(
    {
      sinceMs: windowMs,
      skillKey: trimmedKey.length > 0 ? trimmedKey : undefined,
    },
    { refetchOnWindowFocus: false },
  );

  const rows = usageQuery.data?.rows ?? [];
  const totalCalls = useMemo(
    () => rows.reduce((sum, r) => sum + r.count, 0),
    [rows],
  );
  const maxCount = useMemo(
    () => rows.reduce((m, r) => Math.max(m, r.count), 0),
    [rows],
  );
  // PR-V1-230: distinct-skill-keys gauge. The row list shows
  // pack-version granularity; a workspace serving 12 calls from
  // 3 distinct skill keys (and 9 different pack versions) has a
  // very different shape from 12 calls from 12 distinct keys.
  // Same Set-based pattern as canvas note-references distinct
  // count (#978).
  const distinctSkillKeys = useMemo(
    () => new Set(rows.map((r) => r.skillKey)).size,
    [rows],
  );

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <PageHeader
          title="Graph Skill Pack Usage"
          subtitle="Per-pack-version call counts over the selected window. Backed by ags_graph_skill_runtime_usages."
          icon={<BarChart3 className="h-4 w-4" />}
        />

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <SectionLabel>Window</SectionLabel>
            <Select
              value={String(windowMs)}
              onValueChange={(v) => setWindowMs(Number(v))}
            >
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WINDOW_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <SectionLabel>Filter by skill key</SectionLabel>
            <Input
              placeholder="(all packs)"
              value={skillKeyFilter}
              onChange={(e) => setSkillKeyFilter(e.target.value)}
              className="h-8 w-[200px] text-xs"
              maxLength={100}
            />
          </div>

          <div className="ml-auto text-right">
            <SectionLabel>Total calls</SectionLabel>
            <p className="text-lg font-semibold tabular-nums">
              {totalCalls.toLocaleString()}
            </p>
          </div>
          {rows.length > 0 ? (
            <div className="text-right">
              <SectionLabel>Distinct skill keys</SectionLabel>
              <p
                className="text-lg font-semibold tabular-nums"
                data-testid="graph-skill-usage-distinct-keys"
                title="Number of unique skill keys appearing in the rows above; a row count > distinct count means multiple pack versions of the same key served calls this window."
              >
                {distinctSkillKeys.toLocaleString()}
              </p>
            </div>
          ) : null}
        </div>

        {usageQuery.isLoading ? (
          <LoadingState label="Loading usage counts…" />
        ) : usageQuery.isError ? (
          <ErrorCallout
            title="Failed to load usage counts"
            message={usageQuery.error?.message ?? "Unknown error"}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<BarChart3 />}
            title="No usage rows in this window"
            description={
              trimmedKey
                ? `No calls served by pack "${trimmedKey}" in the selected window.`
                : "No Skill Pack templates have served retrieval requests yet."
            }
          />
        ) : (
          <div className="space-y-1.5">
            {rows.map((row) => {
              const barPct =
                maxCount > 0 ? Math.max(2, (row.count / maxCount) * 100) : 0;
              const latestUsedAt = row.latestUsedAt
                ? new Date(row.latestUsedAt)
                : null;
              return (
                <div
                  key={`${row.skillKey}-${row.packVersionId}`}
                  className="border border-border/40 rounded px-3 py-2 hover:bg-muted/20"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium truncate">
                          {row.skillKey}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1 py-0 h-4"
                        >
                          v{row.version}
                        </Badge>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                        <div
                          className="h-full bg-primary/60"
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold tabular-nums">
                        {row.count.toLocaleString()}
                      </p>
                      <p className="text-[9px] text-muted-foreground">
                        {formatLatest(latestUsedAt)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
