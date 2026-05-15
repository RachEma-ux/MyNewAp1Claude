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

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";

import { SectionLabel } from "./ui";

function fmtTs(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").replace(/\..+$/, "Z");
}

export function RegionAdminPanel() {
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
