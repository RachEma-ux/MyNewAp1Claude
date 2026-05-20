// WorkspaceObservabilityPanel — no-deferral continuation-28 slice 117.
//
// Closes the partial-consumer gap on `workspaceObservability.*` — 18
// unconsumed endpoints across 3 functional groups (Notifications /
// Background jobs / Error events).
//
// Coexists with the existing notification/job/error-event surfaces
// (e.g. graph-health-admin, runs panels) — this is the operator
// long-tail admin chrome for the cross-cutting observability primitives.

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "./ui";

function parsePositiveInt(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseIdList(s: string): number[] | null {
  const trimmed = s.trim();
  if (trimmed === "") return null;
  const parts = trimmed.split(/[,\s]+/).filter((p) => p.length > 0);
  const out: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n <= 0) return null;
    out.push(n);
  }
  return out.length > 0 ? out : null;
}

export function WorkspaceObservabilityPanel() {
  return (
    <div className="space-y-4" data-testid="wo-panel">
      <NotificationsCard />
      <BackgroundJobsCard />
      <ErrorEventsCard />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Notifications
// ─────────────────────────────────────────────────────────────────

function NotificationsCard() {
  const [lookupId, setLookupId] = useState("");
  const [lookupIds, setLookupIds] = useState("");
  const [markIds, setMarkIds] = useState("");
  const [broadcastKind, setBroadcastKind] = useState("");
  const [broadcastPayload, setBroadcastPayload] = useState("{}");

  const utils = trpc.useUtils();
  const listQuery =
    trpc.agentStudio.workspaceObservability.listMyNotifications.useQuery(
      {},
      { refetchOnWindowFocus: false },
    );
  const unreadCountQuery =
    trpc.agentStudio.workspaceObservability.getMyUnreadNotificationCount.useQuery(
      undefined,
      { refetchOnWindowFocus: false },
    );

  const parsedLookup = parsePositiveInt(lookupId);
  const lookupQuery =
    trpc.agentStudio.workspaceObservability.getMyNotificationById.useQuery(
      parsedLookup !== null
        ? { notificationId: parsedLookup }
        : (undefined as never),
      { enabled: parsedLookup !== null, refetchOnWindowFocus: false },
    );

  const parsedLookupIds = parseIdList(lookupIds);
  const lookupIdsQuery =
    trpc.agentStudio.workspaceObservability.getMyNotificationsByIds.useQuery(
      parsedLookupIds !== null
        ? { ids: parsedLookupIds }
        : (undefined as never),
      { enabled: parsedLookupIds !== null, refetchOnWindowFocus: false },
    );

  const parsedMarkIds = parseIdList(markIds);
  const markValid = parsedMarkIds !== null;

  const markMut =
    trpc.agentStudio.workspaceObservability.markNotificationsRead.useMutation({
      onSuccess: () => {
        toast.success("Marked read");
        setMarkIds("");
        void utils.agentStudio.workspaceObservability.listMyNotifications.invalidate();
        void utils.agentStudio.workspaceObservability.getMyUnreadNotificationCount.invalidate();
      },
      onError: (err) =>
        toast.error(`Mark read failed: ${err.message ?? "unknown"}`),
    });
  const markAllMut =
    trpc.agentStudio.workspaceObservability.markAllNotificationsRead.useMutation({
      onSuccess: () => {
        toast.success("All marked read");
        void utils.agentStudio.workspaceObservability.listMyNotifications.invalidate();
        void utils.agentStudio.workspaceObservability.getMyUnreadNotificationCount.invalidate();
      },
      onError: (err) =>
        toast.error(`Mark-all failed: ${err.message ?? "unknown"}`),
    });
  const dismissAllMut =
    trpc.agentStudio.workspaceObservability.dismissAllNotifications.useMutation({
      onSuccess: () => {
        toast.success("All dismissed");
        void utils.agentStudio.workspaceObservability.listMyNotifications.invalidate();
        void utils.agentStudio.workspaceObservability.getMyUnreadNotificationCount.invalidate();
      },
      onError: (err) =>
        toast.error(`Dismiss-all failed: ${err.message ?? "unknown"}`),
    });

  const parsedBroadcastPayload = (() => {
    const t = broadcastPayload.trim();
    if (t === "") return null;
    try {
      const v = JSON.parse(t);
      if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
      return v as Record<string, unknown>;
    } catch {
      return null;
    }
  })();
  const broadcastValid =
    broadcastKind.trim().length > 0 && parsedBroadcastPayload !== null;
  const broadcastMut =
    trpc.agentStudio.workspaceObservability.broadcastNotification.useMutation({
      onSuccess: () => {
        toast.success("Broadcast sent");
        setBroadcastKind("");
        setBroadcastPayload("{}");
      },
      onError: (err) =>
        toast.error(`Broadcast failed: ${err.message ?? "unknown"}`),
    });

  function handleMark() {
    if (!markValid) return;
    markMut.mutate({ ids: parsedMarkIds as number[] });
  }
  function handleMarkAll() {
    if (!window.confirm("Mark ALL notifications read?")) return;
    markAllMut.mutate();
  }
  function handleDismissAll() {
    if (!window.confirm("Dismiss ALL notifications?")) return;
    dismissAllMut.mutate();
  }
  function handleBroadcast() {
    if (!broadcastValid) return;
    broadcastMut.mutate({
      kind: broadcastKind.trim(),
      payload: parsedBroadcastPayload as Record<string, unknown>,
    });
  }

  const items = ((listQuery.data as { items?: Array<unknown> } | undefined)
    ?.items ?? []) as Array<{ id: number; kind: string; readAt?: Date | null }>;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Notifications</SectionLabel>
        <p
          className="text-xs text-muted-foreground"
          data-testid="wo-unread-count"
        >
          Unread: {String(unreadCountQuery.data ?? "—")}
        </p>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Recent</SectionLabel>
          {listQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : listQuery.error ? (
            <p
              className="text-sm text-destructive"
              data-testid="wo-list-error"
            >
              {listQuery.error.message}
            </p>
          ) : items.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="wo-list-empty"
            >
              No notifications.
            </p>
          ) : (
            <ul className="space-y-1" data-testid="wo-list-rows">
              {items.slice(0, 20).map((n) => (
                <li
                  key={n.id}
                  className="rounded border bg-background p-2 font-mono text-xs"
                  data-testid="wo-list-row"
                >
                  #{n.id} {n.kind} {n.readAt ? "(read)" : "(unread)"}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Lookup by id</SectionLabel>
          <Input
            data-testid="wo-lookup-id"
            type="number"
            min={1}
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
          />
          {parsedLookup !== null && lookupQuery.data ? (
            <pre
              className="overflow-x-auto rounded bg-background p-2 font-mono text-[10px]"
              data-testid="wo-lookup-json"
            >
              {JSON.stringify(lookupQuery.data, null, 2)}
            </pre>
          ) : null}
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Lookup by ids</SectionLabel>
          <Input
            data-testid="wo-lookup-ids"
            value={lookupIds}
            onChange={(e) => setLookupIds(e.target.value)}
            placeholder="comma- or space-separated ids"
          />
          {parsedLookupIds !== null && lookupIdsQuery.data ? (
            <pre
              className="overflow-x-auto rounded bg-background p-2 font-mono text-[10px]"
              data-testid="wo-lookup-ids-json"
            >
              {JSON.stringify(lookupIdsQuery.data, null, 2)}
            </pre>
          ) : null}
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Mark as read</SectionLabel>
          <Input
            data-testid="wo-mark-ids"
            value={markIds}
            onChange={(e) => setMarkIds(e.target.value)}
            placeholder="comma- or space-separated ids"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!markValid || markMut.isPending}
              onClick={handleMark}
              data-testid="wo-mark-button"
            >
              {markMut.isPending ? "Marking…" : "Mark read"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={markAllMut.isPending}
              onClick={handleMarkAll}
              data-testid="wo-mark-all-button"
            >
              {markAllMut.isPending ? "Marking…" : "Mark ALL read"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={dismissAllMut.isPending}
              onClick={handleDismissAll}
              data-testid="wo-dismiss-all-button"
            >
              {dismissAllMut.isPending ? "Dismissing…" : "Dismiss ALL"}
            </Button>
          </div>
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Broadcast (admin)</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="wo-broadcast-kind">Kind</Label>
              <Input
                id="wo-broadcast-kind"
                data-testid="wo-broadcast-kind"
                value={broadcastKind}
                onChange={(e) => setBroadcastKind(e.target.value)}
                placeholder="ops_alert"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="wo-broadcast-payload">Payload (JSON)</Label>
              <textarea
                id="wo-broadcast-payload"
                data-testid="wo-broadcast-payload"
                className="w-full rounded border bg-background p-2 font-mono text-xs"
                rows={3}
                value={broadcastPayload}
                onChange={(e) => setBroadcastPayload(e.target.value)}
              />
              {parsedBroadcastPayload === null ? (
                <p
                  className="text-xs text-destructive"
                  data-testid="wo-broadcast-error"
                >
                  Payload must be a JSON object.
                </p>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            disabled={!broadcastValid || broadcastMut.isPending}
            onClick={handleBroadcast}
            data-testid="wo-broadcast-button"
          >
            {broadcastMut.isPending ? "Sending…" : "Broadcast"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────
// Background jobs
// ─────────────────────────────────────────────────────────────────

function BackgroundJobsCard() {
  const [statusFilter, setStatusFilter] = useState("");
  const [lookupId, setLookupId] = useState("");
  const [lookupIds, setLookupIds] = useState("");
  const [actId, setActId] = useState("");
  const [actIds, setActIds] = useState("");

  const utils = trpc.useUtils();
  const listQuery =
    trpc.agentStudio.workspaceObservability.listBackgroundJobs.useQuery(
      statusFilter.trim() !== "" ? { status: statusFilter.trim() } : {},
      { refetchOnWindowFocus: false },
    );

  const parsedLookup = parsePositiveInt(lookupId);
  const lookupQuery =
    trpc.agentStudio.workspaceObservability.getBackgroundJob.useQuery(
      parsedLookup !== null ? { jobId: parsedLookup } : (undefined as never),
      { enabled: parsedLookup !== null, refetchOnWindowFocus: false },
    );

  const parsedLookupIds = parseIdList(lookupIds);
  const lookupIdsQuery =
    trpc.agentStudio.workspaceObservability.getBackgroundJobsByIds.useQuery(
      parsedLookupIds !== null ? { ids: parsedLookupIds } : (undefined as never),
      { enabled: parsedLookupIds !== null, refetchOnWindowFocus: false },
    );

  const parsedActId = parsePositiveInt(actId);
  const parsedActIds = parseIdList(actIds);
  const idValid = parsedActId !== null;
  const idsValid = parsedActIds !== null;

  function refresh() {
    void utils.agentStudio.workspaceObservability.listBackgroundJobs.invalidate();
  }

  const cancelMut =
    trpc.agentStudio.workspaceObservability.cancelBackgroundJob.useMutation({
      onSuccess: () => {
        toast.success("Cancelled");
        refresh();
      },
      onError: (err) =>
        toast.error(`Cancel failed: ${err.message ?? "unknown"}`),
    });
  const cancelBulkMut =
    trpc.agentStudio.workspaceObservability.cancelBackgroundJobs.useMutation({
      onSuccess: () => {
        toast.success("Cancelled (bulk)");
        refresh();
      },
      onError: (err) =>
        toast.error(`Bulk cancel failed: ${err.message ?? "unknown"}`),
    });
  const retryMut =
    trpc.agentStudio.workspaceObservability.retryBackgroundJob.useMutation({
      onSuccess: () => {
        toast.success("Retried");
        refresh();
      },
      onError: (err) =>
        toast.error(`Retry failed: ${err.message ?? "unknown"}`),
    });
  const retryBulkMut =
    trpc.agentStudio.workspaceObservability.retryBackgroundJobs.useMutation({
      onSuccess: () => {
        toast.success("Retried (bulk)");
        refresh();
      },
      onError: (err) =>
        toast.error(`Bulk retry failed: ${err.message ?? "unknown"}`),
    });

  const jobs = (
    (listQuery.data as { jobs?: Array<unknown> } | undefined)?.jobs ?? []
  ) as Array<{ id: number; jobKind: string; status: string }>;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Background jobs</SectionLabel>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>List</SectionLabel>
          <div>
            <Label htmlFor="wj-status">Status filter (optional)</Label>
            <Input
              id="wj-status"
              data-testid="wj-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              placeholder="pending / running / failed / done"
            />
          </div>
          {listQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : listQuery.error ? (
            <p className="text-sm text-destructive" data-testid="wj-list-error">
              {listQuery.error.message}
            </p>
          ) : jobs.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="wj-list-empty"
            >
              No jobs.
            </p>
          ) : (
            <ul className="space-y-1" data-testid="wj-list-rows">
              {jobs.slice(0, 30).map((j) => (
                <li
                  key={j.id}
                  className="rounded border bg-background p-2 font-mono text-xs"
                  data-testid="wj-list-row"
                >
                  #{j.id} {j.jobKind} · {j.status}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Lookup by id</SectionLabel>
          <Input
            data-testid="wj-lookup-id"
            type="number"
            min={1}
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
          />
          {parsedLookup !== null && lookupQuery.data ? (
            <pre
              className="overflow-x-auto rounded bg-background p-2 font-mono text-[10px]"
              data-testid="wj-lookup-json"
            >
              {JSON.stringify(lookupQuery.data, null, 2)}
            </pre>
          ) : null}
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Lookup by ids</SectionLabel>
          <Input
            data-testid="wj-lookup-ids"
            value={lookupIds}
            onChange={(e) => setLookupIds(e.target.value)}
            placeholder="comma- or space-separated ids"
          />
          {parsedLookupIds !== null && lookupIdsQuery.data ? (
            <pre
              className="overflow-x-auto rounded bg-background p-2 font-mono text-[10px]"
              data-testid="wj-lookup-ids-json"
            >
              {JSON.stringify(lookupIdsQuery.data, null, 2)}
            </pre>
          ) : null}
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Single action</SectionLabel>
          <Input
            data-testid="wj-act-id"
            type="number"
            min={1}
            value={actId}
            onChange={(e) => setActId(e.target.value)}
            placeholder="job id"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={!idValid || cancelMut.isPending}
              onClick={() =>
                idValid && cancelMut.mutate({ jobId: parsedActId as number })
              }
              data-testid="wj-cancel-button"
            >
              {cancelMut.isPending ? "Cancelling…" : "Cancel"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!idValid || retryMut.isPending}
              onClick={() =>
                idValid && retryMut.mutate({ jobId: parsedActId as number })
              }
              data-testid="wj-retry-button"
            >
              {retryMut.isPending ? "Retrying…" : "Retry"}
            </Button>
          </div>
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Bulk action</SectionLabel>
          <Input
            data-testid="wj-act-ids"
            value={actIds}
            onChange={(e) => setActIds(e.target.value)}
            placeholder="comma- or space-separated ids"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={!idsValid || cancelBulkMut.isPending}
              onClick={() =>
                idsValid &&
                cancelBulkMut.mutate({ ids: parsedActIds as number[] })
              }
              data-testid="wj-cancel-bulk-button"
            >
              {cancelBulkMut.isPending ? "Cancelling…" : "Bulk cancel"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!idsValid || retryBulkMut.isPending}
              onClick={() =>
                idsValid &&
                retryBulkMut.mutate({ ids: parsedActIds as number[] })
              }
              data-testid="wj-retry-bulk-button"
            >
              {retryBulkMut.isPending ? "Retrying…" : "Bulk retry"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────
// Error events
// ─────────────────────────────────────────────────────────────────

function ErrorEventsCard() {
  const [lookupId, setLookupId] = useState("");
  const [lookupIds, setLookupIds] = useState("");

  const listQuery =
    trpc.agentStudio.workspaceObservability.listErrorEvents.useQuery({}, {
      refetchOnWindowFocus: false,
    });

  const parsedLookup = parsePositiveInt(lookupId);
  const lookupQuery =
    trpc.agentStudio.workspaceObservability.getErrorEventById.useQuery(
      parsedLookup !== null ? { eventId: parsedLookup } : (undefined as never),
      { enabled: parsedLookup !== null, refetchOnWindowFocus: false },
    );

  const parsedLookupIds = parseIdList(lookupIds);
  const lookupIdsQuery =
    trpc.agentStudio.workspaceObservability.getErrorEventsByIds.useQuery(
      parsedLookupIds !== null ? { ids: parsedLookupIds } : (undefined as never),
      { enabled: parsedLookupIds !== null, refetchOnWindowFocus: false },
    );

  const events = (
    (listQuery.data as { events?: Array<unknown> } | undefined)?.events ?? []
  ) as Array<{ id: number; errorCode: string; createdAt?: Date }>;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Error events</SectionLabel>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Recent</SectionLabel>
          {listQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : listQuery.error ? (
            <p
              className="text-sm text-destructive"
              data-testid="we-list-error"
            >
              {listQuery.error.message}
            </p>
          ) : events.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="we-list-empty"
            >
              No error events.
            </p>
          ) : (
            <ul className="space-y-1" data-testid="we-list-rows">
              {events.slice(0, 30).map((ev) => (
                <li
                  key={ev.id}
                  className="rounded border bg-background p-2 font-mono text-xs"
                  data-testid="we-list-row"
                >
                  #{ev.id} {ev.errorCode}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Lookup by id</SectionLabel>
          <Input
            data-testid="we-lookup-id"
            type="number"
            min={1}
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
          />
          {parsedLookup !== null && lookupQuery.data ? (
            <pre
              className="overflow-x-auto rounded bg-background p-2 font-mono text-[10px]"
              data-testid="we-lookup-json"
            >
              {JSON.stringify(lookupQuery.data, null, 2)}
            </pre>
          ) : null}
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Lookup by ids</SectionLabel>
          <Input
            data-testid="we-lookup-ids"
            value={lookupIds}
            onChange={(e) => setLookupIds(e.target.value)}
            placeholder="comma- or space-separated ids"
          />
          {parsedLookupIds !== null && lookupIdsQuery.data ? (
            <pre
              className="overflow-x-auto rounded bg-background p-2 font-mono text-[10px]"
              data-testid="we-lookup-ids-json"
            >
              {JSON.stringify(lookupIdsQuery.data, null, 2)}
            </pre>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
