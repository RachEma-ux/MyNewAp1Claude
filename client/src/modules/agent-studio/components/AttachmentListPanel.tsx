// AttachmentListPanel — V1+ Phase 15-δ second UI surface.
//
// Renders the attachment list for a vault (or a single note within a
// vault), backed by the existing `agentStudio.vault.listAttachments`
// tRPC procedure. Mirrors the SavedViewVersionHistoryPanel pattern
// (#795) — single-responsibility extracted component with 4 branches
// (loading / error / empty / populated).
//
// The browse-by-vault and browse-by-note views use the SAME panel —
// the caller passes either `vaultId` or `noteId` (or both). The
// router enforces "vaultId OR noteId required".

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { SectionLabel } from "./ui";
import { formatRelative } from "./format-relative";

export interface AttachmentListPanelProps {
  readonly vaultId?: number;
  readonly noteId?: number;
  /** Optional cap (router enforces 1..500). Default: render whatever
   *  the server returns. */
  readonly limit?: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

export function AttachmentListPanel({
  vaultId,
  noteId,
  limit,
}: AttachmentListPanelProps) {
  if (vaultId == null && noteId == null) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-destructive">
          AttachmentListPanel requires either <code>vaultId</code> or{" "}
          <code>noteId</code>.
        </CardContent>
      </Card>
    );
  }

  const attachmentsQuery = trpc.agentStudio.vault.listAttachments.useQuery(
    { vaultId, noteId, limit },
    { refetchOnWindowFocus: false },
  );

  const isLoading = attachmentsQuery.isLoading;
  const error = attachmentsQuery.error;
  const rows = attachmentsQuery.data ?? [];

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Attachments</SectionLabel>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading attachments…</p>
        ) : error ? (
          <p className="text-sm text-destructive">
            Failed to load attachments: {error.message}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No attachments.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((a) => (
              <li
                key={a.id}
                className="rounded border bg-muted/30 p-2 text-sm"
                data-testid="attachment-row"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium" title={a.filename}>
                    {a.filename}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatBytes(a.sizeBytes)} · {formatRelative(a.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {a.mimeType}
                  {a.isSourceArtifact && (
                    <>
                      {" · "}
                      <span
                        data-testid="attachment-source-artifact-badge"
                        className="rounded bg-amber-200/40 px-1"
                      >
                        source artifact
                      </span>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
