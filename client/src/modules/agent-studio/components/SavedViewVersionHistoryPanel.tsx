// SavedViewVersionHistoryPanel — V1+ Phase 16-δ first UI surface.
//
// Renders the immutable version history of a saved view, backed by
// the tRPC procedure `agentStudio.vault.listSavedViewVersions`
// shipped in PR-V1-19 (#770). One panel per `savedViewId` prop;
// caller embeds it wherever a saved-view detail surface needs the
// history affordance.
//
// Why a focused extracted component (per the playbook's "Avoid large
// RetrofitPage-style growth"): keeps the surface small, testable,
// and reusable. The retention panel arc (#735..#737, PR-AT-3..AT-8)
// is the reference for this pattern — single-responsibility cards
// with their own data fetch + test file.

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
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
            {rows.map((v) => (
              <li
                key={v.id}
                className="rounded border bg-muted/30 p-2 text-sm"
                data-testid="saved-view-version-row"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    v{v.version} — {v.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatRelative(v.capturedAt)}
                  </span>
                </div>
                {v.capturedByUserId != null && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Captured by user #{v.capturedByUserId}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
