// SavedViewVersionHistoryPanel — V1+ Phase 16-δ first UI surface.
//
// Renders the immutable version history of a saved view, backed by
// the tRPC procedure `agentStudio.vault.listSavedViewVersions`
// shipped in PR-V1-19 (#770). One panel per `savedViewId` prop;
// caller embeds it wherever a saved-view detail surface needs the
// history affordance.
//
// No-deferral continuation-11 slice 66: added per-row Restore
// button calling `vault.restoreSavedViewVersion` (mutation shipped
// in slice 50 / continuation-6 but never had a UI consumer until
// now). The restore composes through the server's `updateSavedView`,
// which itself captures a snapshot of the current state BEFORE
// applying — so an accidental restore can itself be rolled back by
// restoring the version row the restore just produced.
//
// Why a focused extracted component (per the playbook's "Avoid large
// RetrofitPage-style growth"): keeps the surface small, testable,
// and reusable. The retention panel arc (#735..#737, PR-AT-3..AT-8)
// is the reference for this pattern — single-responsibility cards
// with their own data fetch + test file.

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "./ui";
import { formatRelative } from "./format-relative";

export interface SavedViewVersionHistoryPanelProps {
  readonly savedViewId: number;
}

export function SavedViewVersionHistoryPanel({
  savedViewId,
}: SavedViewVersionHistoryPanelProps) {
  const versionsQuery =
    trpc.agentStudio.vault.listSavedViewVersions.useQuery(
      { savedViewId },
      { refetchOnWindowFocus: false },
    );
  const utils = trpc.useUtils();
  const [pendingVersionId, setPendingVersionId] = useState<number | null>(
    null,
  );

  const restoreMut =
    trpc.agentStudio.vault.restoreSavedViewVersion.useMutation({
      onSuccess: () => {
        toast.success("Saved view restored");
        // Re-fetch the version history (the restore created a new
        // snapshot row of the PRE-restore state) AND the visible
        // saved-views list (the live row's content + version number
        // changed). The visible-list refetch covers any sibling
        // pages still showing this saved view's stale content.
        void utils.agentStudio.vault.listSavedViewVersions.invalidate({
          savedViewId,
        });
        void utils.agentStudio.vault.listVisibleSavedViews.invalidate();
        setPendingVersionId(null);
      },
      onError: (err) => {
        toast.error(`Restore failed: ${err.message ?? "unknown"}`);
        setPendingVersionId(null);
      },
    });

  const handleRestore = (versionId: number, label: string) => {
    const ok = window.confirm(
      `Restore this saved view to "${label}"? The current content will be captured as a new version row before the restore is applied, so this is reversible.`,
    );
    if (!ok) return;
    setPendingVersionId(versionId);
    restoreMut.mutate({ versionId });
  };

  const isLoading = versionsQuery.isLoading;
  const error = versionsQuery.error;
  const rows = versionsQuery.data ?? [];

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Version history</SectionLabel>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading versions…</p>
        ) : error ? (
          <p className="text-sm text-destructive">
            Failed to load history: {error.message}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No prior versions captured for this saved view.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((v) => {
              const rowLabel = `v${v.version} — ${v.name}`;
              const isThisRestoring =
                restoreMut.isPending && pendingVersionId === v.id;
              return (
                <li
                  key={v.id}
                  className="rounded border bg-muted/30 p-2 text-sm"
                  data-testid="saved-view-version-row"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{rowLabel}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {formatRelative(v.capturedAt)}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={restoreMut.isPending}
                        onClick={() => handleRestore(v.id, rowLabel)}
                        data-testid="saved-view-version-restore-button"
                      >
                        {isThisRestoring ? "Restoring…" : "Restore"}
                      </Button>
                    </div>
                  </div>
                  {v.capturedByUserId != null && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Captured by user #{v.capturedByUserId}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
