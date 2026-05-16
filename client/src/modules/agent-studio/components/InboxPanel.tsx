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

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

const INBOX_LIMIT = 50;

export function InboxPanel() {
  const utils = trpc.useUtils();
  const inboxQuery = trpc.agentStudio.workspaceObservability.getMyInbox.useQuery(
    { limit: INBOX_LIMIT },
    { staleTime: 15_000 },
  );

  // ── T-F.108 (T-F.6-β): mark-read mutation ──
  // Per-row error scoping per lesson 67 (errorId companion slice):
  // multiple rows can fire the mutation in parallel, so a single
  // top-level error surface would conflate them.
  const [markReadError, setMarkReadError] = useState<string | null>(null);
  const [markReadErrorRowId, setMarkReadErrorRowId] = useState<number | null>(
    null,
  );

  const markReadMutation =
    trpc.agentStudio.workspaceObservability.markNotificationRead.useMutation({
      onSuccess: () => {
        // Invalidate the composite so unread total + by-kind + row list
        // all refresh together (lesson 58: onSuccess invalidate-list-AND-stats
        // — here both live on the same composite).
        utils.agentStudio.workspaceObservability.getMyInbox.invalidate();
        setMarkReadError(null);
        setMarkReadErrorRowId(null);
      },
      onError: (err, vars) => {
        setMarkReadError(err.message);
        setMarkReadErrorRowId(vars.notificationId);
      },
    });

  // ── T-F.109 (T-F.6-γ): dismiss mutation ──
  // Two-step confirm per lesson 64 — dismiss removes the row from
  // inbox; while the server reuses the same `read` infrastructure,
  // from the operator's POV the row vanishes. Recovery requires
  // pulling the underlying source surface (e.g. the approval bus)
  // — not single-click reversible per lesson 66.
  const [dismissConfirmRowId, setDismissConfirmRowId] = useState<number | null>(
    null,
  );
  const [dismissError, setDismissError] = useState<string | null>(null);
  const [dismissErrorRowId, setDismissErrorRowId] = useState<number | null>(
    null,
  );

  const dismissMutation =
    trpc.agentStudio.workspaceObservability.dismissNotifications.useMutation({
      onSuccess: () => {
        utils.agentStudio.workspaceObservability.getMyInbox.invalidate();
        setDismissError(null);
        setDismissErrorRowId(null);
        setDismissConfirmRowId(null);
      },
      onError: (err, vars) => {
        setDismissError(err.message);
        setDismissErrorRowId(vars.notificationIds[0] ?? null);
      },
    });

  function openDismissConfirm(id: number): void {
    setDismissConfirmRowId(id);
    setDismissError(null);
    setDismissErrorRowId(null);
  }
  function cancelDismissConfirm(): void {
    setDismissConfirmRowId(null);
  }

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
          <span className="font-medium text-foreground">Inbox γ:</span>{" "}
          mark-read + dismiss live (per-row). The server also supports
          mark-all-by-kind and dismiss-all-by-kind bulk actions — those land
          in follow-up slices.
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
                  {!n.read ? (
                    <div className="mt-1">
                      <button
                        type="button"
                        className="rounded border px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-50"
                        disabled={
                          markReadMutation.isPending &&
                          markReadMutation.variables?.notificationId === n.id
                        }
                        onClick={() => {
                          setMarkReadError(null);
                          setMarkReadErrorRowId(null);
                          markReadMutation.mutate({ notificationId: n.id });
                        }}
                        data-testid={`inbox-row-mark-read-${n.id}`}
                      >
                        {markReadMutation.isPending &&
                        markReadMutation.variables?.notificationId === n.id
                          ? "Marking…"
                          : "Mark read"}
                      </button>
                    </div>
                  ) : null}
                  {markReadError != null && markReadErrorRowId === n.id ? (
                    <div
                      className="mt-1 text-xs text-destructive"
                      data-testid={`inbox-row-mark-read-error-${n.id}`}
                    >
                      Mark-read failed: {markReadError}
                    </div>
                  ) : null}
                  {/* ── T-F.109 (T-F.6-γ): dismiss ── */}
                  {dismissConfirmRowId !== n.id ? (
                    <div className="mt-1">
                      <button
                        type="button"
                        className="rounded border px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-50"
                        disabled={
                          dismissMutation.isPending &&
                          dismissMutation.variables?.notificationIds?.[0] ===
                            n.id
                        }
                        onClick={() => openDismissConfirm(n.id)}
                        data-testid={`inbox-row-dismiss-${n.id}`}
                      >
                        Dismiss…
                      </button>
                    </div>
                  ) : (
                    <div
                      className="mt-1 rounded border border-destructive/30 bg-destructive/5 p-2 text-xs"
                      data-testid={`inbox-row-dismiss-confirm-${n.id}`}
                    >
                      <div className="text-foreground">
                        Dismiss notification{" "}
                        <span className="font-mono">{n.notificationKind}</span>{" "}
                        (#{n.id})? This removes it from your inbox.
                      </div>
                      <div className="mt-1 flex gap-2">
                        <button
                          type="button"
                          className="rounded border border-destructive bg-destructive px-2 py-0.5 text-xs text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                          disabled={
                            dismissMutation.isPending &&
                            dismissMutation.variables?.notificationIds?.[0] ===
                              n.id
                          }
                          onClick={() =>
                            dismissMutation.mutate({
                              notificationIds: [n.id],
                            })
                          }
                          data-testid={`inbox-row-dismiss-confirm-button-${n.id}`}
                        >
                          {dismissMutation.isPending &&
                          dismissMutation.variables?.notificationIds?.[0] ===
                            n.id
                            ? "Dismissing…"
                            : "Confirm dismiss"}
                        </button>
                        <button
                          type="button"
                          className="rounded border px-2 py-0.5 text-xs hover:bg-muted"
                          onClick={cancelDismissConfirm}
                          data-testid={`inbox-row-dismiss-cancel-${n.id}`}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {dismissError != null && dismissErrorRowId === n.id ? (
                    <div
                      className="mt-1 text-xs text-destructive"
                      data-testid={`inbox-row-dismiss-error-${n.id}`}
                    >
                      Dismiss failed: {dismissError}
                    </div>
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
