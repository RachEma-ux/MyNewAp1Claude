/**
 * Approval Bus Admin panel — PR-V1-184.
 *
 * Operator surface for the cross-process approval-decided pubsub
 * (D-RESUME-5 closure, #916). Shows:
 *   - LISTEN connection state + last event metadata.
 *   - Lifetime counters (messages, malformed, reconnect attempts).
 *   - Force-reconnect button for when status shows
 *     `subscribed=true && connectedAt=null` (LISTEN failed at boot
 *     or backoff is stuck at 60s cap) and the operator wants the
 *     next attempt now.
 *
 * Pattern mirrors the pubsub-status card on RegionAdminPanel
 * (PR-V1-167) + the forceRewarm pattern (PR-V1-176).
 */

import { useState } from "react";

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { SectionLabel } from "./ui";

function fmtTs(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").replace(/\..+$/, "Z");
}

export function ApprovalBusAdminPanel() {
  const utils = trpc.useUtils();
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    reconnected: boolean;
    reason?: string;
    reconnectAttempts: number;
  } | null>(null);

  const statusQ =
    trpc.agentStudio.approvalBus.getPubsubStatus.useQuery(undefined, {
      refetchOnWindowFocus: false,
    });

  const forceReconnect =
    trpc.agentStudio.approvalBus.forceReconnect.useMutation({
      onSuccess: (data) => {
        setMutationError(null);
        setLastResult(data);
        void utils.agentStudio.approvalBus.getPubsubStatus.invalidate();
      },
      onError: (err) => {
        setMutationError(err.message);
      },
    });

  const status = statusQ.data;
  const stale = status?.subscribed === true && status?.connectedAt == null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>
            Cross-process pubsub — `ags_approval_decided`
          </SectionLabel>
          {statusQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading status…</p>
          ) : statusQ.error ? (
            <p className="text-sm text-destructive">
              Failed to load status: {statusQ.error.message}
            </p>
          ) : status ? (
            <div
              className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm"
              data-testid="approval-bus-status-grid"
            >
              <div>
                <span className="font-medium">subscribed:</span>{" "}
                <span className="font-mono">{String(status.subscribed)}</span>
              </div>
              <div>
                <span className="font-medium">connectedAt:</span>{" "}
                <span
                  className={`font-mono ${stale ? "text-destructive" : ""}`}
                >
                  {fmtTs(status.connectedAt)}
                </span>
              </div>
              <div>
                <span className="font-medium">lastMessageAt:</span>{" "}
                <span className="font-mono">
                  {fmtTs(status.lastMessageAt)}
                </span>
              </div>
              <div>
                <span className="font-medium">lastApprovalRequestId:</span>{" "}
                <span className="font-mono">
                  {status.lastApprovalRequestId ?? "—"}
                </span>
              </div>
              <div>
                <span className="font-medium">messagesReceived:</span>{" "}
                <span className="font-mono">{status.messagesReceived}</span>
              </div>
              <div>
                <span className="font-medium">malformedReceived:</span>{" "}
                <span
                  className={`font-mono ${status.malformedReceived > 0 ? "text-destructive" : ""}`}
                >
                  {status.malformedReceived}
                </span>
              </div>
              <div>
                <span className="font-medium">reconnectAttempts:</span>{" "}
                <span className="font-mono">{status.reconnectAttempts}</span>
              </div>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              data-testid="approval-bus-force-reconnect"
              disabled={forceReconnect.isPending}
              onClick={() => forceReconnect.mutate()}
            >
              {forceReconnect.isPending
                ? "Reconnecting…"
                : "Force reconnect now"}
            </Button>
            {mutationError ? (
              <span className="text-sm text-destructive">{mutationError}</span>
            ) : null}
            {lastResult ? (
              <span
                className="text-xs text-muted-foreground"
                data-testid="approval-bus-force-reconnect-feedback"
              >
                {lastResult.reconnected
                  ? `Reconnect kicked (attempts=${lastResult.reconnectAttempts})`
                  : `No-op — ${lastResult.reason ?? "unknown"} (attempts=${lastResult.reconnectAttempts})`}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
