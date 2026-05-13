// ChatDiagnosticsPanel — inline chat session diagnostics surface.
//
// Phase 11b-3 RESIDUAL SLIVER (per the 2026-05-13 re-evaluation in
// `docs/implementation/runtime-hardening-v3-phase-11b-3-deferral.md`).
//
// The other 4 Phase 11b-3 surfaces (Runtime page, RAC page, Governance
// page, trace detail) were superseded by shipped Phase 14 + Phase 22 +
// Phase 24 work. This one — the inline chat-side diagnostics panel —
// had no successor and was the only remaining piece.
//
// Reads the Phase 11a observability columns on `agsRuntimeRuns`:
//   - sseFirstTokenMs    — perceived latency (time-to-first-byte)
//   - sseDurationMs      — full SSE stream duration
//   - errorReason        — terminal error (if any)
//   - clientDisconnected — boolean: did the client cut the stream?
//   - idempotencyConflicts — count of duplicate-submit attempts
//
// Renders inline next to the chat session so operators can debug
// session-specific issues without leaving the chat surface. The
// cross-run Runtime Page lens (Phase 14 + Phase 24) covers the
// aggregate trace-store perspective; this panel covers the inline
// session-debug perspective.
//
// Status: FULLY IMPLEMENTED for the residual Phase 11b-3 sliver
// (per the strict audit). Closes Item 4 of the closure mission.

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface ChatDiagnosticsPanelProps {
  /** Runtime run id for the most recent chat exchange in this session. */
  readonly runtimeRunId: number;
}

function formatMs(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

function StatusBadge({
  errorReason,
  clientDisconnected,
}: {
  errorReason: string | null | undefined;
  clientDisconnected: boolean | null | undefined;
}) {
  if (errorReason) {
    return <Badge variant="destructive">error</Badge>;
  }
  if (clientDisconnected) {
    return <Badge variant="secondary">disconnected</Badge>;
  }
  return <Badge>completed</Badge>;
}

export function ChatDiagnosticsPanel({ runtimeRunId }: ChatDiagnosticsPanelProps) {
  const q = trpc.agentStudio.runs.getDetail.useQuery(
    { runId: runtimeRunId },
    { refetchInterval: 10_000 },
  );

  if (q.isLoading) {
    return (
      <Card>
        <CardContent className="p-3 text-xs text-zinc-400">
          Loading chat diagnostics…
        </CardContent>
      </Card>
    );
  }

  if (q.isError) {
    return (
      <Card>
        <CardContent className="p-3 text-xs text-red-400">
          Failed to load chat diagnostics:{" "}
          {(q.error as { message?: string })?.message ?? "unknown"}
        </CardContent>
      </Card>
    );
  }

  const run = q.data?.run as
    | {
        sseFirstTokenMs?: number | null;
        sseDurationMs?: number | null;
        errorReason?: string | null;
        clientDisconnected?: boolean | null;
        idempotencyConflicts?: number | null;
        status?: string;
        durationMs?: number | null;
      }
    | undefined;

  if (!run) {
    return (
      <Card>
        <CardContent className="p-3 text-xs text-zinc-400">
          No runtime run row yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-zinc-400">
            Chat diagnostics — run {runtimeRunId}
          </div>
          <StatusBadge
            errorReason={run.errorReason}
            clientDisconnected={run.clientDisconnected}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded border border-zinc-800 p-2">
            <div className="text-zinc-400 uppercase">SSE first token</div>
            <div className="text-base font-semibold">
              {formatMs(run.sseFirstTokenMs)}
            </div>
          </div>
          <div className="rounded border border-zinc-800 p-2">
            <div className="text-zinc-400 uppercase">SSE duration</div>
            <div className="text-base font-semibold">
              {formatMs(run.sseDurationMs)}
            </div>
          </div>
          <div className="rounded border border-zinc-800 p-2">
            <div className="text-zinc-400 uppercase">idempotency conflicts</div>
            <div className="text-base font-semibold">
              {run.idempotencyConflicts ?? 0}
            </div>
          </div>
          <div className="rounded border border-zinc-800 p-2">
            <div className="text-zinc-400 uppercase">total duration</div>
            <div className="text-base font-semibold">
              {formatMs(run.durationMs)}
            </div>
          </div>
        </div>

        {run.errorReason ? (
          <div className="rounded border border-red-900 bg-red-950/40 p-2 text-xs text-red-300">
            <div className="uppercase tracking-wide mb-1">error reason</div>
            {run.errorReason}
          </div>
        ) : null}

        {run.clientDisconnected ? (
          <div className="rounded border border-amber-900 bg-amber-950/40 p-2 text-xs text-amber-200">
            Client disconnected before the stream finished.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default ChatDiagnosticsPanel;
