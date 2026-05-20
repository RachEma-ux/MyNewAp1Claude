// RecommendationRunnerPanel — no-deferral continuation-15 slice 78.
//
// Closes the UI-consumer gap for the recommendation.* tRPC surface
// (listKnownKinds + recommend; recommendBatch is the multi-kind
// extension deferred to continuation-16). Mirrors slice 75's
// ImpactAnalysisRunnerPanel pattern: kind dropdown + anchor form +
// Run → query-with-form pattern via `enabled` gate.
//
// The recommend envelope is discriminated: `"ok"` carries the
// response; `"graphrag_unavailable"` is rendered as a backend-
// unavailable empty-state. Per-result rows surface rank, permission
// status, confidence, reason, graph path, and citations.

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "./ui";

// Match the server-side constants from
// `services/recommendation/contracts.ts` — keep in lockstep.
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
  readonly kind: string;
  readonly anchor: { readonly typeKey: string; readonly id: string };
  readonly workspaceId: number;
  readonly limit?: number;
  readonly minConfidence?: number;
}

export function RecommendationRunnerPanel() {
  const kindsQuery = trpc.agentStudio.recommendation.listKnownKinds.useQuery(
    undefined,
    { refetchOnWindowFocus: false },
  );
  const kinds = kindsQuery.data?.kinds ?? [];
  const metadata = (kindsQuery.data?.metadata ?? {}) as Record<
    string,
    { label?: string; description?: string }
  >;

  const [kind, setKind] = useState<string>("");
  const [typeKey, setTypeKey] = useState("");
  const [anchorId, setAnchorId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [limit, setLimit] = useState<string>(String(LIMIT_DEFAULT));
  const [minConfidence, setMinConfidence] = useState<string>(
    String(MIN_CONFIDENCE_DEFAULT),
  );

  const [submitted, setSubmitted] = useState<SubmittedRequest | null>(null);

  const parsedWorkspace = parsePositiveInt(workspaceId);
  const parsedLimit = parsePositiveInt(limit);
  const limitValid =
    parsedLimit !== null && parsedLimit >= LIMIT_MIN && parsedLimit <= LIMIT_MAX;
  const parsedConfidence = parseConfidence(minConfidence);
  const confidenceValid =
    parsedConfidence !== null &&
    parsedConfidence >= MIN_CONFIDENCE_MIN &&
    parsedConfidence <= MIN_CONFIDENCE_MAX;

  const formValid =
    kind !== "" &&
    typeKey.trim().length > 0 &&
    anchorId.trim().length > 0 &&
    parsedWorkspace !== null &&
    limitValid &&
    confidenceValid;

  function handleRun() {
    if (!formValid) return;
    setSubmitted({
      kind,
      anchor: { typeKey: typeKey.trim(), id: anchorId.trim() },
      workspaceId: parsedWorkspace as number,
      ...(parsedLimit !== LIMIT_DEFAULT ? { limit: parsedLimit as number } : {}),
      ...(parsedConfidence !== MIN_CONFIDENCE_DEFAULT
        ? { minConfidence: parsedConfidence as number }
        : {}),
    });
  }

  const recommendQuery =
    trpc.agentStudio.recommendation.recommend.useQuery(
      submitted !== null
        ? {
            kind: submitted.kind,
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

  const selectedKindMeta = useMemo(() => {
    if (kind === "") return null;
    return metadata[kind] ?? null;
  }, [kind, metadata]);

  const envelope = recommendQuery.data ?? null;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <SectionLabel>Run recommendation</SectionLabel>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="rec-kind">Kind</Label>
            <select
              id="rec-kind"
              data-testid="rec-kind"
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
                  {metadata[k]?.label ?? k}
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
            <Label htmlFor="rec-workspace-id">Workspace id</Label>
            <Input
              id="rec-workspace-id"
              data-testid="rec-workspace-id"
              type="number"
              min={1}
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              placeholder="e.g. 7"
            />
          </div>
          <div>
            <Label htmlFor="rec-type-key">Anchor typeKey</Label>
            <Input
              id="rec-type-key"
              data-testid="rec-type-key"
              value={typeKey}
              onChange={(e) => setTypeKey(e.target.value)}
              placeholder="e.g. Note / Agent / Entity"
            />
          </div>
          <div>
            <Label htmlFor="rec-anchor-id">Anchor id</Label>
            <Input
              id="rec-anchor-id"
              data-testid="rec-anchor-id"
              value={anchorId}
              onChange={(e) => setAnchorId(e.target.value)}
              placeholder="e.g. note-42 / agent-7"
            />
          </div>
          <div>
            <Label htmlFor="rec-limit">
              Limit ({LIMIT_MIN}–{LIMIT_MAX})
            </Label>
            <Input
              id="rec-limit"
              data-testid="rec-limit"
              type="number"
              min={LIMIT_MIN}
              max={LIMIT_MAX}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="rec-min-confidence">
              Min confidence ({MIN_CONFIDENCE_MIN}–{MIN_CONFIDENCE_MAX})
            </Label>
            <Input
              id="rec-min-confidence"
              data-testid="rec-min-confidence"
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
            disabled={!formValid || recommendQuery.isLoading}
            onClick={handleRun}
            data-testid="rec-run-submit"
          >
            {recommendQuery.isLoading ? "Recommending…" : "Run recommendation"}
          </Button>
          {!formValid ? (
            <span className="text-xs text-muted-foreground">
              Pick a kind + fill anchor, workspace, limit (1–100), confidence (0–1).
            </span>
          ) : null}
        </div>

        {submitted !== null && recommendQuery.error ? (
          <p
            className="text-sm text-destructive"
            data-testid="rec-result-error"
          >
            Recommendation failed: {recommendQuery.error.message}
          </p>
        ) : null}

        {envelope?.status === "graphrag_unavailable" ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="rec-graphrag-unavailable"
          >
            GraphRAG backend is not configured in this environment.
            Recommendations are unavailable until an operator installs the
            backend.
          </p>
        ) : null}

        {envelope?.status === "ok" && envelope.response ? (
          <div
            className="space-y-3 rounded border bg-muted/20 p-3"
            data-testid="rec-result"
          >
            <div className="flex items-center gap-2 text-sm">
              <SectionLabel>Results</SectionLabel>
              <span className="text-xs text-muted-foreground">
                anchor: {envelope.response.anchor.typeKey}:
                {envelope.response.anchor.id}
              </span>
              {envelope.response.redactedCount > 0 ||
              envelope.response.fullyHiddenCount > 0 ? (
                <span
                  className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                  data-testid="rec-hidden-banner"
                >
                  {envelope.response.redactedCount} redacted
                  {envelope.response.fullyHiddenCount > 0
                    ? `, ${envelope.response.fullyHiddenCount} fully hidden`
                    : ""}
                </span>
              ) : null}
            </div>

            {envelope.response.results.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No results matched the confidence threshold.
              </p>
            ) : (
              <ul className="space-y-1" data-testid="rec-results-list">
                {envelope.response.results.map((r) => (
                  <li
                    key={`${r.rank}::${r.recommendedNode.typeKey}::${r.recommendedNode.id}`}
                    data-testid="rec-result-row"
                    className="rounded border bg-background p-2 text-xs"
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
                    <p className="mt-1 text-muted-foreground">{r.reason}</p>
                    {r.graphPath.length > 0 ? (
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                        path: {r.graphPath.join(" → ")}
                      </p>
                    ) : null}
                    {r.sourceCitations.length > 0 ? (
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                        citations:{" "}
                        {r.sourceCitations
                          .map((c) => `${c.typeKey}:${c.id}`)
                          .join(", ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
