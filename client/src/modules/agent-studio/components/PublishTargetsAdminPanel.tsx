/**
 * Publish-targets admin panel — PR-V1-186.
 *
 * Operator surface for the publish-targets registry + recent
 * executions ledger. Read-only first slice — mutations land in a
 * follow-up.
 */

import React, { useState } from "react";

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";

import { SectionLabel } from "./ui";

const PUBLISH_EXECUTION_STATUSES = [
  "pending",
  "succeeded",
  "failed",
] as const;
type PublishExecutionStatus = (typeof PUBLISH_EXECUTION_STATUSES)[number];

function fmtTs(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").replace(/\..+$/, "Z");
}

/**
 * PR-V1-194: format duration between two timestamps for the
 * executions table. Operator-friendly format: "—" when either side
 * is missing (pending row), "<1s" / "Xs" / "Xm Ys" otherwise.
 */
function fmtDuration(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
): string {
  if (!start || !end) return "—";
  const s = typeof start === "string" ? new Date(start) : start;
  const e = typeof end === "string" ? new Date(end) : end;
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "—";
  const ms = e.getTime() - s.getTime();
  if (ms < 0) return "—";
  if (ms < 1000) return "<1s";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function statusClass(status: string): string {
  switch (status) {
    case "succeeded":
      return "text-emerald-600 dark:text-emerald-400";
    case "pending":
      return "text-amber-600 dark:text-amber-400";
    case "failed":
      return "text-destructive";
    default:
      return "";
  }
}

export function PublishTargetsAdminPanel() {
  const utils = trpc.useUtils();
  const [targetFilter, setTargetFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [mutationError, setMutationError] = useState<string | null>(null);

  const targetsQ =
    trpc.agentStudio.publishTargets.listTargets.useQuery(undefined, {
      refetchOnWindowFocus: false,
    });

  // PR-V1-187: enable/disable toggle. Disabling refuses dispatch
  // via `PublishTargetDisabledError` in executePublish.
  const setEnabledMutation =
    trpc.agentStudio.publishTargets.setEnabled.useMutation({
      onSuccess: () => {
        setMutationError(null);
        void utils.agentStudio.publishTargets.listTargets.invalidate();
        void utils.agentStudio.publishTargets.executionSummaries.invalidate();
      },
      onError: (err) => setMutationError(err.message),
    });

  // PR-V1-193: on-demand single-target config view. Same
  // lazy-enabled pattern as the per-execution detail below.
  const [expandedTargetId, setExpandedTargetId] = useState<number | null>(
    null,
  );
  const targetDetailQ = trpc.agentStudio.publishTargets.getTargetById.useQuery(
    { targetId: expandedTargetId ?? -1 },
    {
      enabled: expandedTargetId !== null,
      refetchOnWindowFocus: false,
    },
  );

  // PR-V1-189: on-demand single-execution detail. UI tracks the
  // currently-expanded executionId; the query is lazy-enabled so
  // we don't pay the JSON-fetch cost unless the operator clicks.
  const [expandedExecutionId, setExpandedExecutionId] = useState<number | null>(
    null,
  );
  const detailQ =
    trpc.agentStudio.publishTargets.getExecutionById.useQuery(
      { executionId: expandedExecutionId ?? -1 },
      {
        enabled: expandedExecutionId !== null,
        refetchOnWindowFocus: false,
      },
    );

  // PR-V1-188: per-target execution health summary joined into
  // the registry table by targetId. Zero-filled service-side so
  // every registry row has a corresponding summary entry.
  const summariesQ =
    trpc.agentStudio.publishTargets.executionSummaries.useQuery(undefined, {
      refetchOnWindowFocus: false,
    });
  const summaryByTargetId = new Map<
    number,
    {
      totalExecutions: number;
      succeededCount: number;
      pendingCount: number;
      failedCount: number;
      lastExecutedAt: Date | string | null;
    }
  >();
  if (summariesQ.data) {
    for (const s of summariesQ.data) {
      summaryByTargetId.set(s.targetId, {
        totalExecutions: s.totalExecutions,
        succeededCount: s.succeededCount,
        pendingCount: s.pendingCount,
        failedCount: s.failedCount,
        lastExecutedAt: s.lastExecutedAt,
      });
    }
  }

  const parsedTargetFilter = Number.parseInt(targetFilter, 10);
  const recentQ =
    trpc.agentStudio.publishTargets.listRecentExecutions.useQuery(
      {
        targetId:
          targetFilter === "" || !Number.isFinite(parsedTargetFilter)
            ? undefined
            : parsedTargetFilter,
        status:
          statusFilter === ""
            ? undefined
            : (statusFilter as PublishExecutionStatus),
        limit: 50,
      },
      { refetchOnWindowFocus: false },
    );

  const targetKeyById = new Map<number, string>();
  if (targetsQ.data) {
    for (const t of targetsQ.data) targetKeyById.set(t.id, t.targetKey);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Publish targets (registry)</SectionLabel>
          {/* PR-V1-211: enabled/disabled aggregate above the registry
              table — sixth in the aggregate-summary mini-arc
              (#957-#961). disabled > 0 → text-destructive so
              operators see quiesced targets at a glance. */}
          {targetsQ.data && targetsQ.data.length > 0 ? (
            <p
              className="text-xs text-muted-foreground"
              data-testid="publish-targets-list-aggregate-summary"
            >
              {(() => {
                let enabled = 0;
                let disabled = 0;
                for (const t of targetsQ.data) {
                  if (t.enabled) enabled += 1;
                  else disabled += 1;
                }
                return (
                  <>
                    <span className="font-medium">Targets:</span>{" "}
                    <span className="font-mono">{targetsQ.data.length}</span>{" "}
                    total —{" "}
                    <span className="font-mono">{enabled}</span> enabled
                    {" / "}
                    <span
                      className={disabled > 0 ? "text-destructive" : ""}
                    >
                      <span className="font-mono">{disabled}</span> disabled
                    </span>
                  </>
                );
              })()}
            </p>
          ) : null}
          {/* PR-V1-219: per-targetType breakdown beneath the
              enabled/disabled aggregate. Total tells "how many
              targets"; type breakdown tells "what kind of target". The
              `if (t.targetType in counts)` guard mirrors the canvas
              snapshot kind breakdown (#967) — a future `PublishTargetType`
              enum addition surfaces in the contract-anchor test rather
              than silently being missed in the UI. */}
          {targetsQ.data && targetsQ.data.length > 0 ? (
            <p
              className="text-xs text-muted-foreground"
              data-testid="publish-targets-type-breakdown"
            >
              {(() => {
                const counts: Record<string, number> = {
                  staging_env: 0,
                  remote_vault: 0,
                  external_kb: 0,
                };
                for (const t of targetsQ.data) {
                  if (t.targetType in counts) counts[t.targetType] += 1;
                }
                return (
                  <>
                    <span className="font-medium">By type:</span>{" "}
                    <span className="font-mono">{counts.staging_env}</span>{" "}
                    staging_env
                    {" / "}
                    <span className="font-mono">{counts.remote_vault}</span>{" "}
                    remote_vault
                    {" / "}
                    <span className="font-mono">{counts.external_kb}</span>{" "}
                    external_kb
                  </>
                );
              })()}
            </p>
          ) : null}
          {/* PR-V1-221: never-published count using the existing
              executionSummaries join. A registered target that has
              never received an execution is either misconfigured,
              quiesced, or recently added — operators can spot the
              gap at registry level instead of scanning rows. Amber
              when > 0 to flag investigation without screaming
              destructive-red (a target with no history isn't
              broken — just unused). */}
          {targetsQ.data &&
          targetsQ.data.length > 0 &&
          summariesQ.data ? (
            <p
              className="text-xs text-muted-foreground"
              data-testid="publish-targets-never-published-count"
            >
              {(() => {
                let neverPublished = 0;
                for (const t of targetsQ.data) {
                  const s = summaryByTargetId.get(t.id);
                  if (!s || s.totalExecutions === 0) neverPublished += 1;
                }
                return (
                  <>
                    <span className="font-medium">Never published:</span>{" "}
                    <span
                      className={
                        neverPublished > 0
                          ? "text-amber-600 dark:text-amber-400"
                          : ""
                      }
                    >
                      <span className="font-mono">{neverPublished}</span>{" "}
                      of{" "}
                      <span className="font-mono">{targetsQ.data.length}</span>
                    </span>
                  </>
                );
              })()}
            </p>
          ) : null}
          {targetsQ.isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading targets…
            </p>
          ) : targetsQ.error ? (
            <p className="text-sm text-destructive">
              Failed to load targets: {targetsQ.error.message}
            </p>
          ) : !targetsQ.data || targetsQ.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No publish targets registered.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table
                className="w-full text-sm border-collapse"
                data-testid="publish-targets-table"
              >
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-3">Key</th>
                    <th className="py-1 pr-3">Type</th>
                    <th className="py-1 pr-3">Endpoint</th>
                    <th className="py-1 pr-3">Provider conn</th>
                    <th className="py-1 pr-3">Enabled</th>
                    <th
                      className="py-1 pr-3"
                      title="Executions: total (succeeded/pending/failed)"
                    >
                      Executions
                    </th>
                    <th className="py-1 pr-3">Last execution</th>
                    <th className="py-1 pr-3">Updated</th>
                    <th className="py-1 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {targetsQ.data.map((t) => {
                    const s = summaryByTargetId.get(t.id);
                    return (
                    <React.Fragment key={t.id}>
                    <tr className="border-t">
                      <td className="py-1 pr-3 font-mono text-xs">
                        {t.targetKey}
                      </td>
                      <td className="py-1 pr-3 font-mono text-xs">
                        {t.targetType}
                      </td>
                      <td
                        className="py-1 pr-3 font-mono text-xs truncate max-w-[40ch]"
                        title={t.endpoint}
                      >
                        {t.endpoint}
                      </td>
                      <td className="py-1 pr-3 font-mono text-xs">
                        {t.providerConnectionId ?? "—"}
                      </td>
                      <td
                        className={`py-1 pr-3 ${t.enabled ? "" : "text-destructive"}`}
                      >
                        {t.enabled ? "yes" : "no"}
                      </td>
                      <td
                        className="py-1 pr-3 font-mono text-xs"
                        data-testid={`publish-target-executions-${t.id}`}
                      >
                        {s
                          ? `${s.totalExecutions} (${s.succeededCount}/${s.pendingCount}/${s.failedCount})`
                          : "—"}
                      </td>
                      <td className="py-1 pr-3 font-mono text-xs whitespace-nowrap">
                        {s ? fmtTs(s.lastExecutedAt) : "—"}
                      </td>
                      <td className="py-1 pr-3 font-mono text-xs whitespace-nowrap">
                        {fmtTs(t.updatedAt)}
                      </td>
                      <td className="py-1 pr-3 space-x-2">
                        <button
                          type="button"
                          className="text-xs underline"
                          data-testid={`publish-target-toggle-${t.id}`}
                          disabled={setEnabledMutation.isPending}
                          onClick={() =>
                            setEnabledMutation.mutate({
                              targetId: t.id,
                              enabled: !t.enabled,
                            })
                          }
                        >
                          {t.enabled ? "disable" : "enable"}
                        </button>
                        <button
                          type="button"
                          className="text-xs underline"
                          data-testid={`publish-target-config-toggle-${t.id}`}
                          onClick={() =>
                            setExpandedTargetId(
                              expandedTargetId === t.id ? null : t.id,
                            )
                          }
                        >
                          {expandedTargetId === t.id
                            ? "hide config"
                            : "view config"}
                        </button>
                      </td>
                    </tr>
                    {expandedTargetId === t.id ? (
                      <tr
                        className="bg-muted/30"
                        data-testid={`publish-target-config-row-${t.id}`}
                      >
                        <td colSpan={9} className="p-2">
                          {targetDetailQ.isLoading ? (
                            <p className="text-xs text-muted-foreground">
                              Loading config…
                            </p>
                          ) : targetDetailQ.error ? (
                            <p className="text-xs text-destructive">
                              Failed to load: {targetDetailQ.error.message}
                            </p>
                          ) : !targetDetailQ.data ? (
                            <p className="text-xs text-muted-foreground">
                              Target not found.
                            </p>
                          ) : (
                            <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(
                                targetDetailQ.data.config ?? {},
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
          {mutationError ? (
            <p
              className="text-sm text-destructive"
              data-testid="publish-targets-mutation-error"
            >
              {mutationError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Recent executions</SectionLabel>
          {/* PR-V1-206: workspace-aggregate health summary above the
              recent log. Sums the per-target executionSummaries data
              so operators see at-a-glance whether anything is wrong
              without scrolling through the table.
              PR-V1-223: appended a settled success-rate metric —
              succeeded / (succeeded + failed) as a percentage,
              ignoring pending so the rate isn't suppressed by a
              backlog. Color-mirrors a "≥99% emerald / ≥90% amber /
              else destructive" SLO heuristic that matches the
              existing aggregate's status palette. */}
          {summariesQ.data && summariesQ.data.length > 0 ? (
            <p
              className="text-xs text-muted-foreground"
              data-testid="publish-executions-aggregate-summary"
            >
              {(() => {
                let total = 0;
                let succeeded = 0;
                let pending = 0;
                let failed = 0;
                for (const s of summariesQ.data) {
                  total += s.totalExecutions;
                  succeeded += s.succeededCount;
                  pending += s.pendingCount;
                  failed += s.failedCount;
                }
                const settled = succeeded + failed;
                const rate = settled > 0
                  ? Math.round((succeeded / settled) * 1000) / 10
                  : null;
                const rateClass =
                  rate === null
                    ? ""
                    : rate >= 99
                      ? "text-emerald-600 dark:text-emerald-400"
                      : rate >= 90
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-destructive";
                return (
                  <>
                    <span className="font-medium">Workspace totals:</span>{" "}
                    <span className="font-mono">{total}</span> executions —{" "}
                    <span
                      className={
                        succeeded > 0 ? "text-emerald-600 dark:text-emerald-400" : ""
                      }
                    >
                      <span className="font-mono">{succeeded}</span> succeeded
                    </span>
                    {" / "}
                    <span
                      className={
                        pending > 0 ? "text-amber-600 dark:text-amber-400" : ""
                      }
                    >
                      <span className="font-mono">{pending}</span> pending
                    </span>
                    {" / "}
                    <span
                      className={failed > 0 ? "text-destructive" : ""}
                    >
                      <span className="font-mono">{failed}</span> failed
                    </span>
                    {rate !== null ? (
                      <>
                        {" — "}
                        <span
                          className={rateClass}
                          data-testid="publish-executions-success-rate"
                          title="succeeded / (succeeded + failed) — pending excluded so a backlog doesn't suppress the rate"
                        >
                          <span className="font-mono">{rate}%</span> success
                          rate (settled)
                        </span>
                      </>
                    ) : null}
                  </>
                );
              })()}
            </p>
          ) : null}
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-2">
              <label
                className="font-medium"
                htmlFor="publish-targets-filter-target"
              >
                Target:
              </label>
              <select
                id="publish-targets-filter-target"
                className="text-xs border rounded px-1 py-0.5"
                value={targetFilter}
                onChange={(e) => setTargetFilter(e.target.value)}
              >
                <option value="">(all)</option>
                {(targetsQ.data ?? []).map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.targetKey}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label
                className="font-medium"
                htmlFor="publish-targets-filter-status"
              >
                Status:
              </label>
              <select
                id="publish-targets-filter-status"
                className="text-xs border rounded px-1 py-0.5"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">(any)</option>
                {PUBLISH_EXECUTION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {recentQ.isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading executions…
            </p>
          ) : recentQ.error ? (
            <p className="text-sm text-destructive">
              Failed to load executions: {recentQ.error.message}
            </p>
          ) : !recentQ.data || recentQ.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No executions match the current filter.
            </p>
          ) : (
            <div className="overflow-x-auto">
              {/* PR-V1-213: count label above the executions table.
                  Most-recent N (default 50) with a "+ more" hint when
                  the page is at the cap so operators know they're
                  looking at a window, not the whole history. */}
              <p
                className="text-xs text-muted-foreground mb-1"
                data-testid="publish-executions-count-label"
              >
                Showing{" "}
                <span className="font-mono">{recentQ.data.length}</span>{" "}
                most-recent execution
                {recentQ.data.length === 1 ? "" : "s"}
                {recentQ.data.length >= 50 ? " (capped at 50)" : ""}.
              </p>
              <table
                className="w-full text-sm border-collapse"
                data-testid="publish-targets-executions-table"
              >
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-3">Created</th>
                    <th className="py-1 pr-3">Target</th>
                    <th className="py-1 pr-3">Promotion</th>
                    <th
                      className="py-1 pr-3"
                      title="Frozen source-note version id at dispatch time — anchor for rollback"
                    >
                      Version
                    </th>
                    <th className="py-1 pr-3">Attempt</th>
                    <th className="py-1 pr-3">Status</th>
                    <th
                      className="py-1 pr-3"
                      title="Duration: completedAt - startedAt"
                    >
                      Duration
                    </th>
                    <th
                      className="py-1 pr-3"
                      title="First 12 chars of payload digest — used by executePublish for idempotency"
                    >
                      Digest
                    </th>
                    <th className="py-1 pr-3">Upstream</th>
                    <th className="py-1 pr-3">Error</th>
                    <th className="py-1 pr-3">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {recentQ.data.map((r) => {
                    const isExpanded = expandedExecutionId === r.id;
                    return (
                      <React.Fragment key={r.id}>
                        <tr className="border-t">
                          <td className="py-1 pr-3 font-mono text-xs whitespace-nowrap">
                            {fmtTs(r.createdAt)}
                          </td>
                          <td className="py-1 pr-3 font-mono text-xs">
                            {targetKeyById.get(r.targetId) ?? `#${r.targetId}`}
                          </td>
                          <td className="py-1 pr-3 font-mono text-xs">
                            {r.sourcePromotionId}
                          </td>
                          <td
                            className="py-1 pr-3 font-mono text-xs truncate max-w-[16ch]"
                            data-testid={`publish-execution-version-${r.id}`}
                            title={r.sourceVersionId ?? undefined}
                          >
                            {r.sourceVersionId
                              ? r.sourceVersionId.slice(0, 12)
                              : "—"}
                          </td>
                          <td className="py-1 pr-3 font-mono text-xs">
                            {r.attempt}
                          </td>
                          <td
                            className={`py-1 pr-3 font-mono text-xs ${statusClass(r.status)}`}
                          >
                            {r.status}
                          </td>
                          <td
                            className="py-1 pr-3 font-mono text-xs whitespace-nowrap"
                            data-testid={`publish-execution-duration-${r.id}`}
                          >
                            {fmtDuration(r.startedAt, r.completedAt)}
                          </td>
                          <td
                            className="py-1 pr-3 font-mono text-xs"
                            data-testid={`publish-execution-digest-${r.id}`}
                            title={r.payloadDigest ?? undefined}
                          >
                            {r.payloadDigest
                              ? r.payloadDigest.slice(0, 12)
                              : "—"}
                          </td>
                          <td
                            className="py-1 pr-3 font-mono text-xs truncate max-w-[24ch]"
                            title={r.upstreamArtifactId ?? undefined}
                          >
                            {r.upstreamArtifactId ?? "—"}
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
                              data-testid={`publish-execution-details-toggle-${r.id}`}
                              onClick={() =>
                                setExpandedExecutionId(
                                  isExpanded ? null : r.id,
                                )
                              }
                            >
                              {isExpanded ? "hide" : "view"}
                            </button>
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr
                            className="bg-muted/30"
                            data-testid={`publish-execution-details-row-${r.id}`}
                          >
                            <td colSpan={10} className="p-2">
                              {detailQ.isLoading ? (
                                <p className="text-xs text-muted-foreground">
                                  Loading details…
                                </p>
                              ) : detailQ.error ? (
                                <p className="text-xs text-destructive">
                                  Failed to load: {detailQ.error.message}
                                </p>
                              ) : !detailQ.data ? (
                                <p className="text-xs text-muted-foreground">
                                  Execution not found.
                                </p>
                              ) : (
                                <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                                  {JSON.stringify(
                                    detailQ.data.details ?? {},
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
