// SecurityGraphPanel — no-deferral continuation-17 slice 84.
//
// Closes the entire securityGraph.* tRPC UI-consumer gap surfaced
// by continuation-17's broad audit. 7 endpoints consumed in one
// panel:
//   - listIngestions   — master ingestion list
//   - getIngestionStats — per-ingestion stats (lazy on selection)
//   - listIngestionNodes — per-ingestion node drill-in (lazy)
//   - listIngestionEdges — per-ingestion edge drill-in (lazy)
//   - listSources       — per-source freshness rollup (top section)
//   - listRecentRejectionsByReason — cross-ingestion rejection
//     rollup (top section)
//   - listKnownTypes    — closed-taxonomy enum for filter dropdowns
//
// Master-detail with progressive disclosure mirroring slice 72's
// GoldenQuestionsRecentRunsPanel pattern. Cascading `enabled` gates
// keep the panel cheap at first paint; detail queries fire only on
// operator interaction.

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { SectionLabel } from "./ui";
import { formatRelative } from "./format-relative";

const INGESTIONS_LIMIT = 50;
const DRILL_IN_LIMIT = 100;

export function SecurityGraphPanel() {
  const ingestionsQuery =
    trpc.agentStudio.securityGraph.listIngestions.useQuery(
      { limit: INGESTIONS_LIMIT },
      { refetchOnWindowFocus: false },
    );
  const sourcesQuery = trpc.agentStudio.securityGraph.listSources.useQuery(
    undefined,
    { refetchOnWindowFocus: false },
  );
  const rejectionsQuery =
    trpc.agentStudio.securityGraph.listRecentRejectionsByReason.useQuery(
      undefined,
      { refetchOnWindowFocus: false },
    );
  const knownTypesQuery =
    trpc.agentStudio.securityGraph.listKnownTypes.useQuery(undefined, {
      refetchOnWindowFocus: false,
    });

  const [selectedIngestionId, setSelectedIngestionId] = useState<
    string | null
  >(null);
  const [nodeTypeFilter, setNodeTypeFilter] = useState<string>("");
  const [edgeTypeFilter, setEdgeTypeFilter] = useState<string>("");

  const statsQuery =
    trpc.agentStudio.securityGraph.getIngestionStats.useQuery(
      selectedIngestionId !== null
        ? { ingestionId: selectedIngestionId }
        : (undefined as never),
      {
        enabled: selectedIngestionId !== null,
        refetchOnWindowFocus: false,
      },
    );

  const nodesQuery =
    trpc.agentStudio.securityGraph.listIngestionNodes.useQuery(
      selectedIngestionId !== null
        ? {
            ingestionId: selectedIngestionId,
            limit: DRILL_IN_LIMIT,
            ...(nodeTypeFilter !== "" ? { typeKey: nodeTypeFilter } : {}),
          }
        : (undefined as never),
      {
        enabled: selectedIngestionId !== null,
        refetchOnWindowFocus: false,
      },
    );

  const edgesQuery =
    trpc.agentStudio.securityGraph.listIngestionEdges.useQuery(
      selectedIngestionId !== null
        ? {
            ingestionId: selectedIngestionId,
            limit: DRILL_IN_LIMIT,
            ...(edgeTypeFilter !== "" ? { edgeTypeKey: edgeTypeFilter } : {}),
          }
        : (undefined as never),
      {
        enabled: selectedIngestionId !== null,
        refetchOnWindowFocus: false,
      },
    );

  const ingestions = ingestionsQuery.data?.ingestions ?? [];
  const sources = sourcesQuery.data?.sources ?? [];
  const rejections = rejectionsQuery.data?.rejections ?? [];
  const nodeTypes = useMemo(
    () => knownTypesQuery.data?.nodeTypes ?? [],
    [knownTypesQuery.data],
  );
  const edgeTypes = useMemo(
    () => knownTypesQuery.data?.edgeTypes ?? [],
    [knownTypesQuery.data],
  );

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <SectionLabel>Security graph ingestions</SectionLabel>

        {/* ── Per-source summary (top section) ─────────────── */}
        <div data-testid="sg-sources-section">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Feed freshness
          </p>
          {sourcesQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading sources…</p>
          ) : sourcesQuery.error ? (
            <p className="text-xs text-destructive">
              Failed to load sources: {sourcesQuery.error.message}
            </p>
          ) : sources.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No security-graph sources have ingested yet.
            </p>
          ) : (
            <ul className="space-y-1">
              {sources.map((s) => (
                <li
                  key={s.sourceKey}
                  data-testid="sg-source-row"
                  className="rounded border bg-background p-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-medium">
                      {s.sourceKey}
                    </span>
                    <span className="text-muted-foreground">
                      {formatRelative(s.latestStartedAt)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-muted-foreground">
                    <span>{s.totalIngestionCount} run(s)</span>
                    <span>nodes: {s.latestNodesUpserted}</span>
                    <span>edges: {s.latestEdgesUpserted}</span>
                    {s.latestEdgesRejected > 0 ? (
                      <span className="text-destructive">
                        rejected: {s.latestEdgesRejected}
                      </span>
                    ) : null}
                    <span>status: {s.latestStatus}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Recent rejections rollup ─────────────────────── */}
        <div data-testid="sg-rejections-section">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Recent rejections (rollup)
          </p>
          {rejectionsQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">
              Loading rejections…
            </p>
          ) : rejectionsQuery.error ? (
            <p className="text-xs text-destructive">
              Failed: {rejectionsQuery.error.message}
            </p>
          ) : rejections.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No edge rejections in recent ingestions.
            </p>
          ) : (
            <ul className="space-y-1">
              {rejections.map((r) => (
                <li
                  key={`${r.ingestionId}::${r.reason}`}
                  data-testid="sg-rejection-row"
                  className="rounded border bg-amber-50 p-2 text-xs dark:bg-amber-900/20"
                >
                  <span className="font-mono font-medium">{r.reason}</span>
                  <span className="ml-2 text-muted-foreground">
                    {r.count} edge(s) in {r.sourceKey} —{" "}
                    {formatRelative(r.ingestionStartedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Master ingestion list ────────────────────────── */}
        <div data-testid="sg-ingestions-section">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Recent ingestion runs
          </p>
          {ingestionsQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">
              Loading ingestions…
            </p>
          ) : ingestionsQuery.error ? (
            <p className="text-xs text-destructive">
              Failed: {ingestionsQuery.error.message}
            </p>
          ) : ingestions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No security-graph ingestions persisted yet.
            </p>
          ) : (
            <ul className="space-y-1" data-testid="sg-ingestions-list">
              {ingestions.map((i) => {
                const isSelected = i.ingestionId === selectedIngestionId;
                return (
                  <li
                    key={i.ingestionId}
                    data-testid="sg-ingestion-row"
                    className={
                      "cursor-pointer rounded border p-2 text-xs hover:bg-muted/40 " +
                      (isSelected
                        ? "bg-muted/60 ring-1 ring-primary"
                        : "")
                    }
                    onClick={() => {
                      setSelectedIngestionId(i.ingestionId);
                      setNodeTypeFilter("");
                      setEdgeTypeFilter("");
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-medium">
                        {i.ingestionId}
                      </span>
                      <span className="text-muted-foreground">
                        {formatRelative(i.startedAt)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-muted-foreground">
                      <span>{i.sourceKey}</span>
                      <span>status: {i.status}</span>
                      <span>nodes: {i.nodesUpserted}</span>
                      <span>edges: {i.edgesUpserted}</span>
                      {i.edgesRejected > 0 ? (
                        <span className="text-destructive">
                          rejected: {i.edgesRejected}
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── Per-ingestion detail (progressive disclosure) ── */}
        {selectedIngestionId !== null && (
          <div
            className="space-y-3 rounded border bg-muted/20 p-3"
            data-testid="sg-detail"
          >
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Ingestion {selectedIngestionId} detail
            </p>

            {/* Stats badges */}
            {statsQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Loading stats…</p>
            ) : statsQuery.data?.status === "not_found" ? (
              <p className="text-xs text-destructive">
                Ingestion {selectedIngestionId} not found.
              </p>
            ) : statsQuery.data?.status === "ok" && statsQuery.data.stats ? (
              <div
                data-testid="sg-stats"
                className="flex flex-wrap items-center gap-2 text-xs"
              >
                <span className="rounded bg-background px-2 py-1">
                  nodes: {statsQuery.data.stats.nodeCount}
                </span>
                <span className="rounded bg-background px-2 py-1">
                  edges: {statsQuery.data.stats.edgeCount}
                </span>
                {statsQuery.data.stats.nodeTypeCounts.length > 0 ? (
                  <span className="rounded bg-background px-2 py-1">
                    by node type:{" "}
                    {statsQuery.data.stats.nodeTypeCounts
                      .map((nt) => `${nt.typeKey}=${nt.count}`)
                      .join(", ")}
                  </span>
                ) : null}
              </div>
            ) : null}

            {/* Nodes drill-in */}
            <div data-testid="sg-nodes-drill-in">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold">Nodes</span>
                <select
                  data-testid="sg-node-type-filter"
                  className="rounded border bg-background p-1"
                  value={nodeTypeFilter}
                  onChange={(e) => setNodeTypeFilter(e.target.value)}
                  disabled={knownTypesQuery.isLoading}
                >
                  <option value="">(all node types)</option>
                  {nodeTypes.map((nt) => (
                    <option key={nt} value={nt}>
                      {nt}
                    </option>
                  ))}
                </select>
              </div>
              {nodesQuery.isLoading ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Loading nodes…
                </p>
              ) : nodesQuery.data?.status === "ingestion_not_found" ? (
                <p className="mt-1 text-xs text-destructive">
                  Ingestion not found.
                </p>
              ) : nodesQuery.data?.status === "ok" &&
                nodesQuery.data.nodes ? (
                nodesQuery.data.nodes.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    No nodes match the filter.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {nodesQuery.data.nodes.map((n) => (
                      <li
                        key={n.id}
                        data-testid="sg-node-row"
                        className="rounded border bg-background p-1.5 text-[11px]"
                      >
                        <span className="font-mono text-muted-foreground">
                          {n.typeKey}
                        </span>
                        <span className="ml-2 font-medium">{n.name}</span>
                        <span className="ml-2 text-muted-foreground">
                          {n.id}
                        </span>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </div>

            {/* Edges drill-in */}
            <div data-testid="sg-edges-drill-in">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold">Edges</span>
                <select
                  data-testid="sg-edge-type-filter"
                  className="rounded border bg-background p-1"
                  value={edgeTypeFilter}
                  onChange={(e) => setEdgeTypeFilter(e.target.value)}
                  disabled={knownTypesQuery.isLoading}
                >
                  <option value="">(all edge types)</option>
                  {edgeTypes.map((et) => (
                    <option key={et} value={et}>
                      {et}
                    </option>
                  ))}
                </select>
              </div>
              {edgesQuery.isLoading ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Loading edges…
                </p>
              ) : edgesQuery.data?.status === "ingestion_not_found" ? (
                <p className="mt-1 text-xs text-destructive">
                  Ingestion not found.
                </p>
              ) : edgesQuery.data?.status === "ok" &&
                edgesQuery.data.edges ? (
                edgesQuery.data.edges.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    No edges match the filter.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {edgesQuery.data.edges.map((e) => (
                      <li
                        key={e.id}
                        data-testid="sg-edge-row"
                        className="rounded border bg-background p-1.5 text-[11px]"
                      >
                        <span className="font-mono text-muted-foreground">
                          {e.edgeTypeKey}
                        </span>
                        <span className="ml-2 font-mono">
                          {e.sourceId} → {e.targetId}
                        </span>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
