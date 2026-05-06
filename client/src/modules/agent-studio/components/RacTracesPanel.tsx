/**
 * RAC P11 — Trace lookup + feedback panel.
 *
 * Looks up a trace by `traceId` or `messageId` (`agentStudio.racTrace.getTrace`)
 * and surfaces the metric envelope, included context blocks, and any
 * persisted thumbs feedback. New feedback writes through
 * `racTrace.submitFeedback`.
 *
 * No list endpoint exists yet (P7 keeps the surface narrow); reviewers
 * pivot here from a chat message link or from the feedback ID column
 * in the runs page.
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
import { Loader2, Search, ThumbsUp, ThumbsDown } from "lucide-react";
import { SectionLabel } from "./ui";

interface Props {
  workspaceId: number;
  agentId: number;
}

export default function RacTracesPanel({ workspaceId, agentId }: Props) {
  const [traceIdInput, setTraceIdInput] = useState("");
  const [messageIdInput, setMessageIdInput] = useState("");
  const [feedbackNote, setFeedbackNote] = useState("");

  const traceId = traceIdInput.trim() ? Number(traceIdInput) : undefined;
  const messageId = messageIdInput.trim() ? Number(messageIdInput) : undefined;

  const enabled =
    (typeof traceId === "number" && Number.isFinite(traceId) && traceId > 0) ||
    (typeof messageId === "number" && Number.isFinite(messageId) && messageId > 0);

  const traceQuery = trpc.agentStudio.racTrace.getTrace.useQuery(
    {
      workspaceId,
      ...(traceId ? { traceId } : {}),
      ...(messageId ? { messageId } : {}),
    },
    { enabled, retry: false },
  );

  const utils = trpc.useUtils();
  const feedbackMut = trpc.agentStudio.racTrace.submitFeedback.useMutation({
    onSuccess: () => {
      toast.success("Feedback recorded");
      void utils.agentStudio.racTrace.getTrace.invalidate();
      setFeedbackNote("");
    },
    onError: (e) => toast.error(e.message),
  });

  const data = traceQuery.data as
    | {
        trace?: any;
        blocks?: Array<{
          orderIdx: number;
          score: number;
          citation?: string | null;
          sourceChunkId?: string | null;
          metadataJson?: Record<string, unknown> | null;
        }>;
        feedback?: { verdict?: string; note?: string | null } | null;
      }
    | undefined;
  const trace = data?.trace;
  const blocks = data?.blocks ?? [];
  const persistedFeedback = data?.feedback ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-2">
          <SectionLabel>Look up a trace</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">traceId</Label>
              <Input
                value={traceIdInput}
                onChange={(e) => {
                  setTraceIdInput(e.target.value);
                  if (e.target.value) setMessageIdInput("");
                }}
                placeholder="e.g. 42"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">…or messageId</Label>
              <Input
                value={messageIdInput}
                onChange={(e) => {
                  setMessageIdInput(e.target.value);
                  if (e.target.value) setTraceIdInput("");
                }}
                placeholder="e.g. 17"
                className="h-8 text-xs"
              />
            </div>
          </div>
          <Button
            size="sm"
            disabled={!enabled || traceQuery.isFetching}
            onClick={() => traceQuery.refetch()}
          >
            {traceQuery.isFetching ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Search className="h-3 w-3 mr-1" />
            )}
            Fetch
          </Button>
          {traceQuery.isError && (
            <p className="text-xs text-red-400">
              {(traceQuery.error as { message?: string } | null)?.message ?? "Not found"}
            </p>
          )}
        </CardContent>
      </Card>

      {trace && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <SectionLabel>Trace #{trace.id}</SectionLabel>
              <Badge variant="outline" className="text-[10px]">
                {trace.mode ?? "—"}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">latency:</span>{" "}
                {trace.retrievalLatencyMs ?? "?"}ms
              </div>
              <div>
                <span className="text-muted-foreground">tokens used:</span>{" "}
                {trace.tokenBudgetUsed ?? "?"}
                {trace.tokenBudgetTruncated ? " (truncated)" : ""}
              </div>
              <div>
                <span className="text-muted-foreground">chunks (returned/filtered/included):</span>{" "}
                {trace.chunksReturned ?? "?"} / {trace.chunksFiltered ?? "?"} /{" "}
                {trace.chunksIncluded ?? "?"}
              </div>
              <div>
                <span className="text-muted-foreground">citation coverage:</span>{" "}
                {trace.citationCoverage ?? "—"}
              </div>
              <div>
                <span className="text-muted-foreground">groundedness:</span>{" "}
                {trace.groundednessScore ?? "—"}
              </div>
              <div>
                <span className="text-muted-foreground">fallback:</span>{" "}
                {trace.fallbackReason ?? "—"}
              </div>
            </div>
            {blocks.length > 0 && (
              <div>
                <SectionLabel>Blocks ({blocks.length})</SectionLabel>
                <ul className="space-y-1 text-xs max-h-[40vh] overflow-y-auto pr-1">
                  {blocks.map((b) => (
                    <li
                      key={`${trace.id}-${b.orderIdx}`}
                      className="border-b border-border/40 py-1"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          #{b.orderIdx} · {b.score.toFixed(3)}
                        </Badge>
                        <span className="text-muted-foreground truncate">
                          {b.citation ?? b.sourceChunkId ?? "—"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {trace.messageId && (
              <div className="space-y-2 pt-2 border-t border-border/40">
                <SectionLabel>Feedback</SectionLabel>
                {persistedFeedback ? (
                  <div className="text-xs">
                    <Badge variant="outline" className="text-[10px]">
                      {persistedFeedback.verdict}
                    </Badge>{" "}
                    {persistedFeedback.note}
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground">
                    No feedback recorded for this messageId yet.
                  </p>
                )}
                <Textarea
                  value={feedbackNote}
                  onChange={(e) => setFeedbackNote(e.target.value)}
                  rows={2}
                  className="text-xs"
                  placeholder="Optional note for the next reviewer."
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={feedbackMut.isPending}
                    onClick={() =>
                      feedbackMut.mutate({
                        workspaceId,
                        agentId,
                        messageId: trace.messageId,
                        traceId: trace.id,
                        verdict: "thumbs_up",
                        note: feedbackNote || null,
                      })
                    }
                  >
                    <ThumbsUp className="h-3 w-3 mr-1" /> Up
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={feedbackMut.isPending}
                    onClick={() =>
                      feedbackMut.mutate({
                        workspaceId,
                        agentId,
                        messageId: trace.messageId,
                        traceId: trace.id,
                        verdict: "thumbs_down",
                        note: feedbackNote || null,
                      })
                    }
                  >
                    <ThumbsDown className="h-3 w-3 mr-1" /> Down
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
