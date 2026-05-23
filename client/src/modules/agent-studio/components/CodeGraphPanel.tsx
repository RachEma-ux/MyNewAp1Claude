// CodeGraphPanel — no-deferral continuation-18 slice 87.
//
// Closes the entire codeGraph.* tRPC UI-consumer gap surfaced by
// continuation-17's broad audit. 7 endpoints consumed in one panel:
//   - listIngestions          — master ingestion list
//   - getIngestionStats       — per-ingestion stats (lazy on select)
//   - listIngestionNodes      — per-ingestion node drill-in (lazy)
//   - listIngestionEdges      — per-ingestion edge drill-in (lazy)
//   - listRepositories        — per-repo freshness rollup
//   - listRecentParserErrors  — cross-ingestion parser-error rollup
//   - listKnownTypes          — closed-taxonomy enum for filter dropdowns
//
// Mirrors slice 84's SecurityGraphPanel verbatim, with field-rename
// substitutions per continuation-18 catalogue: repositoryId ↔
// sourceKey, listRecentParserErrors (filePath + reason + message)
// ↔ listRecentRejectionsByReason (reason + count), and node rows
// gain filePath + startLine/endLine fields.

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { SectionLabel } from "./ui";
import { formatRelative } from "./format-relative";

const INGESTIONS_LIMIT = 50;
const DRILL_IN_LIMIT = 100;

export function CodeGraphPanel() {
  const utils = trpc.useUtils();
  const ingestionsQuery =
    trpc.agentStudio.codeGraph.listIngestions.useQuery(
      { limit: INGESTIONS_LIMIT },
      { refetchOnWindowFocus: false },
    );
  const repositoriesQuery =
    trpc.agentStudio.codeGraph.listRepositories.useQuery(undefined, {
      refetchOnWindowFocus: false,
    });
  const parserErrorsQuery =
    trpc.agentStudio.codeGraph.listRecentParserErrors.useQuery(undefined, {
      refetchOnWindowFocus: false,
    });
  const knownTypesQuery =
    trpc.agentStudio.codeGraph.listKnownTypes.useQuery(undefined, {
      refetchOnWindowFocus: false,
    });

  // ── triggerIngest mutation (T-G.2.3 operator-trigger UI) ─────────
  // Closes the operator-visible boundary on the orchestrator slice:
  // the mutation lazy-loads the orchestrator + tree-sitter binding
  // server-side. On success, invalidates the three read queries that
  // change shape after a new ingestion (ingestions / repositories /
  // parserErrors). Errors surface inline; the form stays open so the
  // operator can correct the inputs.
  const [showTriggerForm, setShowTriggerForm] = useState(false);
  const [triggerRepoPath, setTriggerRepoPath] = useState("");
  const [triggerRepositoryId, setTriggerRepositoryId] = useState("");
  const [triggerSubPath, setTriggerSubPath] = useState("");
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [lastTriggerResult, setLastTriggerResult] = useState<{
    ingestionId: string;
    filesScanned: number;
    filesParsed: number;
    nodesUpserted: number;
    edgesUpserted: number;
    edgesRejected: number;
    parserErrorCount: number;
    durationMs: number;
  } | null>(null);
  const triggerMutation =
    trpc.agentStudio.codeGraph.triggerIngest.useMutation({
      onSuccess: (data) => {
        setLastTriggerResult({
          ingestionId: data.ingestionId,
          filesScanned: data.filesScanned,
          filesParsed: data.filesParsed,
          nodesUpserted: data.nodesUpserted,
          edgesUpserted: data.edgesUpserted,
          edgesRejected: data.edgesRejected,
          parserErrorCount: data.parserErrorCount,
          durationMs: data.durationMs,
        });
        setTriggerError(null);
        // Auto-select the newly-triggered ingestion so the
        // stats/nodes/edges drill-in sections populate without the
        // operator having to scroll down + click. Resetting the
        // type-key filters keeps the drill-in unfiltered for the
        // first look at the fresh data.
        setSelectedIngestionId(data.ingestionId);
        setNodeTypeFilter("");
        setEdgeTypeFilter("");
        void utils.agentStudio.codeGraph.listIngestions.invalidate();
        void utils.agentStudio.codeGraph.listRepositories.invalidate();
        void utils.agentStudio.codeGraph.listRecentParserErrors.invalidate();
      },
      onError: (err) => {
        setTriggerError(err.message);
      },
    });
  const handleTriggerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const repoPath = triggerRepoPath.trim();
    const repositoryId = triggerRepositoryId.trim();
    if (!repoPath || !repositoryId) {
      setTriggerError("repoPath and repositoryId are both required.");
      return;
    }
    const subPath = triggerSubPath.trim();
    triggerMutation.mutate({
      repoPath,
      repositoryId,
      ...(subPath !== "" ? { relativeSubPath: subPath } : {}),
    });
  };

  const [selectedIngestionId, setSelectedIngestionId] = useState<
    string | null
  >(null);
  const [nodeTypeFilter, setNodeTypeFilter] = useState<string>("");
  const [edgeTypeFilter, setEdgeTypeFilter] = useState<string>("");

  const statsQuery = trpc.agentStudio.codeGraph.getIngestionStats.useQuery(
    selectedIngestionId !== null
      ? { ingestionId: selectedIngestionId }
      : (undefined as never),
    {
      enabled: selectedIngestionId !== null,
      refetchOnWindowFocus: false,
    },
  );

  const nodesQuery = trpc.agentStudio.codeGraph.listIngestionNodes.useQuery(
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

  const edgesQuery = trpc.agentStudio.codeGraph.listIngestionEdges.useQuery(
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
  const repositories = repositoriesQuery.data?.repositories ?? [];
  const parserErrors = parserErrorsQuery.data?.errors ?? [];
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
        <div className="flex items-center justify-between">
          <SectionLabel>Code graph ingestions</SectionLabel>
          <button
            type="button"
            data-testid="cg-trigger-ingest-toggle"
            className="text-xs text-blue-600 hover:underline"
            onClick={() => {
              setShowTriggerForm((v) => !v);
              setTriggerError(null);
            }}
          >
            {showTriggerForm ? "Cancel" : "+ Trigger ingest"}
          </button>
        </div>

        {/* ── Operator-trigger form (T-G.2.3) ──────────────── */}
        {showTriggerForm && (
          <form
            onSubmit={handleTriggerSubmit}
            data-testid="cg-trigger-ingest-form"
            className="space-y-2 rounded border bg-muted/30 p-3"
          >
            <div className="space-y-1">
              <label
                className="block text-[10px] uppercase tracking-wide text-muted-foreground"
                htmlFor="cg-trigger-repo-path"
              >
                Repo path (absolute)
              </label>
              <input
                id="cg-trigger-repo-path"
                data-testid="cg-trigger-ingest-repo-path"
                type="text"
                className="w-full rounded border bg-background px-2 py-1 text-xs font-mono"
                placeholder="/abs/path/to/repo"
                value={triggerRepoPath}
                onChange={(e) => setTriggerRepoPath(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label
                className="block text-[10px] uppercase tracking-wide text-muted-foreground"
                htmlFor="cg-trigger-repository-id"
              >
                Repository id
              </label>
              <input
                id="cg-trigger-repository-id"
                data-testid="cg-trigger-ingest-repository-id"
                type="text"
                className="w-full rounded border bg-background px-2 py-1 text-xs font-mono"
                placeholder="my-repo / code_studio_repos.id"
                value={triggerRepositoryId}
                onChange={(e) => setTriggerRepositoryId(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label
                className="block text-[10px] uppercase tracking-wide text-muted-foreground"
                htmlFor="cg-trigger-sub-path"
              >
                Relative sub-path (optional)
              </label>
              <input
                id="cg-trigger-sub-path"
                data-testid="cg-trigger-ingest-sub-path"
                type="text"
                className="w-full rounded border bg-background px-2 py-1 text-xs font-mono"
                placeholder="server/agent-studio/services/extensions/"
                value={triggerSubPath}
                onChange={(e) => setTriggerSubPath(e.target.value)}
              />
            </div>
            {triggerError ? (
              <p
                data-testid="cg-trigger-ingest-error"
                className="text-xs text-destructive"
              >
                {triggerError}
              </p>
            ) : null}
            <button
              type="submit"
              data-testid="cg-trigger-ingest-submit"
              disabled={triggerMutation.isPending}
              className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {triggerMutation.isPending ? "Ingesting…" : "Run ingest"}
            </button>
          </form>
        )}

        {lastTriggerResult ? (
          <div
            data-testid="cg-trigger-ingest-result"
            className="rounded border border-emerald-300 bg-emerald-50 p-2 text-xs dark:border-emerald-900 dark:bg-emerald-900/20"
          >
            <p className="font-medium">Last ingest run</p>
            <p className="mt-1 font-mono text-[10px]">
              {lastTriggerResult.ingestionId}
            </p>
            <div className="mt-1 flex flex-wrap gap-2 text-muted-foreground">
              <span>scanned: {lastTriggerResult.filesScanned}</span>
              <span>parsed: {lastTriggerResult.filesParsed}</span>
              <span>nodes: {lastTriggerResult.nodesUpserted}</span>
              <span>edges: {lastTriggerResult.edgesUpserted}</span>
              {lastTriggerResult.edgesRejected > 0 ? (
                <span className="text-destructive">
                  rejected: {lastTriggerResult.edgesRejected}
                </span>
              ) : null}
              {lastTriggerResult.parserErrorCount > 0 ? (
                <span className="text-amber-700 dark:text-amber-300">
                  errors: {lastTriggerResult.parserErrorCount}
                </span>
              ) : null}
              <span>{lastTriggerResult.durationMs}ms</span>
            </div>
          </div>
        ) : null}

        {/* ── Per-repository freshness (top section) ───────── */}
        <div data-testid="cg-repositories-section">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Repository freshness
          </p>
          {repositoriesQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">
              Loading repositories…
            </p>
          ) : repositoriesQuery.error ? (
            <p className="text-xs text-destructive">
              Failed to load repositories: {repositoriesQuery.error.message}
            </p>
          ) : repositories.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No code-graph repositories have ingested yet.
            </p>
          ) : (
            <ul className="space-y-1">
              {repositories.map((r) => (
                <li
                  key={r.repositoryId}
                  data-testid="cg-repository-row"
                  className="rounded border bg-background p-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-medium">
                      {r.repositoryId}
                    </span>
                    <span className="text-muted-foreground">
                      {formatRelative(r.latestStartedAt)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-muted-foreground">
                    <span>{r.totalIngestionCount} run(s)</span>
                    <span>nodes: {r.latestNodesUpserted}</span>
                    <span>edges: {r.latestEdgesUpserted}</span>
                    {r.latestEdgesRejected > 0 ? (
                      <span className="text-destructive">
                        rejected: {r.latestEdgesRejected}
                      </span>
                    ) : null}
                    <span>status: {r.latestStatus}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Recent parser errors (cross-ingestion rollup) ── */}
        <div data-testid="cg-parser-errors-section">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Recent parser errors
          </p>
          {parserErrorsQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">
              Loading parser errors…
            </p>
          ) : parserErrorsQuery.error ? (
            <p className="text-xs text-destructive">
              Failed: {parserErrorsQuery.error.message}
            </p>
          ) : parserErrors.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No parser errors in recent ingestions.
            </p>
          ) : (
            <ul className="space-y-1">
              {parserErrors.map((e, idx) => (
                <li
                  key={`${e.ingestionId}::${e.filePath}::${idx}`}
                  data-testid="cg-parser-error-row"
                  className="rounded border bg-amber-50 p-2 text-xs dark:bg-amber-900/20"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">{e.reason}</span>
                    <span className="text-muted-foreground">
                      {e.repositoryId}
                    </span>
                    <span className="text-muted-foreground">
                      {formatRelative(e.ingestionStartedAt)}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {e.filePath}
                  </p>
                  {e.message ? (
                    <p className="mt-1 text-muted-foreground">{e.message}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Master ingestion list ────────────────────────── */}
        <div data-testid="cg-ingestions-section">
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
              No code-graph ingestions persisted yet.
            </p>
          ) : (
            <ul className="space-y-1" data-testid="cg-ingestions-list">
              {ingestions.map((i) => {
                const isSelected = i.ingestionId === selectedIngestionId;
                return (
                  <li
                    key={i.ingestionId}
                    data-testid="cg-ingestion-row"
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
                      <span>{i.repositoryId}</span>
                      <span>status: {i.status}</span>
                      <span>nodes: {i.nodesUpserted}</span>
                      <span>edges: {i.edgesUpserted}</span>
                      {i.edgesRejected > 0 ? (
                        <span className="text-destructive">
                          rejected: {i.edgesRejected}
                        </span>
                      ) : null}
                      {i.parserErrorCount > 0 ? (
                        <span className="text-amber-700 dark:text-amber-300">
                          parser errors: {i.parserErrorCount}
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
            data-testid="cg-detail"
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
                data-testid="cg-stats"
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
            <div data-testid="cg-nodes-drill-in">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold">Nodes</span>
                <select
                  data-testid="cg-node-type-filter"
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
                        data-testid="cg-node-row"
                        className="rounded border bg-background p-1.5 text-[11px]"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-muted-foreground">
                            {n.typeKey}
                          </span>
                          <span className="font-medium">{n.name}</span>
                          <span className="text-muted-foreground">
                            {n.id}
                          </span>
                        </div>
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                          {n.filePath}
                          {n.startLine != null
                            ? `:${n.startLine}${n.endLine != null && n.endLine !== n.startLine ? `–${n.endLine}` : ""}`
                            : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </div>

            {/* Edges drill-in */}
            <div data-testid="cg-edges-drill-in">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold">Edges</span>
                <select
                  data-testid="cg-edge-type-filter"
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
                        data-testid="cg-edge-row"
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
