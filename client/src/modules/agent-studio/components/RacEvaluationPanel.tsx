/**
 * RAC P11 — Evaluation panel.
 *
 * Drives `agentStudio.racEvaluation.previewRetrieval` for a query and
 * exposes the assembled chunks. An optional "Score against output"
 * field invokes `runGroundednessCheck` against the previewed chunks so
 * reviewers can sanity-check groundedness before persisting a trace.
 *
 * The endpoint lives behind `protectedProcedure`; cross-workspace
 * isolation is enforced server-side (P8 router).
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Search, Calculator } from "lucide-react";
import { SectionLabel } from "./ui";

interface Props {
  workspaceId: number;
  agentId: number;
  agentDraftId: number;
}

interface PreviewChunk {
  content: string;
  score: number;
  citation: string;
  sourceChunkId: string;
}

export default function RacEvaluationPanel({
  workspaceId,
  agentId,
  agentDraftId,
}: Props) {
  const [query, setQuery] = useState("");
  const [output, setOutput] = useState("");
  const [profileKey, setProfileKey] = useState("");
  const previewQuery = trpc.agentStudio.racEvaluation.previewRetrieval.useQuery(
    {
      workspaceId,
      agentId,
      agentDraftId,
      query,
      mode: "safe_degraded",
      ...(profileKey ? { profileKey } : {}),
    },
    { enabled: false },
  );
  // We use refetch so previewQuery only fires on click.
  const refetchPreview = previewQuery.refetch;

  const groundednessMut =
    trpc.agentStudio.racEvaluation.runGroundednessCheck.useMutation({
      onError: (e) => toast.error(e.message),
    });

  const chunks: PreviewChunk[] =
    ((previewQuery.data as { chunks?: PreviewChunk[] } | undefined)?.chunks ?? []);
  const trace = (previewQuery.data as { trace?: any } | undefined)?.trace;
  const warnings = (previewQuery.data as { warnings?: string[] } | undefined)?.warnings ??
    [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Preview retrieval</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label className="text-xs">Query</Label>
              <Textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                rows={2}
                className="text-xs"
                placeholder="What does this agent know about …?"
              />
            </div>
            <div>
              <Label className="text-xs">Profile key (optional)</Label>
              <Input
                value={profileKey}
                onChange={(e) => setProfileKey(e.target.value)}
                className="h-8 text-xs"
                placeholder="default"
              />
            </div>
          </div>
          <Button
            size="sm"
            disabled={!query.trim() || previewQuery.isFetching}
            onClick={() => refetchPreview()}
          >
            {previewQuery.isFetching ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Search className="h-3 w-3 mr-1" />
            )}
            Run preview
          </Button>
          {previewQuery.isError && (
            <p className="text-xs text-red-400 break-words">
              Preview failed:{" "}
              {(previewQuery.error as { message?: string } | null)?.message ??
                "unknown"}
            </p>
          )}
          {warnings.length > 0 && (
            <div className="text-[10px] text-amber-400">
              warnings: {warnings.join(", ")}
            </div>
          )}
          {trace && (
            <div className="text-[10px] text-muted-foreground">
              chunks returned/filtered/included:{" "}
              {trace.chunksReturned ?? "?"} / {trace.chunksFiltered ?? "?"} /{" "}
              {trace.chunksIncluded ?? "?"} · latency{" "}
              {trace.retrievalLatencyMs ?? "?"}ms · mode {trace.mode}
            </div>
          )}
          {chunks.length > 0 && (
            <ul className="space-y-1 max-h-[40vh] overflow-y-auto pr-1">
              {chunks.map((c, i) => (
                <li
                  key={`${c.sourceChunkId}-${i}`}
                  className="border-b border-border/40 py-1"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      score {c.score.toFixed(3)}
                    </Badge>
                    <span className="text-xs text-muted-foreground truncate">
                      {c.citation || c.sourceChunkId}
                    </span>
                  </div>
                  <p className="text-xs whitespace-pre-wrap break-words">
                    {c.content}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Score model output against previewed chunks</SectionLabel>
          <Textarea
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            rows={3}
            className="text-xs"
            placeholder="Paste a candidate model response to score for groundedness."
          />
          <Button
            size="sm"
            disabled={
              !output.trim() ||
              chunks.length === 0 ||
              !trace?.id ||
              groundednessMut.isPending
            }
            onClick={() => {
              if (!trace?.id) return;
              groundednessMut.mutate({
                workspaceId,
                traceId: trace.id,
                modelOutput: output,
                chunks: chunks.map((c) => ({
                  content: c.content,
                  citation: c.citation,
                  sourceChunkId: c.sourceChunkId,
                  score: c.score,
                })),
              });
            }}
          >
            {groundednessMut.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Calculator className="h-3 w-3 mr-1" />
            )}
            Run groundedness
          </Button>
          {groundednessMut.data && (
            <div className="text-xs space-y-1">
              <div>
                groundedness:{" "}
                <Badge variant="outline">
                  {(groundednessMut.data as any).score?.toFixed?.(3) ?? "?"}
                </Badge>
              </div>
              {(groundednessMut.data as any).warnings?.length > 0 && (
                <div className="text-[10px] text-amber-400">
                  warnings: {(groundednessMut.data as any).warnings.join(", ")}
                </div>
              )}
            </div>
          )}
          {!trace?.id && (
            <p className="text-[10px] text-muted-foreground">
              Run a preview first — the groundedness scorer needs a persisted
              traceId to attach the result to.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
