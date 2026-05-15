/**
 * Region Admin panel — V2 Phase MR-1 Phase-2 ninth slice. PR-V1-157.
 *
 * Operator surface for the region admin tRPC router (#907). Renders:
 *
 *   1. Cache + re-warm cron status (top — quick "is multi-region
 *      actually wired" answer).
 *   2. Active regions table (read-only).
 *   3. Workspace pins table (read-only).
 *
 * Pin add/edit/remove forms are intentionally out of scope for this
 * slice — operator pin onboarding is rare + sensitive and warrants
 * its own UI iteration after the data shape settles. CLI / direct
 * tRPC continue to be the supported pin-write path.
 *
 * Pattern follows #813 / #814 (CanvasProjectionEventsDrainStatusPanel)
 * — small focused panel with its own data fetches, mounted by a
 * slim wrapper page.
 */

import { useState } from "react";

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { SectionLabel } from "./ui";

function fmtTs(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").replace(/\..+$/, "Z");
}

export function RegionAdminPanel() {
  const utils = trpc.useUtils();
  const [pinForm, setPinForm] = useState<{
    workspaceId: string;
    regionKey: string;
    isReplicated: boolean;
    notes: string;
  }>({ workspaceId: "", regionKey: "", isReplicated: false, notes: "" });
  const [mutationError, setMutationError] = useState<string | null>(null);

  const setPinMutation = trpc.agentStudio.region.setPin.useMutation({
    onSuccess: () => {
      setMutationError(null);
      void utils.agentStudio.region.listPins.invalidate();
      void utils.agentStudio.region.getCacheStatus.invalidate();
      void utils.agentStudio.region.getPubsubStatus.invalidate();
      setPinForm((f) => ({ ...f, notes: "" }));
    },
    onError: (err) => setMutationError(err.message),
  });
  const removePinMutation = trpc.agentStudio.region.removePin.useMutation({
    onSuccess: () => {
      setMutationError(null);
      void utils.agentStudio.region.listPins.invalidate();
      void utils.agentStudio.region.getCacheStatus.invalidate();
      void utils.agentStudio.region.getPubsubStatus.invalidate();
    },
    onError: (err) => setMutationError(err.message),
  });
  const [rewarmFeedback, setRewarmFeedback] = useState<string | null>(null);
  const forceRewarmMutation = trpc.agentStudio.region.forceRewarm.useMutation({
    onSuccess: (data) => {
      setRewarmFeedback(
        `Re-warmed: ${data.activeRegionCount} active regions / ${data.pinCount} pins / primary=${data.primaryRegionKey ?? "(none)"}.`,
      );
      void utils.agentStudio.region.getCacheStatus.invalidate();
      void utils.agentStudio.region.listActiveRegions.invalidate();
      void utils.agentStudio.region.listPins.invalidate();
    },
    onError: (err) => setRewarmFeedback(`Re-warm failed: ${err.message}`),
  });

  const cacheQ = trpc.agentStudio.region.getCacheStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const cronQ = trpc.agentStudio.region.getRewarmCronStatus.useQuery(
    undefined,
    { refetchOnWindowFocus: false },
  );
  const pubsubQ = trpc.agentStudio.region.getPubsubStatus.useQuery(
    undefined,
    { refetchOnWindowFocus: false },
  );
  const regionsQ = trpc.agentStudio.region.listActiveRegions.useQuery(
    undefined,
    { refetchOnWindowFocus: false },
  );
  const pinsQ = trpc.agentStudio.region.listPins.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  return (
    <div className="space-y-4">
      {/* Cache + cron status */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Routing cache</SectionLabel>
          {cacheQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading cache status…</p>
          ) : cacheQ.error ? (
            <p className="text-sm text-destructive">
              Failed to load cache status: {cacheQ.error.message}
            </p>
          ) : cacheQ.data == null ? (
            <p className="text-sm text-muted-foreground">No cache status.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="font-medium">Warm:</span>{" "}
                {cacheQ.data.isWarm ? "yes" : "no"}
              </div>
              <div>
                <span className="font-medium">Last warmed:</span>{" "}
                {fmtTs(cacheQ.data.lastWarmedAt)}
              </div>
              <div>
                <span className="font-medium">Active regions:</span>{" "}
                {cacheQ.data.activeRegionCount}
              </div>
              <div>
                <span className="font-medium">Pins:</span>{" "}
                {cacheQ.data.pinCount}
              </div>
              <div className="col-span-2">
                <span className="font-medium">Primary region:</span>{" "}
                {cacheQ.data.primaryRegionKey ?? "(none)"}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 pt-2 border-t">
            <button
              type="button"
              className="text-sm underline"
              disabled={forceRewarmMutation.isPending}
              onClick={() => forceRewarmMutation.mutate()}
              data-testid="region-cache-force-rewarm-button"
            >
              {forceRewarmMutation.isPending ? "Re-warming…" : "Force re-warm now"}
            </button>
            {rewarmFeedback ? (
              <span
                className="text-xs text-muted-foreground"
                data-testid="region-cache-force-rewarm-feedback"
              >
                {rewarmFeedback}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Re-warm cron</SectionLabel>
          {cronQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading cron status…</p>
          ) : cronQ.error ? (
            <p className="text-sm text-destructive">
              Failed to load cron status: {cronQ.error.message}
            </p>
          ) : cronQ.data == null ? (
            <p className="text-sm text-muted-foreground">No cron status.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="font-medium">Cron expression:</span>{" "}
                {cronQ.data.cronExpr ?? "(default)"}
              </div>
              <div>
                <span className="font-medium">Last run:</span>{" "}
                {fmtTs(cronQ.data.lastRunAt)}
              </div>
              {cronQ.data.lastError ? (
                <div className="col-span-2 text-destructive">
                  <span className="font-medium">Last error:</span>{" "}
                  {cronQ.data.lastError}
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cross-process pubsub status (PR-V1-167) */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Cross-process pubsub</SectionLabel>
          {pubsubQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading pubsub status…</p>
          ) : pubsubQ.error ? (
            <p className="text-sm text-destructive">
              Failed to load pubsub status: {pubsubQ.error.message}
            </p>
          ) : pubsubQ.data == null ? (
            <p className="text-sm text-muted-foreground">No pubsub status.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="font-medium">Subscribed:</span>{" "}
                {pubsubQ.data.subscribed ? "yes" : "no"}
              </div>
              <div>
                <span className="font-medium">Connected at:</span>{" "}
                {fmtTs(pubsubQ.data.connectedAt)}
              </div>
              <div>
                <span className="font-medium">Last message:</span>{" "}
                {fmtTs(pubsubQ.data.lastMessageAt)}
              </div>
              <div>
                <span className="font-medium">Reason:</span>{" "}
                {pubsubQ.data.lastMessageReason ?? "—"}
              </div>
              <div>
                <span className="font-medium">Messages received:</span>{" "}
                {pubsubQ.data.messagesReceived}
              </div>
              <div>
                <span className="font-medium">Reconnect attempts:</span>{" "}
                {pubsubQ.data.reconnectAttempts}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active regions */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Active regions</SectionLabel>
          {regionsQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading regions…</p>
          ) : regionsQ.error ? (
            <p className="text-sm text-destructive">
              Failed to load regions: {regionsQ.error.message}
            </p>
          ) : !regionsQ.data || regionsQ.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active regions registered.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-3">Key</th>
                    <th className="py-1 pr-3">Name</th>
                    <th className="py-1 pr-3">Primary</th>
                    <th className="py-1 pr-3">Postgres URI</th>
                    <th className="py-1 pr-3">Neo4j URI</th>
                  </tr>
                </thead>
                <tbody>
                  {regionsQ.data.map((r) => (
                    <tr key={r.regionKey} className="border-t">
                      <td className="py-1 pr-3 font-mono">{r.regionKey}</td>
                      <td className="py-1 pr-3">{r.name}</td>
                      <td className="py-1 pr-3">{r.isPrimary ? "yes" : "no"}</td>
                      <td
                        className="py-1 pr-3 font-mono text-xs truncate max-w-[20ch]"
                        title={r.postgresUri}
                      >
                        {r.postgresUri.replace(/:([^:@]+)@/, ":****@")}
                      </td>
                      <td
                        className="py-1 pr-3 font-mono text-xs truncate max-w-[20ch]"
                        title={r.neo4jUri ?? ""}
                      >
                        {r.neo4jUri ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Workspace pins */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Workspace pins</SectionLabel>
          {pinsQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading pins…</p>
          ) : pinsQ.error ? (
            <p className="text-sm text-destructive">
              Failed to load pins: {pinsQ.error.message}
            </p>
          ) : !pinsQ.data || pinsQ.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No workspace pins — every workspace falls back to the primary
              region.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-3">Workspace</th>
                    <th className="py-1 pr-3">Region</th>
                    <th className="py-1 pr-3">Replicated</th>
                    <th className="py-1 pr-3">Updated</th>
                    <th className="py-1 pr-3">Notes</th>
                    <th className="py-1 pr-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {pinsQ.data.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="py-1 pr-3 font-mono">{p.workspaceId}</td>
                      <td className="py-1 pr-3 font-mono">{p.regionKey}</td>
                      <td className="py-1 pr-3">
                        {p.isReplicated ? "yes" : "no"}
                      </td>
                      <td className="py-1 pr-3">{fmtTs(p.updatedAt)}</td>
                      <td className="py-1 pr-3">{p.notes ?? "—"}</td>
                      <td className="py-1 pr-3">
                        <button
                          type="button"
                          className="text-xs underline text-destructive"
                          disabled={removePinMutation.isPending}
                          onClick={() =>
                            removePinMutation.mutate({
                              workspaceId: p.workspaceId,
                            })
                          }
                        >
                          remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pin setter (PR-V1-172) */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Set / update workspace pin</SectionLabel>
          {mutationError ? (
            <p className="text-sm text-destructive">{mutationError}</p>
          ) : null}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="flex flex-col gap-1">
              <span className="font-medium">Workspace ID</span>
              <Input
                type="number"
                min={1}
                value={pinForm.workspaceId}
                onChange={(e) =>
                  setPinForm((f) => ({ ...f, workspaceId: e.target.value }))
                }
                placeholder="e.g. 42"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">Region key</span>
              <Input
                value={pinForm.regionKey}
                onChange={(e) =>
                  setPinForm((f) => ({ ...f, regionKey: e.target.value }))
                }
                placeholder="e.g. us-west-1"
                list="region-admin-region-keys"
              />
              <datalist id="region-admin-region-keys">
                {regionsQ.data?.map((r) => (
                  <option key={r.regionKey} value={r.regionKey} />
                ))}
              </datalist>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={pinForm.isReplicated}
                onChange={(e) =>
                  setPinForm((f) => ({ ...f, isReplicated: e.target.checked }))
                }
              />
              <span className="font-medium">Replicated</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">Notes</span>
              <Input
                value={pinForm.notes}
                onChange={(e) =>
                  setPinForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="runbook annotation"
              />
            </label>
          </div>
          <Button
            type="button"
            disabled={
              setPinMutation.isPending ||
              !pinForm.workspaceId ||
              !pinForm.regionKey
            }
            onClick={() => {
              const wsId = Number.parseInt(pinForm.workspaceId, 10);
              if (!Number.isFinite(wsId) || wsId <= 0) {
                setMutationError("Workspace ID must be a positive integer");
                return;
              }
              setPinMutation.mutate({
                workspaceId: wsId,
                regionKey: pinForm.regionKey,
                isReplicated: pinForm.isReplicated,
                notes: pinForm.notes.length > 0 ? pinForm.notes : null,
              });
            }}
          >
            {setPinMutation.isPending ? "Saving…" : "Set / update pin"}
          </Button>
        </CardContent>
      </Card>

      <WorkspaceLocationLookupCard />
    </div>
  );
}

/**
 * PR-V1-183: workspace-location lookup card. Operator enters a
 * workspaceId; we return the resolved regionKey + pinSource so they
 * can confirm where a workspace lives without writing SQL.
 *
 * Lazy enabled — only fires the query when the operator presses
 * "Look up", so changing the input doesn't spam the cache.
 */
function WorkspaceLocationLookupCard() {
  const [workspaceIdInput, setWorkspaceIdInput] = useState<string>("");
  const [submittedId, setSubmittedId] = useState<number | null>(null);
  const lookupQ = trpc.agentStudio.region.lookupWorkspaceRegion.useQuery(
    { workspaceId: submittedId ?? -1 },
    { enabled: submittedId !== null, refetchOnWindowFocus: false },
  );
  const parsed = Number.parseInt(workspaceIdInput, 10);
  const inputValid = Number.isFinite(parsed) && parsed > 0;
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Workspace location lookup</SectionLabel>
        <p className="text-xs text-muted-foreground">
          Cache-only resolution: returns the regionKey the routing shim
          would currently pick for this workspace. No DB roundtrip.
        </p>
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-medium"
              htmlFor="region-lookup-workspace-id"
            >
              Workspace ID
            </label>
            <input
              id="region-lookup-workspace-id"
              type="number"
              min={1}
              className="w-32 border rounded px-2 py-1 text-sm"
              value={workspaceIdInput}
              onChange={(e) => setWorkspaceIdInput(e.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            data-testid="region-lookup-submit"
            disabled={!inputValid || lookupQ.isFetching}
            onClick={() => {
              if (inputValid) setSubmittedId(parsed);
            }}
          >
            {lookupQ.isFetching ? "Looking up…" : "Look up"}
          </Button>
        </div>
        {submittedId !== null && lookupQ.data ? (
          <div
            className="text-sm space-y-1"
            data-testid="region-lookup-result"
          >
            <div>
              <span className="font-medium">workspaceId:</span>{" "}
              <span className="font-mono">{lookupQ.data.workspaceId}</span>
            </div>
            <div>
              <span className="font-medium">regionKey:</span>{" "}
              <span className="font-mono">
                {lookupQ.data.regionKey ?? "(none)"}
              </span>
            </div>
            <div>
              <span className="font-medium">pinSource:</span>{" "}
              <span
                className={`font-mono ${lookupQ.data.pinSource === "no-active-region" ? "text-destructive" : ""}`}
              >
                {lookupQ.data.pinSource}
              </span>
            </div>
            <div>
              <span className="font-medium">pinExists:</span>{" "}
              <span className="font-mono">
                {String(lookupQ.data.pinExists)}
              </span>
            </div>
            <div>
              <span className="font-medium">cacheIsWarm:</span>{" "}
              <span className="font-mono">
                {String(lookupQ.data.cacheIsWarm)}
              </span>
            </div>
          </div>
        ) : submittedId !== null && lookupQ.error ? (
          <p className="text-sm text-destructive">
            Lookup failed: {lookupQ.error.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
