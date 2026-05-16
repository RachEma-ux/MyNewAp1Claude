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

export function GraphLensBrowserPanel() {
  const [workspaceId, setWorkspaceId] = useState<number>(1);
  const [selectedLensId, setSelectedLensId] = useState<string | null>(null);
  // T-F.72: typeKey drill-in filter. Pure client-side narrowing over
  // the already-fetched snapshot — no server round-trip needed.
  // Resets to null whenever the operator picks a different lens
  // (snapshot shape differs across lens kinds, so a stale filter
  // would silently filter to zero rows).
  const [typeKeyFilter, setTypeKeyFilter] = useState<string | null>(null);
  function selectLens(lensId: string) {
    setSelectedLensId(lensId);
    setTypeKeyFilter(null);
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
}

function RenderEnvelopeView({
  data,
  typeKeyFilter,
  onTypeKeyFilterChange,
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
  // T-F.72: apply the typeKey drill-in filter to the nodes preview
  // (and re-slice the first-15 cap from the filtered subset). Edges
  // remain unfiltered — the typeKey axis is about NODE narrowing, not
  // edge narrowing. If the filter doesn't match any node typeKey, the
  // filtered list is empty; the operator can click another row in the
  // rollup or use the Clear chip below the rollup.
  const filteredNodes =
    typeKeyFilter == null
      ? snapshot.nodes
      : snapshot.nodes.filter((n) => n.typeKey === typeKeyFilter);
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
          <div>
            <SectionLabel>
              Nodes{" "}
              {typeKeyFilter != null
                ? `(first 15 of ${filteredNodes.length} matching ${typeKeyFilter})`
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
                </tr>
              </thead>
              <tbody>
                {filteredNodes.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-2 text-center text-muted-foreground italic"
                      data-testid="graph-lens-render-nodes-empty-after-filter"
                    >
                      No nodes match the active typeKey filter.
                    </td>
                  </tr>
                ) : (
                  filteredNodes.slice(0, 15).map((n) => (
                    <tr key={n.id} className="border-t border-border">
                      <td className="py-1 font-mono">{n.id}</td>
                      <td className="py-1 font-mono">{n.typeKey}</td>
                      <td className="py-1 font-mono">
                        {n.visible ? "true" : "false"}
                      </td>
                      <td className="py-1">{n.label ?? "—"}</td>
                    </tr>
                  ))
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
    </div>
  );
}
