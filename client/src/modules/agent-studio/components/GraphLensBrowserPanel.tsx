/**
 * Graph Lens browser panel — T-F.62.
 *
 * First operator UI for the lens stack (#992 / #998 / #1253 / #1254
 * / #1255). Renders:
 *   - A coverage line ("X / Y kinds have runners — Z%").
 *   - A list of registered lenses with a "placeholder" / "live"
 *     badge per row.
 *   - A render preview Card on the selected lens: the discriminated
 *     envelope from `graphLens.render` decides between three states
 *     (ok / no_runner / not_found).
 *   - When `status === "ok"` the panel renders a *minimal* table
 *     view of the snapshot (visible nodes count + by-typeKey
 *     rollup + first 15 nodes + first 15 edges). A real graph
 *     visualization is its own follow-up slice — this PR
 *     demonstrates end-to-end reachability with table primitives.
 *
 * Workspace selection
 *   The graph-lens admin surface spans workspaces (the runner's
 *   `getAsDbForWorkspace` honors region routing). Operators pick a
 *   workspaceId via a numeric input; default is workspace 1 to
 *   match the local-dev seed.
 */

import { useState, useMemo } from "react";

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { SectionLabel } from "./ui";

function fmtPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

/**
 * T-F.76 cross-lens linking — map shared typeKeys to the canonical
 * lens kind that surfaces them as a first-class node. When a node
 * row in the current preview matches this map AND the current lens
 * is NOT the canonical kind, the operator can jump to the canonical
 * lens with the node id pre-loaded into the search filter so the
 * same entity is reachable across lens boundaries.
 *
 * The map is intentionally small and explicit — only the typeKeys
 * that appear in multiple lens runners (per lesson 43 / cross-lens
 * shape alignment) are listed:
 *   - `cag_pack` appears in cag (T-F.65) AND rac (T-F.67).
 *   - `runtime_run` appears in runtime (T-F.59) AND mcp (T-F.64).
 *
 * Adding new shared typeKeys is a one-line edit + a follow-up unit
 * test extension. The source-scan test asserts the 2 known entries
 * so future regressions trip loudly.
 */
const CROSS_LENS_TYPEKEY_TARGETS: Readonly<Record<string, string>> = {
  cag_pack: "cag",
  runtime_run: "runtime",
};

/**
 * T-F.77 cap — the SVG graph viz uses circular positioning, so it
 * gets visually unusable as N grows. 50 is the practical ceiling
 * for hover/select interactions; beyond that the table preview
 * stays the better operator surface. The toggle button is
 * disabled when filteredNodes exceeds this cap and explains why.
 */
const GRAPH_VIZ_NODE_CAP = 50;

export function GraphLensBrowserPanel() {
  const [workspaceId, setWorkspaceId] = useState<number>(1);
  const [selectedLensId, setSelectedLensId] = useState<string | null>(null);
  // T-F.72: typeKey drill-in filter. Pure client-side narrowing over
  // the already-fetched snapshot — no server round-trip needed.
  // Resets to null whenever the operator picks a different lens
  // (snapshot shape differs across lens kinds, so a stale filter
  // would silently filter to zero rows).
  const [typeKeyFilter, setTypeKeyFilter] = useState<string | null>(null);
  // T-F.73: visibility drill-in. `"all"` shows every node (default);
  // `"visible_only"` hides permission-redacted nodes; `"hidden_only"`
  // surfaces only the redacted set (useful for spotting permission
  // gaps in an audit). Composes with typeKeyFilter — both narrowers
  // apply against the same filteredNodes list.
  const [visibilityFilter, setVisibilityFilter] = useState<
    "all" | "visible_only" | "hidden_only"
  >("all");
  // T-F.74: substring search across `node.id` + `node.label`. Pure
  // client-side, case-insensitive, no debounce (the snapshot is
  // already in memory). Composes with the other two narrowers.
  const [searchQuery, setSearchQuery] = useState<string>("");
  // T-F.77: viewMode toggle — switch between the table view (default,
  // works for any node count) and a circular SVG graph viz (capped
  // at GRAPH_VIZ_NODE_CAP filtered nodes). Toggling resets when the
  // operator picks a new lens — snapshot shape differs, viz fitness
  // may change.
  const [viewMode, setViewMode] = useState<"table" | "graph">("table");
  function selectLens(lensId: string) {
    setSelectedLensId(lensId);
    clearAllFilters();
    setViewMode("table");
  }
  // T-F.75: one-click reset for all three drill-in axes. Mirrors
  // T-I.68's "Clear all filters" button on the events card —
  // the natural saturation-completion close of a multi-axis
  // drill-in arc per precedent (k). Used both by the top-level
  // affordance (gated on hasAnyFilter) and by the empty-state row
  // when filters narrow to zero results.
  function clearAllFilters() {
    setTypeKeyFilter(null);
    setVisibilityFilter("all");
    setSearchQuery("");
  }

  const listQ = trpc.agentStudio.graphLens.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const summaryQ = trpc.agentStudio.graphLens.summary.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const renderInput = useMemo(
    () =>
      selectedLensId
        ? { workspaceId, lensId: selectedLensId }
        : undefined,
    [selectedLensId, workspaceId],
  );
  const renderQ = trpc.agentStudio.graphLens.render.useQuery(
    renderInput as { workspaceId: number; lensId: string },
    {
      enabled: renderInput !== undefined,
      refetchOnWindowFocus: false,
    },
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Runner coverage</SectionLabel>
          {summaryQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : summaryQ.error ? (
            <p className="text-sm text-destructive">
              Failed to load: {summaryQ.error.message}
            </p>
          ) : summaryQ.data ? (
            <div
              className="text-sm"
              data-testid="graph-lens-runner-coverage"
            >
              <span className="font-medium">
                {summaryQ.data.coverage.registeredKinds} /{" "}
                {summaryQ.data.coverage.totalKinds}
              </span>{" "}
              kinds have runners —{" "}
              <span
                className={`font-mono ${
                  summaryQ.data.coverage.coveragePercent >= 100
                    ? "text-emerald-600 dark:text-emerald-400"
                    : summaryQ.data.coverage.coveragePercent >= 50
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground"
                }`}
              >
                {fmtPercent(summaryQ.data.coverage.coveragePercent)}
              </span>
              {summaryQ.data.coverage.missingKinds.length > 0 ? (
                <p className="text-xs text-muted-foreground mt-1">
                  Missing:{" "}
                  <span className="font-mono">
                    {summaryQ.data.coverage.missingKinds.join(", ")}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Registered lenses</SectionLabel>
          {listQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : listQ.error ? (
            <p className="text-sm text-destructive">
              Failed to load: {listQ.error.message}
            </p>
          ) : listQ.data && listQ.data.length > 0 ? (
            <table
              className="w-full text-sm"
              data-testid="graph-lens-list-table"
            >
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1">Lens</th>
                  <th className="py-1">Kind</th>
                  <th className="py-1">Layout</th>
                  <th className="py-1">Runner</th>
                  <th className="py-1"></th>
                </tr>
              </thead>
              <tbody>
                {listQ.data.map((entry) => (
                  <tr
                    key={entry.definition.id}
                    className={`border-t border-border ${
                      selectedLensId === entry.definition.id
                        ? "bg-muted/50"
                        : ""
                    }`}
                    data-testid={`graph-lens-row-${entry.definition.id}`}
                  >
                    <td className="py-1">{entry.definition.label}</td>
                    <td className="py-1 font-mono text-xs">
                      {entry.definition.kind}
                    </td>
                    <td className="py-1 font-mono text-xs">
                      {entry.definition.layout}
                    </td>
                    <td className="py-1">
                      {entry.hasRunner ? (
                        <span className="text-emerald-600 dark:text-emerald-400 text-xs">
                          live
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          placeholder
                        </span>
                      )}
                    </td>
                    <td className="py-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          selectedLensId === entry.definition.id
                            ? "default"
                            : "outline"
                        }
                        onClick={() => selectLens(entry.definition.id)}
                        data-testid={`graph-lens-render-${entry.definition.id}`}
                      >
                        Render
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No lenses registered.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Render preview</SectionLabel>
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="graph-lens-workspace-id" className="font-medium">
              Workspace:
            </label>
            <input
              id="graph-lens-workspace-id"
              type="number"
              min={1}
              value={workspaceId}
              onChange={(e) => setWorkspaceId(Number(e.target.value) || 1)}
              className="w-24 rounded border border-border bg-background px-2 py-1 text-sm"
              data-testid="graph-lens-workspace-input"
            />
          </div>
          {!selectedLensId ? (
            <p className="text-sm text-muted-foreground">
              Pick a lens above to render.
            </p>
          ) : renderQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Rendering…</p>
          ) : renderQ.error ? (
            <p className="text-sm text-destructive">
              Failed to render: {renderQ.error.message}
            </p>
          ) : renderQ.data ? (
            <RenderEnvelopeView
              data={renderQ.data}
              typeKeyFilter={typeKeyFilter}
              onTypeKeyFilterChange={setTypeKeyFilter}
              visibilityFilter={visibilityFilter}
              onVisibilityFilterChange={setVisibilityFilter}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              onClearAllFilters={clearAllFilters}
              onJumpToLens={(targetLensId, prefilledSearch) => {
                setSelectedLensId(targetLensId);
                setTypeKeyFilter(null);
                setVisibilityFilter("all");
                setSearchQuery(prefilledSearch);
                setViewMode("table");
              }}
              lensList={listQ.data ?? null}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

interface RenderEnvelopeViewProps {
  readonly data:
    | {
        status: "ok";
        snapshot: {
          lensId: string;
          kind: string;
          layout: string;
          producedAt: Date | string;
          nodes: ReadonlyArray<{
            typeKey: string;
            id: string;
            visible: boolean;
            label?: string;
          }>;
          edges: ReadonlyArray<{
            typeKey: string;
            sourceNodeId: string;
            targetNodeId: string;
            visible: boolean;
          }>;
          hiddenNodeCount: number;
          truncated: boolean;
        };
      }
    | { status: "no_runner_for_kind"; kind: string }
    | { status: "not_found"; lensId: string };
  readonly typeKeyFilter: string | null;
  readonly onTypeKeyFilterChange: (next: string | null) => void;
  readonly visibilityFilter: "all" | "visible_only" | "hidden_only";
  readonly onVisibilityFilterChange: (
    next: "all" | "visible_only" | "hidden_only",
  ) => void;
  readonly searchQuery: string;
  readonly onSearchQueryChange: (next: string) => void;
  readonly onClearAllFilters: () => void;
  readonly onJumpToLens: (targetLensId: string, prefilledSearch: string) => void;
  readonly lensList:
    | ReadonlyArray<{
        definition: { id: string; kind: string };
        hasRunner: boolean;
      }>
    | null;
  readonly viewMode: "table" | "graph";
  readonly onViewModeChange: (next: "table" | "graph") => void;
}

function RenderEnvelopeView({
  data,
  typeKeyFilter,
  onTypeKeyFilterChange,
  visibilityFilter,
  onVisibilityFilterChange,
  searchQuery,
  onSearchQueryChange,
  onClearAllFilters,
  onJumpToLens,
  lensList,
  viewMode,
  onViewModeChange,
}: RenderEnvelopeViewProps) {
  if (data.status === "not_found") {
    return (
      <p
        className="text-sm text-destructive"
        data-testid="graph-lens-render-not-found"
      >
        Lens not found: <span className="font-mono">{data.lensId}</span>
      </p>
    );
  }
  if (data.status === "no_runner_for_kind") {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="graph-lens-render-no-runner"
      >
        No runner is registered for kind{" "}
        <span className="font-mono">{data.kind}</span> yet — this lens is a
        placeholder.
      </p>
    );
  }
  const { snapshot } = data;
  const visibleNodes = snapshot.nodes.filter((n) => n.visible);
  const nodesByTypeKey = new Map<string, number>();
  for (const n of snapshot.nodes) {
    nodesByTypeKey.set(n.typeKey, (nodesByTypeKey.get(n.typeKey) ?? 0) + 1);
  }
  // T-F.72 + T-F.73 + T-F.74: apply ALL three drill-in filters
  // (typeKey + visibility + search) to the nodes preview. Edges
  // remain unfiltered — every axis narrows NODES only. The search
  // is a case-insensitive substring match across `id` + `label`;
  // hidden nodes (label undefined) match by id alone.
  const trimmedQuery = searchQuery.trim().toLowerCase();
  const filteredNodes = snapshot.nodes.filter((n) => {
    if (typeKeyFilter != null && n.typeKey !== typeKeyFilter) return false;
    if (visibilityFilter === "visible_only" && !n.visible) return false;
    if (visibilityFilter === "hidden_only" && n.visible) return false;
    if (trimmedQuery !== "") {
      const idMatch = n.id.toLowerCase().includes(trimmedQuery);
      const labelMatch = (n.label ?? "").toLowerCase().includes(trimmedQuery);
      if (!idMatch && !labelMatch) return false;
    }
    return true;
  });
  const hasAnyFilter =
    typeKeyFilter != null ||
    visibilityFilter !== "all" ||
    trimmedQuery !== "";
  return (
    <div className="space-y-3" data-testid="graph-lens-render-ok">
      <div className="text-xs text-muted-foreground space-y-0.5">
        <p>
          <span className="font-medium">lensId:</span>{" "}
          <span className="font-mono">{snapshot.lensId}</span>
        </p>
        <p>
          <span className="font-medium">kind:</span>{" "}
          <span className="font-mono">{snapshot.kind}</span>
        </p>
        <p>
          <span className="font-medium">layout:</span>{" "}
          <span className="font-mono">{snapshot.layout}</span>
        </p>
        <p>
          <span className="font-medium">nodes:</span> {snapshot.nodes.length} (
          {visibleNodes.length} visible / {snapshot.hiddenNodeCount} hidden)
        </p>
        <p>
          <span className="font-medium">edges:</span> {snapshot.edges.length}
        </p>
        {snapshot.truncated ? (
          <p className="text-amber-600 dark:text-amber-400">
            <span className="font-medium">truncated:</span> result hit the cap;
            more rows exist.
          </p>
        ) : null}
      </div>
      {snapshot.nodes.length === 0 ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid="graph-lens-render-empty"
        >
          Empty snapshot — no nodes match the current viewer/workspace.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div
              className="flex items-center gap-2"
              data-testid="graph-lens-visibility-filter-group"
            >
              <span className="text-muted-foreground">Show:</span>
              {(["all", "visible_only", "hidden_only"] as const).map((mode) => {
                const isActive = visibilityFilter === mode;
                const label =
                  mode === "all"
                    ? "All"
                    : mode === "visible_only"
                    ? "Visible only"
                    : "Hidden only";
                return (
                  <button
                    key={mode}
                    type="button"
                    className={`rounded border px-2 py-0.5 ${
                      isActive
                        ? "bg-muted/50 border-border"
                        : "border-transparent hover:underline"
                    }`}
                    data-testid={`graph-lens-visibility-filter-${mode}`}
                    onClick={() => onVisibilityFilterChange(mode)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div
              className="flex items-center gap-2"
              data-testid="graph-lens-search-filter-group"
            >
              <label
                htmlFor="graph-lens-search-input"
                className="text-muted-foreground"
              >
                Search:
              </label>
              <input
                id="graph-lens-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                placeholder="id or label substring…"
                className="w-56 rounded border border-border bg-background px-2 py-0.5 text-xs"
                data-testid="graph-lens-search-input"
              />
              {searchQuery !== "" ? (
                <button
                  type="button"
                  className="underline text-muted-foreground"
                  data-testid="graph-lens-search-clear"
                  onClick={() => onSearchQueryChange("")}
                >
                  Clear
                </button>
              ) : null}
            </div>
            {hasAnyFilter ? (
              <button
                type="button"
                className="ml-auto rounded border border-border px-2 py-0.5 underline text-muted-foreground"
                data-testid="graph-lens-clear-all-filters"
                onClick={onClearAllFilters}
              >
                Clear all filters
              </button>
            ) : null}
            <div
              className={`${hasAnyFilter ? "" : "ml-auto "}flex items-center gap-2`}
              data-testid="graph-lens-view-mode-group"
            >
              <span className="text-muted-foreground">View:</span>
              {(["table", "graph"] as const).map((mode) => {
                const isActive = viewMode === mode;
                const overCap =
                  mode === "graph" && filteredNodes.length > GRAPH_VIZ_NODE_CAP;
                const disabled = overCap;
                return (
                  <button
                    key={mode}
                    type="button"
                    className={`rounded border px-2 py-0.5 ${
                      isActive
                        ? "bg-muted/50 border-border"
                        : "border-transparent hover:underline"
                    } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                    data-testid={`graph-lens-view-mode-${mode}`}
                    disabled={disabled}
                    title={
                      overCap
                        ? `Graph viz disabled when filtered node count > ${GRAPH_VIZ_NODE_CAP}`
                        : undefined
                    }
                    onClick={() => onViewModeChange(mode)}
                  >
                    {mode === "table" ? "Table" : "Graph"}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <SectionLabel>By typeKey</SectionLabel>
            <table
              className="w-full text-xs"
              data-testid="graph-lens-render-by-typekey"
            >
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1">typeKey</th>
                  <th className="py-1">count</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(nodesByTypeKey.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(([typeKey, count]) => {
                    const isActive = typeKeyFilter === typeKey;
                    return (
                      <tr
                        key={typeKey}
                        className={`border-t border-border ${
                          isActive ? "bg-muted/50" : ""
                        }`}
                      >
                        <td className="py-1 font-mono">
                          <button
                            type="button"
                            className="text-left hover:underline"
                            data-testid={`graph-lens-typekey-filter-${typeKey}`}
                            onClick={() =>
                              onTypeKeyFilterChange(isActive ? null : typeKey)
                            }
                          >
                            {typeKey}
                          </button>
                        </td>
                        <td className="py-1 font-mono">{count}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {typeKeyFilter != null ? (
              <div
                className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"
                data-testid="graph-lens-typekey-filter-chip"
              >
                <span>
                  Filtered to{" "}
                  <span className="font-mono">{typeKeyFilter}</span>
                </span>
                <button
                  type="button"
                  className="underline"
                  data-testid="graph-lens-typekey-filter-clear"
                  onClick={() => onTypeKeyFilterChange(null)}
                >
                  Clear
                </button>
              </div>
            ) : null}
          </div>
          {viewMode === "graph" ? (
            snapshot.layout === "timeline" ? (
              <TimelineGraphViz
                nodes={filteredNodes}
                edges={snapshot.edges}
              />
            ) : snapshot.layout === "matrix" ? (
              <MatrixGraphViz
                nodes={filteredNodes}
                edges={snapshot.edges}
              />
            ) : snapshot.layout === "tree" ? (
              <TreeGraphViz
                nodes={filteredNodes}
                edges={snapshot.edges}
              />
            ) : (
              <SnapshotGraphViz
                nodes={filteredNodes}
                edges={snapshot.edges}
              />
            )
          ) : (
            <>
          <div>
            <SectionLabel>
              Nodes{" "}
              {hasAnyFilter
                ? `(first 15 of ${filteredNodes.length} matching filters)`
                : `(first 15 of ${snapshot.nodes.length})`}
            </SectionLabel>
            <table
              className="w-full text-xs"
              data-testid="graph-lens-render-nodes-preview"
            >
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1">id</th>
                  <th className="py-1">typeKey</th>
                  <th className="py-1">visible</th>
                  <th className="py-1">label</th>
                  <th className="py-1"></th>
                </tr>
              </thead>
              <tbody>
                {filteredNodes.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-2 text-center text-muted-foreground italic"
                      data-testid="graph-lens-render-nodes-empty-after-filter"
                    >
                      No nodes match the active filters.{" "}
                      <button
                        type="button"
                        className="underline not-italic"
                        data-testid="graph-lens-empty-state-clear-all"
                        onClick={onClearAllFilters}
                      >
                        Clear all filters
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredNodes.slice(0, 15).map((n) => {
                    const targetKind = CROSS_LENS_TYPEKEY_TARGETS[n.typeKey];
                    const isCurrentLens = targetKind === snapshot.kind;
                    const targetLens =
                      targetKind && !isCurrentLens && lensList != null
                        ? lensList.find(
                            (entry) =>
                              entry.definition.kind === targetKind &&
                              entry.hasRunner,
                          )
                        : undefined;
                    return (
                      <tr key={n.id} className="border-t border-border">
                        <td className="py-1 font-mono">{n.id}</td>
                        <td className="py-1 font-mono">{n.typeKey}</td>
                        <td className="py-1 font-mono">
                          {n.visible ? "true" : "false"}
                        </td>
                        <td className="py-1">{n.label ?? "—"}</td>
                        <td className="py-1">
                          {targetLens ? (
                            <button
                              type="button"
                              className="underline text-muted-foreground"
                              data-testid={`graph-lens-jump-to-${targetKind}-${n.id}`}
                              onClick={() =>
                                onJumpToLens(targetLens.definition.id, n.id)
                              }
                            >
                              Open in {targetKind}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {snapshot.edges.length > 0 ? (
            <div>
              <SectionLabel>Edges (first 15)</SectionLabel>
              <table
                className="w-full text-xs"
                data-testid="graph-lens-render-edges-preview"
              >
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1">typeKey</th>
                    <th className="py-1">source</th>
                    <th className="py-1">target</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.edges.slice(0, 15).map((e, i) => (
                    <tr
                      key={`${e.sourceNodeId}-${e.targetNodeId}-${i}`}
                      className="border-t border-border"
                    >
                      <td className="py-1 font-mono">{e.typeKey}</td>
                      <td className="py-1 font-mono">{e.sourceNodeId}</td>
                      <td className="py-1 font-mono">{e.targetNodeId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * T-F.77 SnapshotGraphViz — circular-positioning SVG graph viz.
 *
 * Capped at GRAPH_VIZ_NODE_CAP filtered nodes (the parent's toggle
 * disables "Graph" mode when the cap is exceeded). Layout is
 * deterministic and layout-agnostic — every node gets an angle
 * `2π × index / N` and a radius based on the SVG viewport. Edges
 * are straight lines between their source/target node positions.
 * Hidden nodes get a muted color + dashed stroke; visible nodes get
 * the foreground color.
 *
 * Why circular: no force-simulation dependency, no animation, fully
 * deterministic for a given input order. Layout-specific renderers
 * (timeline, matrix, dependency-path) can land as follow-up slices
 * that branch on `snapshot.layout`.
 */
function SnapshotGraphViz({
  nodes,
  edges,
}: {
  readonly nodes: ReadonlyArray<{
    typeKey: string;
    id: string;
    visible: boolean;
    label?: string;
  }>;
  readonly edges: ReadonlyArray<{
    typeKey: string;
    sourceNodeId: string;
    targetNodeId: string;
    visible: boolean;
  }>;
}) {
  if (nodes.length === 0) {
    return (
      <p
        className="text-sm text-muted-foreground italic"
        data-testid="graph-lens-graph-viz-empty"
      >
        No nodes to render.
      </p>
    );
  }
  const size = 320;
  const radius = size / 2 - 20;
  const cx = size / 2;
  const cy = size / 2;
  const positions = new Map<string, { x: number; y: number }>();
  for (let i = 0; i < nodes.length; i += 1) {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    positions.set(nodes[i].id, {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }
  // Only render edges whose BOTH endpoints are in the filtered node
  // set — same dangling-suppression discipline as the runner builders.
  const renderableEdges = edges.filter(
    (e) => positions.has(e.sourceNodeId) && positions.has(e.targetNodeId),
  );
  return (
    <div data-testid="graph-lens-graph-viz">
      <SectionLabel>
        Graph ({nodes.length} nodes, {renderableEdges.length} edges)
      </SectionLabel>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full max-w-md border border-border rounded"
        data-testid="graph-lens-graph-viz-svg"
      >
        {renderableEdges.map((e, i) => {
          const s = positions.get(e.sourceNodeId)!;
          const t = positions.get(e.targetNodeId)!;
          return (
            <line
              key={`${e.sourceNodeId}-${e.targetNodeId}-${i}`}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke="currentColor"
              strokeOpacity={e.visible ? 0.4 : 0.15}
              strokeWidth={1}
            />
          );
        })}
        {nodes.map((n) => {
          const p = positions.get(n.id)!;
          return (
            <g key={n.id} data-testid={`graph-lens-graph-viz-node-${n.id}`}>
              <circle
                cx={p.x}
                cy={p.y}
                r={5}
                fill={n.visible ? "currentColor" : "transparent"}
                stroke="currentColor"
                strokeDasharray={n.visible ? undefined : "2 2"}
              />
              <title>
                {n.visible
                  ? `${n.typeKey}: ${n.label ?? n.id}`
                  : `${n.typeKey}: (hidden)`}
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * T-F.78 TimelineGraphViz — first layout-specific renderer.
 *
 * Selected when `snapshot.layout === "timeline"`. Positions nodes
 * left-to-right by their index in the filtered list (the runner emits
 * nodes in a deterministic order — for runtime-runs that's
 * chronological by `createdAt`, for runner_pack rollups it's typeKey
 * batched). y is banded by the node's typeKey: each unique typeKey
 * gets its own horizontal row, sorted alphabetically for stability.
 *
 * Edges remain straight lines between their endpoints — same
 * dangling-suppression discipline as the circular renderer.
 */
function TimelineGraphViz({
  nodes,
  edges,
}: {
  readonly nodes: ReadonlyArray<{
    typeKey: string;
    id: string;
    visible: boolean;
    label?: string;
  }>;
  readonly edges: ReadonlyArray<{
    typeKey: string;
    sourceNodeId: string;
    targetNodeId: string;
    visible: boolean;
  }>;
}) {
  if (nodes.length === 0) {
    return (
      <p
        className="text-sm text-muted-foreground italic"
        data-testid="graph-lens-timeline-viz-empty"
      >
        No nodes to render.
      </p>
    );
  }
  const width = 480;
  const height = 240;
  const marginX = 24;
  const marginY = 24;
  // Banding: the alphabetically-sorted set of typeKeys present in the
  // filtered node list. y derives from the typeKey's index in this
  // band, so each typeKey gets a stable horizontal row regardless of
  // node order.
  const typeKeyBands = Array.from(new Set(nodes.map((n) => n.typeKey))).sort();
  const bandStep =
    typeKeyBands.length === 1
      ? 0
      : (height - 2 * marginY) / (typeKeyBands.length - 1);
  const positions = new Map<string, { x: number; y: number }>();
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i];
    const x =
      marginX + (i / Math.max(nodes.length - 1, 1)) * (width - 2 * marginX);
    const bandIndex = typeKeyBands.indexOf(n.typeKey);
    const y = marginY + bandIndex * bandStep;
    positions.set(n.id, { x, y });
  }
  const renderableEdges = edges.filter(
    (e) => positions.has(e.sourceNodeId) && positions.has(e.targetNodeId),
  );
  return (
    <div data-testid="graph-lens-timeline-viz">
      <SectionLabel>
        Timeline ({nodes.length} nodes, {typeKeyBands.length} bands,{" "}
        {renderableEdges.length} edges)
      </SectionLabel>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full max-w-2xl border border-border rounded"
        data-testid="graph-lens-timeline-viz-svg"
      >
        {typeKeyBands.map((key, i) => {
          const y = marginY + i * bandStep;
          return (
            <g key={`band-${key}`}>
              <line
                x1={marginX}
                y1={y}
                x2={width - marginX}
                y2={y}
                stroke="currentColor"
                strokeOpacity={0.1}
                strokeWidth={1}
              />
              <text
                x={marginX - 6}
                y={y + 3}
                fontSize={8}
                textAnchor="end"
                fill="currentColor"
                fillOpacity={0.6}
              >
                {key}
              </text>
            </g>
          );
        })}
        {renderableEdges.map((e, i) => {
          const s = positions.get(e.sourceNodeId)!;
          const t = positions.get(e.targetNodeId)!;
          return (
            <line
              key={`${e.sourceNodeId}-${e.targetNodeId}-${i}`}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke="currentColor"
              strokeOpacity={e.visible ? 0.4 : 0.15}
              strokeWidth={1}
            />
          );
        })}
        {nodes.map((n) => {
          const p = positions.get(n.id)!;
          return (
            <g
              key={n.id}
              data-testid={`graph-lens-timeline-viz-node-${n.id}`}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={4}
                fill={n.visible ? "currentColor" : "transparent"}
                stroke="currentColor"
                strokeDasharray={n.visible ? undefined : "2 2"}
              />
              <title>
                {n.visible
                  ? `${n.typeKey}: ${n.label ?? n.id}`
                  : `${n.typeKey}: (hidden)`}
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * T-F.79 MatrixGraphViz — second layout-specific renderer.
 *
 * Selected when `snapshot.layout === "matrix"` (CAG Pack View is the
 * canonical caller — block → source-note-version reference matrix).
 * Renders an N×N grid: every filtered node is both a row AND a
 * column, and cell (rowNode, colNode) is filled iff an edge
 * rowNode → colNode exists in the filtered set. Hidden edges get the
 * muted opacity used elsewhere; the diagonal cells stay empty unless
 * a self-edge exists.
 *
 * Why N×N (not source-typeKey × target-typeKey): node identity is
 * preserved so cell-level inspection lands on a specific edge, which
 * is the operator's actual debugging question for matrix lenses
 * (which block links to which source-note-version).
 */
function MatrixGraphViz({
  nodes,
  edges,
}: {
  readonly nodes: ReadonlyArray<{
    typeKey: string;
    id: string;
    visible: boolean;
    label?: string;
  }>;
  readonly edges: ReadonlyArray<{
    typeKey: string;
    sourceNodeId: string;
    targetNodeId: string;
    visible: boolean;
  }>;
}) {
  if (nodes.length === 0) {
    return (
      <p
        className="text-sm text-muted-foreground italic"
        data-testid="graph-lens-matrix-viz-empty"
      >
        No nodes to render.
      </p>
    );
  }
  const cellSize = 14;
  const labelGutter = 64;
  const size = labelGutter + nodes.length * cellSize + 8;
  // Pre-compute the canonical edge key set so cell lookup is O(1)
  // across the N² render. Visible flag is folded into the value so
  // a visible edge wins over a hidden duplicate on the same pair.
  const edgeKeys = new Set<string>();
  const edgeVisibility = new Map<string, boolean>();
  for (const e of edges) {
    const key = `${e.sourceNodeId}|${e.targetNodeId}`;
    edgeKeys.add(key);
    edgeVisibility.set(key, edgeVisibility.get(key) === true || e.visible);
  }
  return (
    <div data-testid="graph-lens-matrix-viz">
      <SectionLabel>
        Matrix ({nodes.length}×{nodes.length}, {edgeKeys.size} edges)
      </SectionLabel>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full max-w-2xl border border-border rounded"
        data-testid="graph-lens-matrix-viz-svg"
      >
        {nodes.map((rowNode, rowIdx) => {
          const y = labelGutter + rowIdx * cellSize;
          return (
            <g key={`row-${rowNode.id}`}>
              <text
                x={labelGutter - 4}
                y={y + cellSize - 4}
                fontSize={8}
                textAnchor="end"
                fill="currentColor"
                fillOpacity={0.6}
              >
                {rowNode.label ?? rowNode.id}
              </text>
              {nodes.map((colNode, colIdx) => {
                const x = labelGutter + colIdx * cellSize;
                const key = `${rowNode.id}|${colNode.id}`;
                const present = edgeKeys.has(key);
                const visible = edgeVisibility.get(key) === true;
                return (
                  <rect
                    key={`cell-${rowNode.id}-${colNode.id}`}
                    data-testid={`graph-lens-matrix-viz-cell-${rowNode.id}-${colNode.id}`}
                    x={x}
                    y={y}
                    width={cellSize - 2}
                    height={cellSize - 2}
                    fill={present ? "currentColor" : "transparent"}
                    fillOpacity={present ? (visible ? 0.7 : 0.25) : 0}
                    stroke="currentColor"
                    strokeOpacity={0.15}
                    strokeWidth={0.5}
                  />
                );
              })}
            </g>
          );
        })}
        {nodes.map((colNode, colIdx) => {
          const x = labelGutter + colIdx * cellSize;
          return (
            <text
              key={`col-${colNode.id}`}
              x={x + cellSize / 2}
              y={labelGutter - 4}
              fontSize={8}
              textAnchor="end"
              fill="currentColor"
              fillOpacity={0.6}
              transform={`rotate(-60 ${x + cellSize / 2} ${labelGutter - 4})`}
            >
              {colNode.label ?? colNode.id}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * T-F.80 TreeGraphViz — third layout-specific renderer.
 *
 * Selected when `snapshot.layout === "tree"`. The RAC Context Plan
 * View + Graph Skill Pack View lenses both declare this layout —
 * their snapshots model parent→child hierarchies (plan-item →
 * source-binding; skill-pack → cypher-template → source-note).
 *
 * Layout strategy:
 *   1. Compute in-degree per node from the filtered edge set.
 *   2. Roots = nodes with in-degree 0.
 *   3. BFS from each root, assigning depth = parent.depth + 1.
 *   4. Orphan fallback: nodes the BFS never reaches (cycle-only
 *      subgraphs, dangling) get pinned to a synthetic floor lane at
 *      `maxDepth + 1`.
 *   5. y = depth × dy; x = sibling-index-within-depth × dx, centered.
 *
 * Edges remain straight lines between their endpoints — same
 * dangling-suppression discipline as the other renderers.
 */
function TreeGraphViz({
  nodes,
  edges,
}: {
  readonly nodes: ReadonlyArray<{
    typeKey: string;
    id: string;
    visible: boolean;
    label?: string;
  }>;
  readonly edges: ReadonlyArray<{
    typeKey: string;
    sourceNodeId: string;
    targetNodeId: string;
    visible: boolean;
  }>;
}) {
  if (nodes.length === 0) {
    return (
      <p
        className="text-sm text-muted-foreground italic"
        data-testid="graph-lens-tree-viz-empty"
      >
        No nodes to render.
      </p>
    );
  }
  const nodeIds = new Set(nodes.map((n) => n.id));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adjacency.set(n.id, []);
  }
  for (const e of edges) {
    if (!nodeIds.has(e.sourceNodeId) || !nodeIds.has(e.targetNodeId)) {
      continue;
    }
    inDegree.set(e.targetNodeId, (inDegree.get(e.targetNodeId) ?? 0) + 1);
    adjacency.get(e.sourceNodeId)?.push(e.targetNodeId);
  }
  // BFS from each root; depth=0 for roots, depth+1 per hop.
  const depth = new Map<string, number>();
  const queue: string[] = [];
  for (const n of nodes) {
    if (inDegree.get(n.id) === 0) {
      depth.set(n.id, 0);
      queue.push(n.id);
    }
  }
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depth.get(current) ?? 0;
    for (const child of adjacency.get(current) ?? []) {
      if (!depth.has(child)) {
        depth.set(child, currentDepth + 1);
        queue.push(child);
      }
    }
  }
  // Orphan fallback: any node not reached by BFS (e.g., part of a
  // cycle with no in-degree-0 entry) gets pinned to a floor lane.
  let maxDepth = 0;
  for (const d of depth.values()) {
    if (d > maxDepth) maxDepth = d;
  }
  for (const n of nodes) {
    if (!depth.has(n.id)) depth.set(n.id, maxDepth + 1);
  }
  // Group by depth, preserve filtered-node order within each lane.
  const lanes = new Map<number, Array<typeof nodes[number]>>();
  for (const n of nodes) {
    const d = depth.get(n.id) ?? 0;
    if (!lanes.has(d)) lanes.set(d, []);
    lanes.get(d)!.push(n);
  }
  const sortedDepths = Array.from(lanes.keys()).sort((a, b) => a - b);
  const width = 480;
  const dy = 56;
  const marginY = 28;
  const totalLanes = sortedDepths.length;
  const height = marginY * 2 + Math.max(totalLanes - 1, 0) * dy + 24;
  const positions = new Map<string, { x: number; y: number }>();
  sortedDepths.forEach((d, laneIdx) => {
    const lane = lanes.get(d)!;
    const slotW = lane.length === 0 ? width : width / (lane.length + 1);
    const y = marginY + laneIdx * dy;
    lane.forEach((n, slotIdx) => {
      positions.set(n.id, { x: slotW * (slotIdx + 1), y });
    });
  });
  const renderableEdges = edges.filter(
    (e) => positions.has(e.sourceNodeId) && positions.has(e.targetNodeId),
  );
  return (
    <div data-testid="graph-lens-tree-viz">
      <SectionLabel>
        Tree ({nodes.length} nodes, {totalLanes} depth lanes,{" "}
        {renderableEdges.length} edges)
      </SectionLabel>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full max-w-2xl border border-border rounded"
        data-testid="graph-lens-tree-viz-svg"
      >
        {renderableEdges.map((e, i) => {
          const s = positions.get(e.sourceNodeId)!;
          const t = positions.get(e.targetNodeId)!;
          return (
            <line
              key={`${e.sourceNodeId}-${e.targetNodeId}-${i}`}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke="currentColor"
              strokeOpacity={e.visible ? 0.4 : 0.15}
              strokeWidth={1}
            />
          );
        })}
        {nodes.map((n) => {
          const p = positions.get(n.id)!;
          return (
            <g key={n.id} data-testid={`graph-lens-tree-viz-node-${n.id}`}>
              <circle
                cx={p.x}
                cy={p.y}
                r={5}
                fill={n.visible ? "currentColor" : "transparent"}
                stroke="currentColor"
                strokeDasharray={n.visible ? undefined : "2 2"}
              />
              <title>
                {n.visible
                  ? `${n.typeKey}: ${n.label ?? n.id}`
                  : `${n.typeKey}: (hidden)`}
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
