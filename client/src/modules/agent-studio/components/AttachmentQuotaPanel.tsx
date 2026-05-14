// AttachmentQuotaPanel — V1+ Phase 15-δ third UI surface (PR-V1-65).
//
// Renders the per-vault attachment storage quota, backed by the new
// `agentStudio.vault.getAttachmentQuota` tRPC procedure shipped in
// #815. Mirrors the AttachmentListPanel (#796) /
// CanvasProjectionEventsDrainStatusPanel (#814) pattern: a single-
// responsibility extracted component with explicit query-state
// branches, no business logic in the view.
//
// Branches:
//   - loading            → "Loading quota…"
//   - error              → red "Failed to load quota: …"
//   - null bytesLimit    → muted "No quota limit configured"
//   - overQuota=true     → destructive over-quota row
//   - utilization > 0.8  → amber approaching-quota warning
//   - utilization ≤ 0.8  → standard under-quota row
//
// The displayed "X% used" / "Y bytes / Z bytes" is the same threshold
// the #771 attachment-quota-guard enforces at createAttachment time —
// the router threads `resolveDefaultAttachmentBytesLimit()` so the
// panel can never drift from the write-gate.

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { SectionLabel } from "./ui";

export interface AttachmentQuotaPanelProps {
  readonly vaultId: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

function formatPercent(utilization: number): string {
  return `${(utilization * 100).toFixed(1)}%`;
}

export function AttachmentQuotaPanel({ vaultId }: AttachmentQuotaPanelProps) {
  const quotaQuery = trpc.agentStudio.vault.getAttachmentQuota.useQuery(
    { vaultId },
    { refetchOnWindowFocus: false },
  );

  const isLoading = quotaQuery.isLoading;
  const error = quotaQuery.error;
  const quota = quotaQuery.data;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Attachment storage quota</SectionLabel>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading quota…</p>
        ) : error ? (
          <p className="text-sm text-destructive">
            Failed to load quota: {error.message}
          </p>
        ) : quota == null ? (
          <p className="text-sm text-muted-foreground">No quota data.</p>
        ) : quota.bytesLimit == null ? (
          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground" data-testid="quota-no-limit">
              No quota limit configured.
            </p>
            <p>
              <span className="font-medium">Used:</span>{" "}
              {formatBytes(quota.bytesUsed)} across {quota.attachmentCount}{" "}
              attachment{quota.attachmentCount === 1 ? "" : "s"}
            </p>
          </div>
        ) : quota.overQuota ? (
          <div
            className="space-y-1 text-sm text-destructive"
            data-testid="quota-over"
          >
            <p>
              <span className="font-medium">Over quota:</span>{" "}
              {formatBytes(quota.bytesUsed)} /{" "}
              {formatBytes(quota.bytesLimit)}
              {quota.utilization !== null
                ? ` (${formatPercent(quota.utilization)})`
                : ""}
            </p>
            <p>
              {quota.attachmentCount} attachment
              {quota.attachmentCount === 1 ? "" : "s"} — new uploads will be
              rejected.
            </p>
          </div>
        ) : quota.utilization !== null && quota.utilization > 0.8 ? (
          <div
            className="space-y-1 text-sm text-amber-600"
            data-testid="quota-approaching"
          >
            <p>
              <span className="font-medium">Approaching quota:</span>{" "}
              {formatBytes(quota.bytesUsed)} /{" "}
              {formatBytes(quota.bytesLimit)} ({formatPercent(quota.utilization)})
            </p>
            <p>
              {quota.attachmentCount} attachment
              {quota.attachmentCount === 1 ? "" : "s"}
            </p>
          </div>
        ) : (
          <div className="space-y-1 text-sm" data-testid="quota-under">
            <p>
              <span className="font-medium">Used:</span>{" "}
              {formatBytes(quota.bytesUsed)} /{" "}
              {formatBytes(quota.bytesLimit)}
              {quota.utilization !== null
                ? ` (${formatPercent(quota.utilization)})`
                : ""}
            </p>
            <p className="text-muted-foreground">
              {quota.attachmentCount} attachment
              {quota.attachmentCount === 1 ? "" : "s"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
