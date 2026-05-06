/**
 * RAC Trace Drawer — Phase 7 MVP.
 *
 * Renders one chat message's RAC trace: the `RuntimeTraceMetrics`
 * summary, the per-source latency breakdown, the included context
 * blocks (citation + score + content hash), and a thumbs-up /
 * thumbs-down feedback control.
 *
 * Surface:
 *   - `<RacTraceDrawer workspaceId={...} messageId={...} agentId={...} />`
 *
 * The drawer is read-only on mount (calls `agentStudio.racTrace.getTrace`)
 * and writes feedback via `agentStudio.racTrace.submitFeedback`. Empty
 * state is "no trace recorded" — the chat path may not have written
 * one (e.g. mode=disabled, retrieval skipped, or ASDB unavailable).
 *
 * Styling: matches the existing AgentStudioOversightDrawer aesthetic
 * (small uppercase section headers, low-emphasis chips, scrollable
 * body). No new design tokens.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Activity,
  AlertTriangle,
  Database,
  ThumbsDown,
  ThumbsUp,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface RacTraceDrawerProps {
  workspaceId: number;
  agentId: number;
  /** Chat message id the trace was written under. */
  messageId: number;
}

function SectionHeader({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="mb-2 mt-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value == null ? "—" : value}</span>
    </div>
  );
}

export function RacTraceDrawer({
  workspaceId,
  agentId,
  messageId,
}: RacTraceDrawerProps) {
  const utils = trpc.useUtils();
  const traceQuery = trpc.agentStudio.racTrace.getTrace.useQuery({
    workspaceId,
    messageId,
  });
  const submit = trpc.agentStudio.racTrace.submitFeedback.useMutation({
    onSuccess: () => {
      utils.agentStudio.racTrace.getTrace.invalidate({ workspaceId, messageId });
    },
  });

  const [note, setNote] = useState("");

  if (traceQuery.isLoading) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        Loading RAC trace…
      </div>
    );
  }

  if (traceQuery.error || !traceQuery.data) {
    return (
      <div className="flex flex-col gap-2 px-4 py-6 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <AlertTriangle className="h-4 w-4" />
          No RAC trace recorded for this message.
        </div>
        <div className="text-xs text-muted-foreground">
          The chat path may have run with retrieval disabled, or trace
          persistence may have been unavailable. Open dev-server logs
          for the chat-stream/trace warning if applicable.
        </div>
      </div>
    );
  }

  const { trace, blocks, feedback } = traceQuery.data;

  return (
    <ScrollArea className="h-full">
      <div className="px-4 py-4">
        <SectionHeader icon={<Timer className="h-3 w-3" />} label="Summary" />
        <div className="space-y-1">
          <Stat label="mode" value={trace.mode} />
          <Stat
            label="retrieval"
            value={trace.retrievalEnabled ? "enabled" : "disabled"}
          />
          <Stat
            label="latency (ms)"
            value={trace.retrievalLatencyMs ?? null}
          />
          <Stat label="cag pack" value={trace.cagPackId ?? null} />
          <Stat label="cag version" value={trace.cagPackVersion ?? null} />
          <Stat label="fallback reason" value={trace.fallbackReason ?? null} />
        </div>

        <SectionHeader
          icon={<Activity className="h-3 w-3" />}
          label="Chunks"
        />
        <div className="space-y-1">
          <Stat label="returned" value={trace.chunksReturned} />
          <Stat label="filtered out" value={trace.chunksFiltered} />
          <Stat label="included" value={trace.chunksIncluded} />
          <Stat label="truncated by budget" value={trace.truncatedByBudget} />
        </div>

        {trace.perSourceLatencyJson &&
        Object.keys(trace.perSourceLatencyJson).length > 0 ? (
          <>
            <SectionHeader
              icon={<Database className="h-3 w-3" />}
              label="Per-source latency"
            />
            <div className="space-y-1 text-xs">
              {Object.entries(trace.perSourceLatencyJson).map(([sid, ms]) => (
                <Stat key={sid} label={`source ${sid}`} value={`${ms} ms`} />
              ))}
            </div>
          </>
        ) : null}

        {blocks.length > 0 ? (
          <>
            <SectionHeader
              icon={<Database className="h-3 w-3" />}
              label="Included blocks"
            />
            <div className="space-y-2">
              {blocks.map((b) => (
                <div
                  key={b.id}
                  className="rounded border border-border/40 bg-muted/30 p-2 text-xs"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      #{b.rank} · src {b.sourceId} ({b.sourceType})
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      score {b.score.toFixed(3)}
                    </span>
                  </div>
                  {b.citation ? (
                    <div className="mb-1 truncate font-medium">
                      {b.citation}
                    </div>
                  ) : null}
                  <div className="font-mono text-[10px] text-muted-foreground">
                    hash {b.contentHash.slice(0, 12)}…
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {Array.isArray(trace.warningsJson) && trace.warningsJson.length > 0 ? (
          <>
            <SectionHeader
              icon={<AlertTriangle className="h-3 w-3" />}
              label="Warnings"
            />
            <ul className="space-y-1 text-xs text-muted-foreground">
              {trace.warningsJson.map((w, i) => (
                <li key={i} className="font-mono">
                  {w}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <SectionHeader
          icon={<ThumbsUp className="h-3 w-3" />}
          label="Feedback"
        />
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={feedback?.verdict === "thumbs_up" ? "default" : "outline"}
              onClick={() =>
                submit.mutate({
                  workspaceId,
                  agentId,
                  messageId,
                  traceId: trace.id,
                  verdict: "thumbs_up",
                  note: note.trim() || null,
                })
              }
              disabled={submit.isPending}
            >
              <ThumbsUp className="mr-1 h-3 w-3" />
              Helpful
            </Button>
            <Button
              size="sm"
              variant={
                feedback?.verdict === "thumbs_down" ? "destructive" : "outline"
              }
              onClick={() =>
                submit.mutate({
                  workspaceId,
                  agentId,
                  messageId,
                  traceId: trace.id,
                  verdict: "thumbs_down",
                  note: note.trim() || null,
                })
              }
              disabled={submit.isPending}
            >
              <ThumbsDown className="mr-1 h-3 w-3" />
              Not helpful
            </Button>
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note (e.g. citation was wrong, missed context, etc.)"
            className={cn("min-h-[60px] text-xs")}
          />
          {feedback ? (
            <div className="text-[10px] text-muted-foreground">
              Last feedback: {feedback.verdict}
              {feedback.note ? ` — "${feedback.note}"` : ""}
            </div>
          ) : null}
        </div>
      </div>
    </ScrollArea>
  );
}
