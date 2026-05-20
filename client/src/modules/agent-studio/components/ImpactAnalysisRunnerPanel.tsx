// ImpactAnalysisRunnerPanel — no-deferral continuation-14 slice 75.
//
// Closes the UI-consumer gap for the impactAnalysis.* tRPC surface
// (listKnownKinds + summarizeResult + runImpactAnalysis), all
// shipped server-side via T-G.5.α + the no-deferral slice 29
// template registry (impact-analysis-templates.ts).
//
// Operator workflow: pick a kind from the closed taxonomy
// (knowledge_impact / runtime_impact / code_impact / etc.), enter a
// starting node (typeKey + id), optionally constrain max depth +
// node-type filter, then Run. The result renders nodes + edges +
// a mode badge ("stub" vs "template") + a summary fetched via
// summarizeResult.

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "./ui";

// Match the server-side `ABSOLUTE_IMPACT_MAX_DEPTH` constant from
// `impact-analysis-contracts.ts` — keep in lockstep. The server's
// zod schema accepts up to 64, but the documented operator-facing
// max is 10 (higher values gate on approver_only governance scope
// which the runner panel doesn't surface).
const DEPTH_DEFAULT = 3;
const DEPTH_MIN = 1;
const DEPTH_MAX = 10;

// node-type filter is capped at 64 entries server-side.
const FILTER_MAX_ENTRIES = 64;

function parsePositiveInt(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseFilter(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, FILTER_MAX_ENTRIES);
}

// Lazy-decoded form snapshot. When the operator clicks Run, the
// current form state is materialized into this shape and stored;
// the runImpactAnalysis useQuery `enabled` flag flips on once
// `submitted !== null`.
interface SubmittedRequest {
  readonly kind: string;
  readonly startingNode: { readonly typeKey: string; readonly id: string };
  readonly maxDepth?: number;
  readonly nodeTypeKeyFilter?: string[];
}

export function ImpactAnalysisRunnerPanel() {
  const kindsQuery =
    trpc.agentStudio.impactAnalysis.listKnownKinds.useQuery(undefined, {
      refetchOnWindowFocus: false,
    });
  const kinds = kindsQuery.data?.kinds ?? [];
  const metadata = kindsQuery.data?.metadata ?? {};

  const [kind, setKind] = useState<string>("");
  const [typeKey, setTypeKey] = useState("");
  const [nodeId, setNodeId] = useState("");
  const [depth, setDepth] = useState<string>(String(DEPTH_DEFAULT));
  const [filterRaw, setFilterRaw] = useState("");

  const [submitted, setSubmitted] = useState<SubmittedRequest | null>(null);

  const parsedDepth = parsePositiveInt(depth);
  const depthValid =
    parsedDepth !== null &&
    parsedDepth >= DEPTH_MIN &&
    parsedDepth <= DEPTH_MAX;
  const formValid =
    kind !== "" &&
    typeKey.trim().length > 0 &&
    nodeId.trim().length > 0 &&
    depthValid;

  function handleRun() {
    if (!formValid) return;
    const filter = parseFilter(filterRaw);
    setSubmitted({
      kind,
      startingNode: { typeKey: typeKey.trim(), id: nodeId.trim() },
      ...(parsedDepth !== DEPTH_DEFAULT ? { maxDepth: parsedDepth! } : {}),
      ...(filter.length > 0 ? { nodeTypeKeyFilter: filter } : {}),
    });
  }

  const resultQuery =
    trpc.agentStudio.impactAnalysis.runImpactAnalysis.useQuery(
      submitted !== null
        ? {
            kind: submitted.kind,
            startingNode: submitted.startingNode,
            ...(submitted.maxDepth !== undefined
              ? { maxDepth: submitted.maxDepth }
              : {}),
            ...(submitted.nodeTypeKeyFilter !== undefined
              ? { nodeTypeKeyFilter: submitted.nodeTypeKeyFilter }
              : {}),
          }
        : (undefined as never),
      { enabled: submitted !== null, refetchOnWindowFocus: false },
    );

  // summarizeResult is invoked against the result the runner just
  // produced — server-side pure aggregator. Skipped until the
  // result is present.
  const result = resultQuery.data?.result ?? null;
  const summaryQuery =
    trpc.agentStudio.impactAnalysis.summarizeResult.useQuery(
      result !== null
        ? {
            kind: result.kind,
            startingNodeId: result.startingNodeId,
            nodes: result.nodes,
            edges: result.edges,
            truncated: result.truncated,
            hiddenNodeCount: result.hiddenNodeCount,
          }
        : (undefined as never),
      { enabled: result !== null, refetchOnWindowFocus: false },
    );

  const mode = resultQuery.data?.mode ?? null;
  const kindMetadataLookup = metadata as Record<
    string,
    { label?: string; description?: string }
  >;
  const selectedKindMeta = useMemo(() => {
    if (kind === "") return null;
    return kindMetadataLookup[kind] ?? null;
  }, [kind, kindMetadataLookup]);

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <SectionLabel>Run impact analysis</SectionLabel>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="ia-kind">Kind</Label>
            <select
              id="ia-kind"
              data-testid="ia-kind"
              className="w-full rounded border bg-background p-2 text-sm"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setSubmitted(null);
              }}
              disabled={kindsQuery.isLoading}
            >
              <option value="">(select a kind)</option>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {kindMetadataLookup[k]?.label ?? k}
                </option>
              ))}
            </select>
            {selectedKindMeta?.description ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedKindMeta.description}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="ia-type-key">Starting node typeKey</Label>
            <Input
              id="ia-type-key"
              data-testid="ia-type-key"
              value={typeKey}
              onChange={(e) => setTypeKey(e.target.value)}
              placeholder="e.g. Service / Note / Entity"
            />
          </div>
          <div>
            <Label htmlFor="ia-node-id">Starting node id</Label>
            <Input
              id="ia-node-id"
              data-testid="ia-node-id"
              value={nodeId}
              onChange={(e) => setNodeId(e.target.value)}
              placeholder="e.g. note-42 / service:auth"
            />
          </div>
          <div>
            <Label htmlFor="ia-depth">
              Max depth ({DEPTH_MIN}–{DEPTH_MAX})
            </Label>
            <Input
              id="ia-depth"
              data-testid="ia-depth"
              type="number"
              min={DEPTH_MIN}
              max={DEPTH_MAX}
              value={depth}
              onChange={(e) => setDepth(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ia-filter">
              Node type filter (optional, comma-separated, ≤{FILTER_MAX_ENTRIES})
            </Label>
            <Input
              id="ia-filter"
              data-testid="ia-filter"
              value={filterRaw}
              onChange={(e) => setFilterRaw(e.target.value)}
              placeholder="e.g. Service, Owner, Endpoint"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            disabled={!formValid || resultQuery.isLoading}
            onClick={handleRun}
            data-testid="ia-run-submit"
          >
            {resultQuery.isLoading ? "Analyzing…" : "Run analysis"}
          </Button>
          {!formValid ? (
            <span className="text-xs text-muted-foreground">
              Pick a kind + fill typeKey, id, and valid depth to enable.
            </span>
          ) : null}
        </div>

        {submitted !== null && resultQuery.error ? (
          <p
            className="text-sm text-destructive"
            data-testid="ia-result-error"
          >
            Analysis failed: {resultQuery.error.message}
          </p>
        ) : null}

        {result !== null && (
          <div
            className="space-y-3 rounded border bg-muted/20 p-3"
            data-testid="ia-result"
          >
            <div className="flex items-center gap-2 text-sm">
              <SectionLabel>Result</SectionLabel>
              <span
                data-testid="ia-mode-pill"
                className={
                  "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
                  (mode === "template"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-muted text-muted-foreground")
                }
              >
                {mode ?? "—"}
              </span>
              <span className="text-xs text-muted-foreground">
                anchor: {result.startingNodeId}
              </span>
              {result.truncated ? (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  truncated
                </span>
              ) : null}
            </div>

            {summaryQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Loading summary…</p>
            ) : summaryQuery.data?.summary ? (
              <div
                className="flex flex-wrap items-center gap-2 text-xs"
                data-testid="ia-summary"
              >
                <span className="rounded bg-background px-2 py-1">
                  nodes: {summaryQuery.data.summary.totalNodes}
                </span>
                <span className="rounded bg-background px-2 py-1">
                  visible: {summaryQuery.data.summary.visibleNodes}
                </span>
                <span className="rounded bg-background px-2 py-1">
                  hidden: {summaryQuery.data.summary.hiddenNodes}
                </span>
                <span className="rounded bg-background px-2 py-1">
                  edges: {summaryQuery.data.summary.totalEdges}
                </span>
                <span className="rounded bg-background px-2 py-1">
                  max depth: {summaryQuery.data.summary.maxObservedDepth}
                </span>
              </div>
            ) : null}

            {result.nodes.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No impact nodes returned (anchor-only result).
              </p>
            ) : (
              <ul
                className="space-y-1"
                data-testid="ia-nodes-list"
              >
                {result.nodes.map((n) => (
                  <li
                    key={`${n.typeKey}::${n.id}`}
                    data-testid="ia-node-row"
                    className="rounded border bg-background p-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-muted-foreground">
                        {n.typeKey}
                      </span>
                      <span className="font-medium">{n.label ?? n.id}</span>
                      <span className="text-muted-foreground">
                        depth {n.depth}
                      </span>
                      {!n.visible ? (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          hidden
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
