// RecommendationBatchRunnerPanel — no-deferral continuation-16 slice 81.
//
// Closes the last UI-consumer gap on the recommendation.* tRPC
// surface — the multi-kind `recommendBatch` endpoint. Mounted as a
// sibling panel below `RecommendationRunnerPanel` on
// `RecommendationPage`, so operators see the single-kind form first
// (primary workflow) and the multi-kind variant below for "show me
// all kinds at once" power mode.
//
// The panel mirrors slice 78's pattern but with a checkbox-array
// kind selector. The response is a `BatchKindResult[]` carrying a
// per-kind `ok | error` discriminator + the per-kind response (on
// `ok`) or `errorMessage` (on `error`). Per-kind failures don't
// abort the batch — the server fanouts via Promise.all + each kind
// stands alone.

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "./ui";

// Match the server-side constants from
// `services/recommendation/contracts.ts` — keep in lockstep with the
// single-kind panel in `RecommendationRunnerPanel`.
const LIMIT_DEFAULT = 10;
const LIMIT_MIN = 1;
const LIMIT_MAX = 100;
const MIN_CONFIDENCE_DEFAULT = 0.5;
const MIN_CONFIDENCE_MIN = 0;
const MIN_CONFIDENCE_MAX = 1;

function parsePositiveInt(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseConfidence(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

interface SubmittedRequest {
  readonly kinds: string[];
  readonly anchor: { readonly typeKey: string; readonly id: string };
  readonly workspaceId: number;
  readonly limit?: number;
  readonly minConfidence?: number;
}

export function RecommendationBatchRunnerPanel() {
  const kindsQuery = trpc.agentStudio.recommendation.listKnownKinds.useQuery(
    undefined,
    { refetchOnWindowFocus: false },
  );
  const allKinds = kindsQuery.data?.kinds ?? [];
  const metadata = (kindsQuery.data?.metadata ?? {}) as Record<
    string,
    { label?: string; description?: string }
  >;

  const [selectedKinds, setSelectedKinds] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [typeKey, setTypeKey] = useState("");
  const [anchorId, setAnchorId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [limit, setLimit] = useState<string>(String(LIMIT_DEFAULT));
  const [minConfidence, setMinConfidence] = useState<string>(
    String(MIN_CONFIDENCE_DEFAULT),
  );

  const [submitted, setSubmitted] = useState<SubmittedRequest | null>(null);

  function toggleKind(k: string) {
    setSelectedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
    setSubmitted(null);
  }

  const parsedWorkspace = parsePositiveInt(workspaceId);
  const parsedLimit = parsePositiveInt(limit);
  const limitValid =
    parsedLimit !== null && parsedLimit >= LIMIT_MIN && parsedLimit <= LIMIT_MAX;
  const parsedConfidence = parseConfidence(minConfidence);
  const confidenceValid =
    parsedConfidence !== null &&
    parsedConfidence >= MIN_CONFIDENCE_MIN &&
    parsedConfidence <= MIN_CONFIDENCE_MAX;

  // Preserve selection order — set iteration order is insertion order in
  // modern JS, but to be explicit we materialize the kinds in the order
  // returned by `listKnownKinds` and filter to selected. The server
  // dedupes anyway, but preserving a stable order keeps the result
  // sections rendering in a predictable layout.
  const orderedSelectedKinds = useMemo(
    () => allKinds.filter((k) => selectedKinds.has(k)),
    [allKinds, selectedKinds],
  );

  const formValid =
    orderedSelectedKinds.length > 0 &&
    typeKey.trim().length > 0 &&
    anchorId.trim().length > 0 &&
    parsedWorkspace !== null &&
    limitValid &&
    confidenceValid;

  function handleRun() {
    if (!formValid) return;
    setSubmitted({
      kinds: [...orderedSelectedKinds],
      anchor: { typeKey: typeKey.trim(), id: anchorId.trim() },
      workspaceId: parsedWorkspace as number,
      ...(parsedLimit !== LIMIT_DEFAULT ? { limit: parsedLimit as number } : {}),
      ...(parsedConfidence !== MIN_CONFIDENCE_DEFAULT
        ? { minConfidence: parsedConfidence as number }
        : {}),
    });
  }

  const batchQuery =
    trpc.agentStudio.recommendation.recommendBatch.useQuery(
      submitted !== null
        ? {
            kinds: submitted.kinds as never,
            anchor: submitted.anchor,
            workspaceId: submitted.workspaceId,
            ...(submitted.limit !== undefined ? { limit: submitted.limit } : {}),
            ...(submitted.minConfidence !== undefined
              ? { minConfidence: submitted.minConfidence }
              : {}),
          }
        : (undefined as never),
      { enabled: submitted !== null, refetchOnWindowFocus: false },
    );

  const envelope = batchQuery.data ?? null;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <SectionLabel>Run multi-kind recommendation</SectionLabel>
        <p className="text-sm text-muted-foreground">
          Same anchor + workspace, multiple kinds in parallel. Per-kind
          failures don't abort the batch.
        </p>

        <div>
          <Label>Kinds</Label>
          <div
            className="grid grid-cols-1 gap-1 sm:grid-cols-2"
            data-testid="rec-batch-kinds-list"
          >
            {kindsQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Loading kinds…</p>
            ) : kindsQuery.error ? (
              <p className="text-xs text-destructive">
                Failed to load kinds: {kindsQuery.error.message}
              </p>
            ) : (
              allKinds.map((k) => (
                <label
                  key={k}
                  className="flex cursor-pointer items-center gap-2 rounded border p-2 text-xs hover:bg-muted/40"
                >
                  <input
                    type="checkbox"
                    data-testid={`rec-batch-kind-${k}`}
                    checked={selectedKinds.has(k)}
                    onChange={() => toggleKind(k)}
                  />
                  <span className="font-medium">
                    {metadata[k]?.label ?? k}
                  </span>
                  {metadata[k]?.description ? (
                    <span className="ml-1 text-muted-foreground">
                      — {metadata[k].description}
                    </span>
                  ) : null}
                </label>
              ))
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="rec-batch-workspace-id">Workspace id</Label>
            <Input
              id="rec-batch-workspace-id"
              data-testid="rec-batch-workspace-id"
              type="number"
              min={1}
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              placeholder="e.g. 7"
            />
          </div>
          <div>
            <Label htmlFor="rec-batch-type-key">Anchor typeKey</Label>
            <Input
              id="rec-batch-type-key"
              data-testid="rec-batch-type-key"
              value={typeKey}
              onChange={(e) => setTypeKey(e.target.value)}
              placeholder="e.g. Note / Agent / Entity"
            />
          </div>
          <div>
            <Label htmlFor="rec-batch-anchor-id">Anchor id</Label>
            <Input
              id="rec-batch-anchor-id"
              data-testid="rec-batch-anchor-id"
              value={anchorId}
              onChange={(e) => setAnchorId(e.target.value)}
              placeholder="e.g. note-42 / agent-7"
            />
          </div>
          <div>
            <Label htmlFor="rec-batch-limit">
              Limit per kind ({LIMIT_MIN}–{LIMIT_MAX})
            </Label>
            <Input
              id="rec-batch-limit"
              data-testid="rec-batch-limit"
              type="number"
              min={LIMIT_MIN}
              max={LIMIT_MAX}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="rec-batch-min-confidence">
              Min confidence ({MIN_CONFIDENCE_MIN}–{MIN_CONFIDENCE_MAX})
            </Label>
            <Input
              id="rec-batch-min-confidence"
              data-testid="rec-batch-min-confidence"
              type="number"
              min={MIN_CONFIDENCE_MIN}
              max={MIN_CONFIDENCE_MAX}
              step={0.05}
              value={minConfidence}
              onChange={(e) => setMinConfidence(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            disabled={!formValid || batchQuery.isLoading}
            onClick={handleRun}
            data-testid="rec-batch-run-submit"
          >
            {batchQuery.isLoading
              ? "Recommending…"
              : `Run for ${orderedSelectedKinds.length} kind${orderedSelectedKinds.length === 1 ? "" : "s"}`}
          </Button>
          {!formValid ? (
            <span className="text-xs text-muted-foreground">
              Pick ≥1 kind + fill anchor / workspace / limit / confidence.
            </span>
          ) : null}
        </div>

        {submitted !== null && batchQuery.error ? (
          <p
            className="text-sm text-destructive"
            data-testid="rec-batch-result-error"
          >
            Batch failed: {batchQuery.error.message}
          </p>
        ) : null}

        {envelope?.status === "graphrag_unavailable" ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="rec-batch-graphrag-unavailable"
          >
            GraphRAG backend is not configured in this environment.
            Recommendations are unavailable until an operator installs the
            backend.
          </p>
        ) : null}

        {envelope?.status === "ok" && envelope.results ? (
          <div
            className="space-y-3"
            data-testid="rec-batch-result"
          >
            {envelope.results.map((kr) => {
              const kindLabel = metadata[kr.kind]?.label ?? kr.kind;
              return (
                <div
                  key={kr.kind}
                  data-testid="rec-batch-kind-section"
                  className="rounded border bg-muted/20 p-3 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{kindLabel}</span>
                    <span
                      className={
                        "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
                        (kr.status === "ok"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : "bg-destructive/10 text-destructive")
                      }
                    >
                      {kr.status}
                    </span>
                  </div>
                  {kr.status === "error" ? (
                    <p className="mt-1 text-destructive">
                      {kr.errorMessage ?? "(no error message)"}
                    </p>
                  ) : kr.response ? (
                    <>
                      {kr.response.redactedCount > 0 ||
                      kr.response.fullyHiddenCount > 0 ? (
                        <p className="mt-1 text-amber-700 dark:text-amber-300">
                          {kr.response.redactedCount} redacted
                          {kr.response.fullyHiddenCount > 0
                            ? `, ${kr.response.fullyHiddenCount} fully hidden`
                            : ""}
                        </p>
                      ) : null}
                      {kr.response.results.length === 0 ? (
                        <p className="mt-1 text-muted-foreground">
                          No results matched the confidence threshold.
                        </p>
                      ) : (
                        <ul className="mt-2 space-y-1">
                          {kr.response.results.map((r) => (
                            <li
                              key={`${r.rank}::${r.recommendedNode.typeKey}::${r.recommendedNode.id}`}
                              data-testid="rec-batch-result-row"
                              className="rounded border bg-background p-2"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-medium">
                                  #{r.rank}
                                </span>
                                <span
                                  className={
                                    "rounded px-1.5 py-0.5 text-[10px] font-medium " +
                                    (r.permissionStatus === "visible"
                                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                      : r.permissionStatus === "redacted"
                                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                                        : "bg-muted text-muted-foreground")
                                  }
                                >
                                  {r.permissionStatus}
                                </span>
                                <span className="font-mono text-muted-foreground">
                                  {r.recommendedNode.typeKey}
                                </span>
                                <span className="flex-1 truncate">
                                  {r.recommendedNode.id}
                                </span>
                                <span className="text-muted-foreground">
                                  conf {r.confidence.toFixed(2)}
                                </span>
                              </div>
                              <p className="mt-1 text-muted-foreground">
                                {r.reason}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
