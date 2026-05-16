/**
 * Inbox panel — T-F.107 (T-F.6-α).
 *
 * First operator surface for the personal workspace inbox
 * (`ags_workspace_user_notifications`). Reads
 * `trpc.agentStudio.workspaceObservability.getMyInbox` — a server
 * surface that has been live (with `listMyNotifications`,
 * `getMyInbox` composite, mark-read / dismiss mutations, by-kind
 * filters and bulk-by-kind operations) since the workspace-obs
 * router shipped, but had **zero client consumers**.
 *
 * Precedent (o)-discriminator territory opener per lesson 62:
 * `notificationKind` is a free-form `varchar(100)` column populated
 * by code without a typed-enum constraint. The α-shell renders the
 * `byKind` breakdown card so operators can SEE the live taxonomy
 * the workspace has been writing — the closed list is whatever has
 * actually been emitted, no schema decision needed.
 *
 * α-shell ships read-only — markRead / dismiss mutations land in
 * β/γ slices. Honest banner names the deferred capabilities inline
 * (lesson 68 pattern) so operators know which actions exist on the
 * server but aren't yet wired into the UI.
 */

import { useMemo } from "react";
import { trpc } from "@/lib/trpc";

const INBOX_LIMIT = 50;

export function InboxPanel() {
  const inboxQuery = trpc.agentStudio.workspaceObservability.getMyInbox.useQuery(
    { limit: INBOX_LIMIT },
    { staleTime: 15_000 },
  );

  const notifications = inboxQuery.data?.notifications ?? [];
  const unreadCount = inboxQuery.data?.unreadCount ?? {
    total: 0,
    byKind: {} as Record<string, number>,
  };

  const byKindEntries = useMemo(() => {
    return Object.entries(unreadCount.byKind).sort((a, b) => b[1] - a[1]);
  }, [unreadCount.byKind]);

  if (inboxQuery.isLoading) {
    return (
      <div className="text-sm text-muted-foreground" data-testid="inbox-loading">
        Loading inbox…
      </div>
    );
  }

  if (inboxQuery.error) {
    return (
      <div className="text-sm text-destructive" data-testid="inbox-error">
        Failed to load inbox: {inboxQuery.error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="inbox-panel">
      <div
        className="rounded border bg-muted/30 p-3 text-xs text-muted-foreground"
        data-testid="inbox-banner"
      >
        <div>
          <span className="font-medium text-foreground">Inbox α-shell:</span>{" "}
          read-only first surface for personal workspace notifications. The
          server already supports mark-read, dismiss, and bulk-by-kind actions —
          those land in follow-up slices.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div
          className="rounded border p-3"
          data-testid="inbox-unread-total-card"
        >
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Unread total
          </div>
          <div
            className="mt-1 text-2xl font-semibold"
            data-testid="inbox-unread-total"
          >
            {unreadCount.total}
          </div>
        </div>

        <div
          className="rounded border p-3"
          data-testid="inbox-by-kind-card"
        >
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Unread by notification kind
          </div>
          {byKindEntries.length === 0 ? (
            <div
              className="mt-1 text-sm text-muted-foreground"
              data-testid="inbox-by-kind-empty"
            >
              No unread notifications.
            </div>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {byKindEntries.map(([kind, n]) => (
                <li
                  key={kind}
                  className="flex items-baseline justify-between gap-2 text-sm"
                  data-testid={`inbox-by-kind-row-${kind}`}
                >
                  <span className="truncate font-mono text-xs">{kind}</span>
                  <span className="tabular-nums">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded border" data-testid="inbox-list-card">
        <div className="border-b px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">
          Recent notifications (up to {INBOX_LIMIT})
        </div>
        {notifications.length === 0 ? (
          <div
            className="px-3 py-4 text-sm text-muted-foreground"
            data-testid="inbox-list-empty"
          >
            No notifications.
          </div>
        ) : (
          <ul className="divide-y">
            {notifications.map((n) => (
              <li
                key={n.id}
                className="flex items-start gap-3 px-3 py-2"
                data-testid={`inbox-row-${n.id}`}
              >
                <span
                  className={
                    n.read
                      ? "mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40"
                      : "mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-primary"
                  }
                  data-testid={`inbox-row-read-indicator-${n.id}`}
                  aria-label={n.read ? "read" : "unread"}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className="truncate font-mono text-xs"
                      data-testid={`inbox-row-kind-${n.id}`}
                    >
                      {n.notificationKind}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {new Date(n.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {n.payload ? (
                    <pre
                      className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/30 p-2 text-xs"
                      data-testid={`inbox-row-payload-${n.id}`}
                    >
                      {JSON.stringify(n.payload, null, 2)}
                    </pre>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
