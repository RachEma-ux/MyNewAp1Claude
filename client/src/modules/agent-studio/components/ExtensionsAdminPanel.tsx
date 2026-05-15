/**
 * Extensions Admin panel — V1+ Phase 18 follow-up. PR-V1-163.
 *
 * Operator surface for the extensions admin tRPC router (#913).
 * Renders a single workspace's installed extensions in a table with
 * status badge + governance metadata. Read-only — install / approve
 * / setStatus mutations are exposed via the tRPC router (#913) but
 * not from this panel (operator install flow is rare + sensitive;
 * a dedicated install wizard is a separate slice).
 *
 * Pattern mirrors #908 RegionAdminPanel — small focused panel with
 * its own data fetch, mounted by a slim wrapper page.
 */

import React, { useState } from "react";

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";

import { SectionLabel } from "./ui";

const EXTENSION_GOVERNANCE_STATUSES = [
  "pending_approval",
  "approved",
  "rejected",
  "disabled",
  "revoked",
] as const;
type ExtensionGovernanceStatus =
  (typeof EXTENSION_GOVERNANCE_STATUSES)[number];

function fmtTs(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").replace(/\..+$/, "Z");
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "approved":
      return "text-emerald-600 dark:text-emerald-400";
    case "pending_approval":
      return "text-amber-600 dark:text-amber-400";
    case "rejected":
    case "revoked":
      return "text-destructive";
    case "disabled":
      return "text-muted-foreground";
    default:
      return "";
  }
}

interface Props {
  readonly workspaceId: number;
}

export function ExtensionsAdminPanel({ workspaceId }: Props) {
  const utils = trpc.useUtils();
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [actorUserId, setActorUserId] = useState<string>("");
  // PR-V1-203: per-row config drill-down. `config` is already on
  // `ExtensionRecord` (returned by `listExtensionsByWorkspace`) so
  // no extra fetch is needed — just toggle inline expansion.
  const [expandedConfigId, setExpandedConfigId] = useState<number | null>(
    null,
  );
  // PR-V1-204: per-row invocation `details` drill-down. The recent
  // log payload does NOT include `details` (could be large per row);
  // fetch on-demand via the new `getInvocationById` query.
  const [expandedInvocationId, setExpandedInvocationId] = useState<
    number | null
  >(null);

  function refreshList() {
    void utils.agentStudio.extensions.list.invalidate({ workspaceId });
    void utils.agentStudio.extensions.workspaceInvocationSummaries.invalidate({
      workspaceId,
    });
    void utils.agentStudio.extensions.recentInvocations.invalidate({
      workspaceId,
    });
  }
  function onMutationSuccess() {
    setMutationError(null);
    refreshList();
  }
  function onMutationError(err: { message: string }) {
    setMutationError(err.message);
  }

  const approveMutation = trpc.agentStudio.extensions.approve.useMutation({
    onSuccess: onMutationSuccess,
    onError: onMutationError,
  });
  const setStatusMutation =
    trpc.agentStudio.extensions.setStatus.useMutation({
      onSuccess: onMutationSuccess,
      onError: onMutationError,
    });
  const uninstallMutation =
    trpc.agentStudio.extensions.uninstall.useMutation({
      onSuccess: onMutationSuccess,
      onError: onMutationError,
    });

  const listQ = trpc.agentStudio.extensions.list.useQuery(
    { workspaceId },
    { refetchOnWindowFocus: false },
  );
  // PR-V1-181: per-extension invocation telemetry, joined into the
  // table by extensionId. Refetches on the same cadence as `list`
  // (mutation success → refreshList → both invalidate).
  const summariesQ =
    trpc.agentStudio.extensions.workspaceInvocationSummaries.useQuery(
      { workspaceId },
      { refetchOnWindowFocus: false },
    );
  const summaryByExtId = new Map<
    number,
    {
      totalInvocations: number;
      allowedCount: number;
      deniedCount: number;
      lastInvokedAt: Date | string | null;
    }
  >();
  if (summariesQ.data) {
    for (const s of summariesQ.data) {
      summaryByExtId.set(s.extensionId, {
        totalInvocations: s.totalInvocations,
        allowedCount: s.allowedCount,
        deniedCount: s.deniedCount,
        lastInvokedAt: s.lastInvokedAt,
      });
    }
  }

  // PR-V1-182: operator activity feed. Filter dropdown lets the
  // operator narrow to a single extension; `undefined` ⇒ workspace-
  // wide. Limit fixed at 50 — sufficient for "recent" without
  // becoming a paged log viewer.
  const [recentFilterExtId, setRecentFilterExtId] = useState<string>("");
  const recentExtId =
    recentFilterExtId === "" ? undefined : Number.parseInt(recentFilterExtId, 10);
  const recentQ = trpc.agentStudio.extensions.recentInvocations.useQuery(
    {
      workspaceId,
      extensionId: Number.isFinite(recentExtId) ? recentExtId : undefined,
      limit: 50,
    },
    { refetchOnWindowFocus: false },
  );
  // PR-V1-204: lazy-fetched per-invocation details. Same pattern as
  // publish-execution detail drill-down (#940).
  const invocationDetailQ =
    trpc.agentStudio.extensions.getInvocationById.useQuery(
      { invocationId: expandedInvocationId ?? -1 },
      {
        enabled: expandedInvocationId !== null,
        refetchOnWindowFocus: false,
      },
    );
  const extensionKeyById = new Map<number, string>();
  if (listQ.data) {
    for (const e of listQ.data) extensionKeyById.set(e.id, e.extensionKey);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>
            Installed extensions (workspace {workspaceId})
          </SectionLabel>
          {/* PR-V1-210: status breakdown above the table — same
              aggregate-summary pattern as #957–#960. pending_approval
              > 0 → amber, rejected/revoked > 0 → destructive, the
              others muted. */}
          {listQ.data && listQ.data.length > 0 ? (
            <p
              className="text-xs text-muted-foreground"
              data-testid="extensions-list-aggregate-summary"
            >
              {(() => {
                let approved = 0;
                let pending = 0;
                let rejected = 0;
                let disabled = 0;
                let revoked = 0;
                for (const ext of listQ.data) {
                  switch (ext.governanceStatus) {
                    case "approved":
                      approved += 1;
                      break;
                    case "pending_approval":
                      pending += 1;
                      break;
                    case "rejected":
                      rejected += 1;
                      break;
                    case "disabled":
                      disabled += 1;
                      break;
                    case "revoked":
                      revoked += 1;
                      break;
                  }
                }
                return (
                  <>
                    <span className="font-medium">Installed:</span>{" "}
                    <span className="font-mono">{listQ.data.length}</span>{" "}
                    total —{" "}
                    <span className="font-mono">{approved}</span> approved
                    {" / "}
                    <span
                      className={
                        pending > 0
                          ? "text-amber-600 dark:text-amber-400"
                          : ""
                      }
                    >
                      <span className="font-mono">{pending}</span> pending
                    </span>
                    {" / "}
                    <span
                      className={
                        rejected + revoked > 0 ? "text-destructive" : ""
                      }
                    >
                      <span className="font-mono">{rejected}</span> rejected /{" "}
                      <span className="font-mono">{revoked}</span> revoked
                    </span>
                    {" / "}
                    <span className="font-mono">{disabled}</span> disabled
                  </>
                );
              })()}
            </p>
          ) : null}
          <div className="flex items-center gap-2 text-sm">
            <label
              className="font-medium"
              htmlFor="extensions-admin-actor-user-id"
            >
              Actor user ID:
            </label>
            <input
              id="extensions-admin-actor-user-id"
              type="number"
              min={1}
              className="w-24 border rounded px-2 py-1"
              value={actorUserId}
              onChange={(e) => setActorUserId(e.target.value)}
              placeholder="for approve"
            />
            {mutationError ? (
              <span className="text-destructive">{mutationError}</span>
            ) : null}
          </div>
          {listQ.isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading extensions…
            </p>
          ) : listQ.error ? (
            <p className="text-sm text-destructive">
              Failed to load extensions: {listQ.error.message}
            </p>
          ) : !listQ.data || listQ.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No extensions installed in this workspace.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-3">Key</th>
                    <th className="py-1 pr-3">Name</th>
                    <th className="py-1 pr-3">Version</th>
                    <th className="py-1 pr-3">Status</th>
                    <th className="py-1 pr-3">Lanes</th>
                    <th className="py-1 pr-3">Tools</th>
                    <th
                      className="py-1 pr-3"
                      title="approvedAt (or disabledAt when status=disabled/revoked); hover the cell for the full installed/approved/disabled lifecycle"
                    >
                      Lifecycle
                    </th>
                    <th
                      className="py-1 pr-3"
                      title="Actor user IDs: installed / approved / disabled"
                    >
                      Actors
                    </th>
                    <th
                      className="py-1 pr-3"
                      title="Invocations: total / allowed / denied"
                    >
                      Invocations
                    </th>
                    <th className="py-1 pr-3">Last invoked</th>
                    <th className="py-1 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {listQ.data.map((ext) => {
                    const s = summaryByExtId.get(ext.id);
                    const isConfigExpanded = expandedConfigId === ext.id;
                    return (
                    <React.Fragment key={ext.id}>
                    <tr className="border-t">
                      <td className="py-1 pr-3 font-mono text-xs">
                        {ext.extensionKey}
                      </td>
                      <td className="py-1 pr-3">
                        {ext.name}
                        {/* PR-V1-197: signing indicator. Surfaces
                            an unsigned extension as an inline
                            destructive badge so the operator
                            doesn't have to inspect the signing
                            key id field separately to spot
                            dev-mode / unsigned bundles. Signed
                            extensions show the key id as a small
                            muted chip. */}
                        {ext.signingKeyId == null ? (
                          <span
                            className="ml-1 text-xs text-destructive font-mono"
                            data-testid={`extension-row-unsigned-${ext.id}`}
                            title="No signing key id — dev-mode or unsigned bundle"
                          >
                            [unsigned]
                          </span>
                        ) : (
                          <span
                            className="ml-1 text-xs text-muted-foreground font-mono"
                            data-testid={`extension-row-signing-${ext.id}`}
                            title={`Signed by key ${ext.signingKeyId}`}
                          >
                            ({ext.signingKeyId})
                          </span>
                        )}
                      </td>
                      <td className="py-1 pr-3 font-mono text-xs">
                        {ext.version}
                      </td>
                      <td
                        className={`py-1 pr-3 ${statusBadgeClass(ext.governanceStatus)}`}
                      >
                        {ext.governanceStatus}
                      </td>
                      <td className="py-1 pr-3 font-mono text-xs">
                        {ext.capabilityLanes.join(", ")}
                      </td>
                      <td
                        className="py-1 pr-3 font-mono text-xs truncate max-w-[20ch]"
                        title={ext.declaredToolNames.join(", ")}
                      >
                        {ext.declaredToolNames.length === 0
                          ? "—"
                          : `${ext.declaredToolNames.length} tool${ext.declaredToolNames.length === 1 ? "" : "s"}`}
                      </td>
                      <td
                        className="py-1 pr-3"
                        data-testid={`extension-row-approved-${ext.id}`}
                        title={`installed ${fmtTs(ext.installedAt)} / approved ${fmtTs(ext.approvedAt)} / disabled ${fmtTs(ext.disabledAt)}`}
                      >
                        {/* PR-V1-198: when the extension is disabled
                            or revoked, show the disabledAt instead of
                            the approvedAt so the operator sees the
                            most-recently-relevant timestamp inline.
                            The tooltip carries all three for the full
                            lifecycle audit. */}
                        {ext.governanceStatus === "disabled" ||
                        ext.governanceStatus === "revoked"
                          ? fmtTs(ext.disabledAt)
                          : fmtTs(ext.approvedAt)}
                      </td>
                      <td
                        className="py-1 pr-3 font-mono text-xs whitespace-nowrap"
                        data-testid={`extension-row-actors-${ext.id}`}
                        title={`installed by user ${ext.installedByUserId ?? "—"} / approved by ${ext.approvedByUserId ?? "—"} / disabled by ${ext.disabledByUserId ?? "—"}`}
                      >
                        {`${ext.installedByUserId ?? "—"} / ${ext.approvedByUserId ?? "—"} / ${ext.disabledByUserId ?? "—"}`}
                      </td>
                      <td
                        className="py-1 pr-3 font-mono text-xs"
                        data-testid={`extension-row-invocations-${ext.id}`}
                      >
                        {s
                          ? `${s.totalInvocations} (${s.allowedCount}/${s.deniedCount})`
                          : "—"}
                      </td>
                      <td className="py-1 pr-3">
                        {s ? fmtTs(s.lastInvokedAt) : "—"}
                      </td>
                      <td className="py-1 pr-3 space-x-2">
                        {ext.governanceStatus === "pending_approval" ? (
                          <button
                            type="button"
                            className="text-xs underline"
                            disabled={approveMutation.isPending}
                            onClick={() => {
                              const uid = Number.parseInt(actorUserId, 10);
                              if (!Number.isFinite(uid) || uid <= 0) {
                                setMutationError(
                                  "approve requires a positive integer Actor user ID",
                                );
                                return;
                              }
                              approveMutation.mutate({
                                extensionId: ext.id,
                                approvedByUserId: uid,
                              });
                            }}
                          >
                            approve
                          </button>
                        ) : null}
                        <select
                          className="text-xs border rounded px-1 py-0.5"
                          value={ext.governanceStatus}
                          disabled={setStatusMutation.isPending}
                          onChange={(e) => {
                            const next =
                              e.target.value as ExtensionGovernanceStatus;
                            if (next === ext.governanceStatus) return;
                            setStatusMutation.mutate({
                              extensionId: ext.id,
                              status: next,
                            });
                          }}
                        >
                          {EXTENSION_GOVERNANCE_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="text-xs underline text-destructive"
                          disabled={uninstallMutation.isPending}
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Hard uninstall extension ${ext.extensionKey} (id=${ext.id})? This deletes the row; audit history is preserved separately. To keep the row for audit, use setStatus=revoked instead.`,
                              )
                            ) {
                              return;
                            }
                            uninstallMutation.mutate({ extensionId: ext.id });
                          }}
                        >
                          uninstall
                        </button>
                        <button
                          type="button"
                          className="text-xs underline"
                          data-testid={`extension-row-config-toggle-${ext.id}`}
                          onClick={() =>
                            setExpandedConfigId(
                              isConfigExpanded ? null : ext.id,
                            )
                          }
                        >
                          {isConfigExpanded ? "hide config" : "view config"}
                        </button>
                      </td>
                    </tr>
                    {isConfigExpanded ? (
                      <tr
                        className="bg-muted/30"
                        data-testid={`extension-row-config-row-${ext.id}`}
                      >
                        <td colSpan={11} className="p-2">
                          <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(ext.config ?? {}, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    ) : null}
                    </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Recent invocations</SectionLabel>
          {/* PR-V1-207: workspace-aggregate invocation health summary
              above the filter row — symmetric with the publish
              executions aggregate (#957). Sums the per-extension
              workspaceInvocationSummaries data. denied > 0 →
              text-destructive so an operator sees capability-check
              failures at a glance. */}
          {summariesQ.data && summariesQ.data.length > 0 ? (
            <p
              className="text-xs text-muted-foreground"
              data-testid="extensions-invocations-aggregate-summary"
            >
              {(() => {
                let total = 0;
                let allowed = 0;
                let denied = 0;
                for (const s of summariesQ.data) {
                  total += s.totalInvocations;
                  allowed += s.allowedCount;
                  denied += s.deniedCount;
                }
                return (
                  <>
                    <span className="font-medium">Workspace totals:</span>{" "}
                    <span className="font-mono">{total}</span> invocations —{" "}
                    <span
                      className={
                        allowed > 0 ? "text-emerald-600 dark:text-emerald-400" : ""
                      }
                    >
                      <span className="font-mono">{allowed}</span> allowed
                    </span>
                    {" / "}
                    <span
                      className={denied > 0 ? "text-destructive" : ""}
                    >
                      <span className="font-mono">{denied}</span> denied
                    </span>
                  </>
                );
              })()}
            </p>
          ) : null}
          <div className="flex items-center gap-2 text-sm">
            <label
              className="font-medium"
              htmlFor="extensions-recent-filter-extid"
            >
              Filter by extension:
            </label>
            <select
              id="extensions-recent-filter-extid"
              className="text-xs border rounded px-1 py-0.5"
              value={recentFilterExtId}
              onChange={(e) => setRecentFilterExtId(e.target.value)}
            >
              <option value="">(all)</option>
              {(listQ.data ?? []).map((ext) => (
                <option key={ext.id} value={String(ext.id)}>
                  {ext.extensionKey}
                </option>
              ))}
            </select>
          </div>
          {recentQ.isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading recent invocations…
            </p>
          ) : recentQ.error ? (
            <p className="text-sm text-destructive">
              Failed to load recent invocations: {recentQ.error.message}
            </p>
          ) : !recentQ.data || recentQ.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No invocations recorded for this workspace yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              {/* PR-V1-214: count label above the invocations log.
                  Same pattern as publish executions count label
                  (#964). Window cap = 50 by default. */}
              <p
                className="text-xs text-muted-foreground mb-1"
                data-testid="extensions-recent-invocations-count-label"
              >
                Showing{" "}
                <span className="font-mono">{recentQ.data.length}</span>{" "}
                most-recent invocation
                {recentQ.data.length === 1 ? "" : "s"}
                {recentQ.data.length >= 50 ? " (capped at 50)" : ""}.
              </p>
              <table
                className="w-full text-sm border-collapse"
                data-testid="extensions-recent-invocations-table"
              >
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-3">When</th>
                    <th className="py-1 pr-3">Extension</th>
                    <th className="py-1 pr-3">Lane</th>
                    <th className="py-1 pr-3">Tool</th>
                    <th className="py-1 pr-3">Capability</th>
                    <th className="py-1 pr-3">OK?</th>
                    <th className="py-1 pr-3">Error</th>
                    <th className="py-1 pr-3">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {recentQ.data.map((r) => {
                    const isInvDetailExpanded = expandedInvocationId === r.id;
                    return (
                      <React.Fragment key={r.id}>
                        <tr className="border-t">
                          <td className="py-1 pr-3 font-mono text-xs whitespace-nowrap">
                            {fmtTs(r.invokedAt)}
                          </td>
                          <td className="py-1 pr-3 font-mono text-xs">
                            {extensionKeyById.get(r.extensionId) ??
                              `#${r.extensionId}`}
                          </td>
                          <td className="py-1 pr-3 font-mono text-xs">
                            {r.lane}
                          </td>
                          <td className="py-1 pr-3 font-mono text-xs">
                            {r.invokedToolName ?? "—"}
                          </td>
                          <td
                            className={`py-1 pr-3 font-mono text-xs ${r.capabilityCheck === "allowed" ? "" : "text-destructive"}`}
                          >
                            {r.capabilityCheck}
                          </td>
                          <td className="py-1 pr-3">
                            {r.succeeded === null
                              ? "—"
                              : r.succeeded
                                ? "✓"
                                : "✗"}
                          </td>
                          <td
                            className="py-1 pr-3 text-xs truncate max-w-[40ch]"
                            title={r.errorMessage ?? undefined}
                          >
                            {r.errorMessage ?? ""}
                          </td>
                          <td className="py-1 pr-3">
                            <button
                              type="button"
                              className="text-xs underline"
                              data-testid={`extension-invocation-details-toggle-${r.id}`}
                              onClick={() =>
                                setExpandedInvocationId(
                                  isInvDetailExpanded ? null : r.id,
                                )
                              }
                            >
                              {isInvDetailExpanded ? "hide" : "view"}
                            </button>
                          </td>
                        </tr>
                        {isInvDetailExpanded ? (
                          <tr
                            className="bg-muted/30"
                            data-testid={`extension-invocation-details-row-${r.id}`}
                          >
                            <td colSpan={8} className="p-2">
                              {invocationDetailQ.isLoading ? (
                                <p className="text-xs text-muted-foreground">
                                  Loading details…
                                </p>
                              ) : invocationDetailQ.error ? (
                                <p className="text-xs text-destructive">
                                  Failed to load:{" "}
                                  {invocationDetailQ.error.message}
                                </p>
                              ) : !invocationDetailQ.data ? (
                                <p className="text-xs text-muted-foreground">
                                  Invocation not found.
                                </p>
                              ) : (
                                <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                                  {JSON.stringify(
                                    invocationDetailQ.data.details ?? {},
                                    null,
                                    2,
                                  )}
                                </pre>
                              )}
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
