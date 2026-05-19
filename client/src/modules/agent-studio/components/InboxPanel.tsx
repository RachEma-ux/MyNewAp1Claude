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
 * α-shell shipped read-only; β/γ then wired per-row markRead +
 * dismiss mutations (T-F.107 / T-F.109) and the ε kind-filter +
 * bulk-by-kind affordances (T-F.111+). The remaining unwired
 * capability is the workspace-wide dismiss-all button — kept
 * intentionally narrow because the by-kind bulk path already
 * covers the common operator need (see the inline banner below).
 */

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

const INBOX_LIMIT = 50;

/**
 * T-F.132 — notification-kind-coded badge (mechanical replication
 * of T-F.131's StepKindBadge onto the inbox row).
 *
 * 2 closed-emitter notification kinds in the server today
 * (server/agent-studio/services/graph-quality/agent-run-notifications.ts):
 *   - graph_quality_run_completed     → emerald (run finished cleanly)
 *   - graph_quality_proposals_created → amber   (new proposals — operator action)
 *
 * Any other kind (including future server-side emitters and any
 * indirect-pipeline emissions surfaced via the same inbox) falls
 * back to a neutral outline — same lesson-45 future-extensibility
 * shape T-F.131 used.
 *
 * Helper kept inline in InboxPanel.tsx (not shared with T-F.131's
 * StepKindBadge) because the closed taxonomies are independent and
 * extracting a shared `<TaxonomyBadge>` would over-couple two
 * unrelated server-side enums into one client primitive.
 */
function NotificationKindBadge({
  notificationKind,
}: {
  notificationKind: string;
}) {
  const tone =
    notificationKind === "graph_quality_run_completed"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
      : notificationKind === "graph_quality_proposals_created"
        ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
        : "border-border/60 text-muted-foreground";
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0 text-[10px] font-mono font-medium ${tone}`}
      data-testid={`inbox-notification-kind-badge-${notificationKind}`}
    >
      {notificationKind}
    </span>
  );
}

/**
 * T-F.137 — read `?kind=X` from the page URL on first render.
 *
 * Mechanical replication of the T-F.135 lens-browser deeplink
 * primitive onto a third selection axis: InboxPanel's kind-filter
 * dropdown. Same string-axis shape as T-F.135 (not the numeric
 * T-F.136 variant), so the helper accepts any non-empty raw value
 * — the dropdown is open-taxonomy (varchar(100) free-form) per
 * the panel's precedent (o) note, so we don't gate by a closed
 * enum here. The receiving page may end up with a `?kind=X` that
 * doesn't appear in the current `kindOptions` list; that's fine
 * — the dropdown's controlled value still renders the param as
 * the selected kind and the operator can recover by clicking
 * Clear filters.
 */
function readKindFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("kind");
  return raw && raw.length > 0 ? raw : null;
}

export function InboxPanel() {
  const utils = trpc.useUtils();

  // ── T-F.110 (T-F.6-δ): kind filter + unread-only toggle ──
  // The dropdown options are derived from the unread `byKind`
  // breakdown — operators see and pick from the LIVE taxonomy
  // the workspace is actually emitting (precedent (o) made
  // interactive). null = "all kinds".
  const [selectedKind, setSelectedKind] = useState<string | null>(
    () => readKindFromUrl(),
  );
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);

  const inboxQuery = trpc.agentStudio.workspaceObservability.getMyInbox.useQuery(
    {
      limit: INBOX_LIMIT,
      // tRPC zod input accepts `notificationKind: string | string[]`
      // and `unreadOnly?: boolean`. Pass `undefined` (not `null`)
      // when the operator hasn't narrowed, so the optional input
      // stays optional.
      notificationKind: selectedKind ?? undefined,
      unreadOnly: unreadOnly || undefined,
    },
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

  // ── T-F.111 (T-F.6-ε): bulk-by-kind mutations ──
  // Both consume the δ-shipped `selectedKind` state directly. The
  // mark-read variant is one-click (lesson 66 — reversible by
  // re-emitting the notification); the dismiss variant is two-step
  // (lesson 64 — destructive, removes N rows).
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState<boolean>(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  const bulkMarkReadByKindMutation =
    trpc.agentStudio.workspaceObservability.markAllNotificationsReadByKind.useMutation(
      {
        onSuccess: (res) => {
          utils.agentStudio.workspaceObservability.getMyInbox.invalidate();
          setBulkError(null);
          setBulkResult(`Marked ${res.markedCount} notification(s) as read.`);
        },
        onError: (err) => {
          setBulkError(err.message);
          setBulkResult(null);
        },
      },
    );

  const bulkDismissByKindMutation =
    trpc.agentStudio.workspaceObservability.dismissAllNotificationsByKind.useMutation(
      {
        onSuccess: (res) => {
          utils.agentStudio.workspaceObservability.getMyInbox.invalidate();
          setBulkError(null);
          setBulkResult(`Dismissed ${res.deletedCount} notification(s).`);
          setBulkConfirmOpen(false);
        },
        onError: (err) => {
          setBulkError(err.message);
          setBulkResult(null);
        },
      },
    );

  const bulkPending =
    bulkMarkReadByKindMutation.isPending ||
    bulkDismissByKindMutation.isPending;

  const notifications = inboxQuery.data?.notifications ?? [];
  const unreadCount = inboxQuery.data?.unreadCount ?? {
    total: 0,
    byKind: {} as Record<string, number>,
  };

  const byKindEntries = useMemo(() => {
    return Object.entries(unreadCount.byKind).sort((a, b) => b[1] - a[1]);
  }, [unreadCount.byKind]);

  // ── T-F.110 (T-F.6-δ): dropdown options derived from the FULL
  // unread breakdown (server's countUnreadNotifications ignores
  // the listing filter, so byKind here is workspace-wide unread —
  // exactly what we want for the operator's narrowing picker).
  // Currently-selected kind is force-included so the dropdown
  // doesn't lose its current value if it transitions to 0 unread.
  const kindOptions = useMemo(() => {
    const set = new Set<string>(Object.keys(unreadCount.byKind));
    if (selectedKind != null) set.add(selectedKind);
    return Array.from(set).sort();
  }, [unreadCount.byKind, selectedKind]);

  const filtersActive = selectedKind != null || unreadOnly;
  const clearFilters = (): void => {
    setSelectedKind(null);
    setUnreadOnly(false);
  };

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
          <span className="font-medium text-foreground">Inbox ε:</span>{" "}
          mark-read + dismiss live (per-row); kind filter + unread-only toggle
          live; bulk-mark-read-by-kind + bulk-dismiss-by-kind live (gated on a
          selected kind). Server-side {"workspace-wide"} dismiss-all is the
          remaining mutation candidate — kept deferred since the by-kind path
          already covers the common operator need.
        </div>
      </div>

      <div
        className="flex flex-wrap items-center gap-2"
        data-testid="inbox-filter-bar"
      >
        <label className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Kind</span>
          <select
            className="rounded border bg-background px-2 py-0.5 text-xs"
            value={selectedKind ?? ""}
            onChange={(e) =>
              setSelectedKind(e.target.value === "" ? null : e.target.value)
            }
            data-testid="inbox-filter-kind"
          >
            <option value="">All kinds</option>
            {kindOptions.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            data-testid="inbox-filter-unread-only"
          />
          <span>Unread only</span>
        </label>
        {filtersActive ? (
          <button
            type="button"
            className="rounded border px-2 py-0.5 text-xs hover:bg-muted"
            onClick={clearFilters}
            data-testid="inbox-filter-clear"
          >
            Clear filters
          </button>
        ) : null}
        {/* T-F.137 — copy a shareable link with `?kind=X` pre-filled.
            Gated on `selectedKind` because the bare-URL no-filter
            state is the default and offers no shareable narrowing.
            Replicates T-F.135 / T-F.136 deeplink primitive onto the
            inbox kind-filter axis. */}
        {selectedKind != null ? (
          <button
            type="button"
            className="rounded border bg-background px-2 py-0.5 text-xs hover:bg-muted"
            data-testid="inbox-copy-link-button"
            title={`Copy a shareable link with ?kind=${selectedKind}`}
            onClick={() => {
              const url = `${window.location.origin}${window.location.pathname}?kind=${encodeURIComponent(selectedKind)}`;
              void navigator.clipboard?.writeText(url);
            }}
          >
            Copy link
          </button>
        ) : null}
      </div>

      {/* ── T-F.111 (T-F.6-ε): bulk-by-kind action bar ── */}
      {selectedKind != null ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded border bg-muted/20 p-2 text-xs"
          data-testid="inbox-bulk-bar"
        >
          <span className="text-muted-foreground">
            Bulk actions on kind{" "}
            <span
              className="font-mono"
              data-testid="inbox-bulk-bar-kind"
            >
              {selectedKind}
            </span>
            :
          </span>
          <button
            type="button"
            className="rounded border px-2 py-0.5 hover:bg-muted disabled:opacity-50"
            disabled={bulkPending || bulkConfirmOpen}
            onClick={() => {
              setBulkError(null);
              setBulkResult(null);
              bulkMarkReadByKindMutation.mutate({
                notificationKind: selectedKind,
              });
            }}
            data-testid="inbox-bulk-mark-read-by-kind"
          >
            {bulkMarkReadByKindMutation.isPending
              ? "Marking…"
              : "Mark all read"}
          </button>
          {!bulkConfirmOpen ? (
            <button
              type="button"
              className="rounded border px-2 py-0.5 hover:bg-muted disabled:opacity-50"
              disabled={bulkPending}
              onClick={() => {
                setBulkError(null);
                setBulkResult(null);
                setBulkConfirmOpen(true);
              }}
              data-testid="inbox-bulk-dismiss-by-kind"
            >
              Dismiss all…
            </button>
          ) : (
            <div
              className="flex items-center gap-2 rounded border border-destructive/30 bg-destructive/5 px-2 py-1"
              data-testid="inbox-bulk-dismiss-confirm"
            >
              <span>
                Dismiss all notifications of kind{" "}
                <span className="font-mono">{selectedKind}</span>?
              </span>
              <button
                type="button"
                className="rounded border border-destructive bg-destructive px-2 py-0.5 text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                disabled={bulkDismissByKindMutation.isPending}
                onClick={() =>
                  bulkDismissByKindMutation.mutate({
                    notificationKind: selectedKind,
                    // Explicit operator gesture — nuke read AND unread
                    // of this kind. The two-step confirm above is the
                    // safety gate; the server's readOnly-default is
                    // for the unguarded `dismissAllNotifications` path.
                    readOnly: false,
                  })
                }
                data-testid="inbox-bulk-dismiss-confirm-button"
              >
                {bulkDismissByKindMutation.isPending
                  ? "Dismissing…"
                  : "Confirm"}
              </button>
              <button
                type="button"
                className="rounded border px-2 py-0.5 hover:bg-muted"
                onClick={() => setBulkConfirmOpen(false)}
                data-testid="inbox-bulk-dismiss-cancel"
              >
                Cancel
              </button>
            </div>
          )}
          {bulkResult != null ? (
            <span
              className="text-foreground"
              data-testid="inbox-bulk-result"
            >
              {bulkResult}
            </span>
          ) : null}
          {bulkError != null ? (
            <span
              className="text-destructive"
              data-testid="inbox-bulk-error"
            >
              {bulkError}
            </span>
          ) : null}
        </div>
      ) : null}

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
                <li key={kind}>
                  <button
                    type="button"
                    className={
                      selectedKind === kind
                        ? "flex w-full items-baseline justify-between gap-2 rounded bg-accent px-1 py-0.5 text-left text-sm"
                        : "flex w-full items-baseline justify-between gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-muted"
                    }
                    onClick={() => setSelectedKind(kind)}
                    data-testid={`inbox-by-kind-row-${kind}`}
                  >
                    <span className="truncate font-mono text-xs">{kind}</span>
                    <span className="tabular-nums">{n}</span>
                  </button>
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
          filtersActive ? (
            <div
              className="px-3 py-4 text-sm text-muted-foreground"
              data-testid="inbox-list-empty-filtered"
            >
              No notifications match the current filters.{" "}
              <button
                type="button"
                className="underline hover:no-underline"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div
              className="px-3 py-4 text-sm text-muted-foreground"
              data-testid="inbox-list-empty"
            >
              No notifications.
            </div>
          )
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
                      className="truncate"
                      data-testid={`inbox-row-kind-${n.id}`}
                    >
                      <NotificationKindBadge
                        notificationKind={n.notificationKind}
                      />
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
