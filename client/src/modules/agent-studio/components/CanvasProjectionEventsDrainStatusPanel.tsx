// CanvasProjectionEventsDrainStatusPanel — V1+ Phase 17-γ
// operator observability panel (PR-V1-63).
//
// Renders the 17-γ drain scheduler status, backed by the tRPC
// procedure `agentStudio.canvasProjectionEventsDrain.getDrainStatus`
// shipped in PR-V1-62 (#813). Pattern mirrors #795
// `SavedViewVersionHistoryPanel` + #796 `AttachmentListPanel`:
// small focused extracted component with its own data fetch +
// test file.

import { useState } from "react";

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { SectionLabel } from "./ui";
import { formatRelative } from "./format-relative";

export function CanvasProjectionEventsDrainStatusPanel() {
  const utils = trpc.useUtils();
  const [forceTickFeedback, setForceTickFeedback] = useState<string | null>(
    null,
  );
  const forceTickMutation =
    trpc.agentStudio.canvasProjectionEventsDrain.forceTick.useMutation({
      onSuccess: (data) => {
        if (data.ran) {
          setForceTickFeedback(
            data.result == null
              ? "Tick ran (no aggregate returned)."
              : `Tick ran — processed ${data.result.totalProcessed} events across ${data.result.workspacesScanned} workspace${data.result.workspacesScanned === 1 ? "" : "s"}.`,
          );
        } else {
          setForceTickFeedback(`Tick skipped: ${data.reason}.`);
        }
        void utils.agentStudio.canvasProjectionEventsDrain.getDrainStatus.invalidate();
      },
      onError: (err) => setForceTickFeedback(`Force-tick failed: ${err.message}`),
    });

  const statusQuery =
    trpc.agentStudio.canvasProjectionEventsDrain.getDrainStatus.useQuery(
      undefined,
      { refetchOnWindowFocus: false },
    );

  const isLoading = statusQuery.isLoading;
  const error = statusQuery.error;
  const status = statusQuery.data;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Canvas projection events drain</SectionLabel>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">
            Loading drain status…
          </p>
        ) : error ? (
          <p className="text-sm text-destructive">
            Failed to load drain status: {error.message}
          </p>
        ) : status == null ? (
          <p className="text-sm text-muted-foreground">
            No drain status available.
          </p>
        ) : status.ticksRun === 0 ? (
          <p className="text-sm text-muted-foreground">
            Scheduler not yet ticked
            {" "}
            (cursorMapSize={status.cursorMapSize}).
          </p>
        ) : (
          <div className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Ticks run:</span>{" "}
              {status.ticksRun}
            </p>
            <p>
              <span className="font-medium">Workspaces tracked:</span>{" "}
              {status.cursorMapSize}
            </p>
            {status.lastTickResult != null && (
              <p data-testid="drain-last-tick-result">
                <span className="font-medium">
                  Last tick processed:
                </span>{" "}
                {status.lastTickResult.totalProcessed} events across{" "}
                {status.lastTickResult.workspacesScanned} workspace
                {status.lastTickResult.workspacesScanned === 1 ? "" : "s"}
                {status.lastTickResult.totalFailed > 0
                  ? ` (${status.lastTickResult.totalFailed} failed)`
                  : ""}
              </p>
            )}
            {status.lastTickError != null && (
              <p
                className="text-destructive"
                data-testid="drain-last-tick-error"
              >
                <span className="font-medium">Last tick error:</span>{" "}
                {status.lastTickError.message} (
                {formatRelative(status.lastTickError.at)})
              </p>
            )}
            {status.lastTickResult?.anyHitMaxBatches && (
              <p
                className="text-amber-600"
                data-testid="drain-hit-max-batches"
              >
                One or more workspaces hit the per-tick batch ceiling —
                more work likely remains.
              </p>
            )}
          </div>
        )}
        {/* PR-V1-175: operator-triggered manual tick. */}
        <div className="flex items-center gap-2 pt-2 border-t">
          <button
            type="button"
            className="text-sm underline"
            disabled={forceTickMutation.isPending}
            onClick={() => forceTickMutation.mutate()}
            data-testid="drain-force-tick-button"
          >
            {forceTickMutation.isPending ? "Ticking…" : "Force tick now"}
          </button>
          {forceTickFeedback ? (
            <span
              className="text-xs text-muted-foreground"
              data-testid="drain-force-tick-feedback"
            >
              {forceTickFeedback}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
