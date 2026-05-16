/**
 * Graph Quality findings panel — T-F.82 (T-F.4-α).
 *
 * First operator UI for the graph-quality findings stack. Consumes
 * the existing `agentStudio.graphQuality.getStats` tRPC procedure
 * (server-side ladder shipped earlier) — no new server work needed
 * for this α slice.
 *
 * Renders three Cards in sequence:
 *   1. **Totals** — findings / scans / agent runs counts.
 *   2. **Findings by status** — bucketed counts (open, resolved,
 *      dismissed, applied — server's emitted buckets).
 *   3. **Findings by severity** — bucketed counts (critical, major,
 *      minor — server's emitted buckets).
 *
 * Why α-shell now: the `getStats` server procedure has no client
 * consumer despite shipping months ago — this slice closes that gap
 * with a single-fetch dashboard. Follow-up slices can add the
 * findings list / approve+apply / dismiss affordances (existing
 * `convertFindingToProposal`, `dismissFinding`, `bulkDismissFindings`
 * tRPC procedures are already in place).
 */

import { Fragment, useState } from "react";

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";

import { SectionLabel } from "./ui";

/**
 * T-F.84 (T-F.4-γ): server-side drill-in filters on the findings
 * list. Mirrors the lens-browser T-F.72/T-F.73 visibility/typeKey
 * filter shape but server-side because the `listFindings` LIMIT cap
 * would silently filter to zero rows under client-side narrowing
 * once the dataset grows past 50.
 */
const SEVERITY_VALUES = ["low", "medium", "high", "critical"] as const;
const STATUS_VALUES = ["open", "triaged", "applied", "dismissed"] as const;
type SeverityFilter = (typeof SEVERITY_VALUES)[number] | null;
type StatusFilter = (typeof STATUS_VALUES)[number] | null;

interface Bucket {
  readonly value: string;
  readonly count: number;
}

function renderBucketList(buckets: ReadonlyArray<Bucket>, emptyHint: string) {
  if (buckets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">{emptyHint}</p>
    );
  }
  return (
    <ul className="space-y-1 text-sm" data-testid="graph-quality-bucket-list">
      {buckets.map((b) => (
        <li
          key={b.value}
          className="flex items-baseline justify-between"
          data-testid={`graph-quality-bucket-${b.value}`}
        >
          <span className="font-mono text-muted-foreground">{b.value}</span>
          <span className="font-medium">{b.count.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}

const FINDINGS_LIST_LIMIT = 50;

export function GraphQualityFindingsPanel() {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);
  // T-F.85: per-row dismiss error surface — sticks the most recent
  // mutation failure (network / not-found / state-conflict) inline
  // so the operator gets feedback without a global toast.
  const [dismissError, setDismissError] = useState<string | null>(null);
  // T-F.86: per-row audit-trail expansion. Only one row's trail is
  // open at a time — keeps the operator surface focused + makes the
  // trail tRPC query gated (enabled only when a row is expanded).
  const [expandedFindingId, setExpandedFindingId] = useState<number | null>(
    null,
  );
  // T-F.87: per-row "dismiss with reason" textarea expansion. Only
  // one row's reason editor is open at a time; the textarea content
  // lives next to it so cancel discards cleanly and confirm submits
  // the optional `reason` field through the existing dismissFinding
  // mutation. Mirrors `expandedFindingId` shape so the two surfaces
  // are mutually exclusive — opening the reason editor closes any
  // trail expansion and vice-versa.
  const [reasonFindingId, setReasonFindingId] = useState<number | null>(null);
  const [reasonDraft, setReasonDraft] = useState<string>("");
  // T-F.88: per-row triage / convert-to-proposal inline editor —
  // mirrors the η dismiss editor shape but routes the rationale
  // field through convertFindingToProposal. Parallel state slices
  // keep the two editors mutually exclusive: opening triage closes
  // dismiss (and vice-versa), and both close the trail expansion.
  const [triageFindingId, setTriageFindingId] = useState<number | null>(null);
  const [triageDraft, setTriageDraft] = useState<string>("");
  const [triageError, setTriageError] = useState<string | null>(null);
  function openReasonEditor(findingId: number) {
    setReasonFindingId(findingId);
    setReasonDraft("");
    setTriageFindingId(null);
    setTriageDraft("");
    setExpandedFindingId(null);
  }
  function closeReasonEditor() {
    setReasonFindingId(null);
    setReasonDraft("");
  }
  function openTriageEditor(findingId: number) {
    setTriageFindingId(findingId);
    setTriageDraft("");
    setReasonFindingId(null);
    setReasonDraft("");
    setExpandedFindingId(null);
  }
  function closeTriageEditor() {
    setTriageFindingId(null);
    setTriageDraft("");
  }
  const hasAnyFilter = severityFilter !== null || statusFilter !== null;
  function clearAllFilters() {
    setSeverityFilter(null);
    setStatusFilter(null);
  }

  const utils = trpc.useUtils();
  const statsQ = trpc.agentStudio.graphQuality.getStats.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const findingsQ = trpc.agentStudio.graphQuality.listFindings.useQuery(
    {
      limit: FINDINGS_LIST_LIMIT,
      ...(severityFilter ? { severity: severityFilter } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    { refetchOnWindowFocus: false },
  );
  const dismissMutation = trpc.agentStudio.graphQuality.dismissFinding.useMutation(
    {
      onSuccess: () => {
        setDismissError(null);
        closeReasonEditor();
        void utils.agentStudio.graphQuality.listFindings.invalidate();
        void utils.agentStudio.graphQuality.getStats.invalidate();
      },
      onError: (err) => setDismissError(err.message),
    },
  );
  const triageMutation =
    trpc.agentStudio.graphQuality.convertFindingToProposal.useMutation({
      onSuccess: () => {
        setTriageError(null);
        closeTriageEditor();
        void utils.agentStudio.graphQuality.listFindings.invalidate();
        void utils.agentStudio.graphQuality.getStats.invalidate();
      },
      onError: (err) => setTriageError(err.message),
    });
  const trailQ = trpc.agentStudio.graphQuality.getFindingAuditTrail.useQuery(
    { findingId: expandedFindingId ?? 0 },
    {
      enabled: expandedFindingId !== null,
      refetchOnWindowFocus: false,
    },
  );

  if (statsQ.isLoading) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (statsQ.error) {
    return (
      <p
        className="text-sm text-destructive"
        data-testid="graph-quality-findings-error"
      >
        Failed to load: {statsQ.error.message}
      </p>
    );
  }
  if (!statsQ.data) return null;

  const { totals, findingsByStatus, findingsBySeverity } = statsQ.data;

  return (
    <div className="space-y-4" data-testid="graph-quality-findings-panel">
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Totals</SectionLabel>
          <div
            className="grid grid-cols-3 gap-3 text-sm"
            data-testid="graph-quality-totals"
          >
            <div>
              <p className="text-xs text-muted-foreground">findings</p>
              <p
                className="text-lg font-medium"
                data-testid="graph-quality-totals-findings"
              >
                {totals.findings.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">scans</p>
              <p
                className="text-lg font-medium"
                data-testid="graph-quality-totals-scans"
              >
                {totals.scans.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">agent runs</p>
              <p
                className="text-lg font-medium"
                data-testid="graph-quality-totals-agent-runs"
              >
                {totals.agentRuns.toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Findings by status</SectionLabel>
          {renderBucketList(
            findingsByStatus,
            "No findings yet — scans haven't produced any quality alerts.",
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Findings by severity</SectionLabel>
          {renderBucketList(
            findingsBySeverity,
            "No findings yet — scans haven't produced any quality alerts.",
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>
            Recent findings
            {findingsQ.data
              ? findingsQ.data.length === FINDINGS_LIST_LIMIT
                ? hasAnyFilter
                  ? ` (first ${FINDINGS_LIST_LIMIT} matching filters, newest first)`
                  : ` (first ${FINDINGS_LIST_LIMIT}, newest first)`
                : hasAnyFilter
                  ? ` (${findingsQ.data.length} matching filters, newest first)`
                  : ` (${findingsQ.data.length}, newest first)`
              : ""}
          </SectionLabel>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div
              className="flex items-center gap-2"
              data-testid="graph-quality-severity-filter-group"
            >
              <span className="text-muted-foreground">severity:</span>
              {(["all", ...SEVERITY_VALUES] as const).map((mode) => {
                const isActive =
                  mode === "all" ? severityFilter === null : severityFilter === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    data-testid={`graph-quality-severity-filter-${mode}`}
                    onClick={() =>
                      setSeverityFilter(mode === "all" ? null : mode)
                    }
                    className={`rounded px-2 py-0.5 font-mono ${
                      isActive
                        ? "bg-muted/50 text-foreground"
                        : "text-muted-foreground hover:bg-muted/30"
                    }`}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
            <div
              className="flex items-center gap-2"
              data-testid="graph-quality-status-filter-group"
            >
              <span className="text-muted-foreground">status:</span>
              {(["all", ...STATUS_VALUES] as const).map((mode) => {
                const isActive =
                  mode === "all" ? statusFilter === null : statusFilter === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    data-testid={`graph-quality-status-filter-${mode}`}
                    onClick={() =>
                      setStatusFilter(mode === "all" ? null : mode)
                    }
                    className={`rounded px-2 py-0.5 font-mono ${
                      isActive
                        ? "bg-muted/50 text-foreground"
                        : "text-muted-foreground hover:bg-muted/30"
                    }`}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
            {hasAnyFilter ? (
              <button
                type="button"
                className="ml-auto underline text-muted-foreground"
                data-testid="graph-quality-clear-all-filters"
                onClick={clearAllFilters}
              >
                Clear all filters
              </button>
            ) : null}
          </div>
          {findingsQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading findings…</p>
          ) : findingsQ.error ? (
            <p
              className="text-sm text-destructive"
              data-testid="graph-quality-findings-list-error"
            >
              Failed to load findings: {findingsQ.error.message}
            </p>
          ) : !findingsQ.data || findingsQ.data.length === 0 ? (
            <p
              className="text-sm text-muted-foreground italic"
              data-testid="graph-quality-findings-list-empty"
            >
              {hasAnyFilter ? (
                <>
                  No findings match the active filters.{" "}
                  <button
                    type="button"
                    className="underline not-italic"
                    data-testid="graph-quality-empty-state-clear-all"
                    onClick={clearAllFilters}
                  >
                    Clear all filters
                  </button>
                </>
              ) : (
                <>No findings yet — scans haven&apos;t produced any quality alerts.</>
              )}
            </p>
          ) : (
            <>
              {dismissError ? (
                <p
                  className="text-xs text-destructive"
                  data-testid="graph-quality-dismiss-error"
                >
                  Dismiss failed: {dismissError}
                </p>
              ) : null}
              {triageError ? (
                <p
                  className="text-xs text-destructive"
                  data-testid="graph-quality-triage-error"
                >
                  Triage failed: {triageError}
                </p>
              ) : null}
              <table
                className="w-full text-xs"
                data-testid="graph-quality-findings-list"
              >
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1">id</th>
                    <th className="py-1">class</th>
                    <th className="py-1">severity</th>
                    <th className="py-1">status</th>
                    <th className="py-1">source</th>
                    <th className="py-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {findingsQ.data.map((f) => {
                    const isDismissable = f.status === "open";
                    const isTriageable = f.status === "open";
                    const isPending =
                      dismissMutation.isPending &&
                      dismissMutation.variables?.findingId === f.id;
                    const isTriagePending =
                      triageMutation.isPending &&
                      triageMutation.variables?.findingId === f.id;
                    const isExpanded = expandedFindingId === f.id;
                    const isReasonOpen = reasonFindingId === f.id;
                    const isTriageOpen = triageFindingId === f.id;
                    return (
                      <Fragment key={f.id}>
                        <tr
                          className="border-t border-border"
                          data-testid={`graph-quality-finding-row-${f.id}`}
                        >
                          <td className="py-1 font-mono">{f.id}</td>
                          <td className="py-1 font-mono">{f.findingClass}</td>
                          <td className="py-1 font-mono">{f.severity}</td>
                          <td className="py-1 font-mono">{f.status}</td>
                          <td className="py-1 font-mono text-muted-foreground">
                            {f.sourceTypeKey ?? "—"}
                            {f.sourceId ? `: ${f.sourceId}` : ""}
                          </td>
                          <td className="py-1 space-x-2">
                            <button
                              type="button"
                              className="underline text-muted-foreground"
                              data-testid={`graph-quality-finding-trail-toggle-${f.id}`}
                              onClick={() =>
                                setExpandedFindingId(isExpanded ? null : f.id)
                              }
                            >
                              {isExpanded ? "Hide trail" : "View trail"}
                            </button>
                            {isDismissable && !isReasonOpen ? (
                              <button
                                type="button"
                                disabled={isPending}
                                className="underline text-muted-foreground disabled:opacity-50"
                                data-testid={`graph-quality-finding-dismiss-${f.id}`}
                                onClick={() => openReasonEditor(f.id)}
                              >
                                Dismiss…
                              </button>
                            ) : null}
                            {isTriageable && !isTriageOpen ? (
                              <button
                                type="button"
                                disabled={isTriagePending}
                                className="underline text-muted-foreground disabled:opacity-50"
                                data-testid={`graph-quality-finding-triage-${f.id}`}
                                onClick={() => openTriageEditor(f.id)}
                              >
                                Triage…
                              </button>
                            ) : null}
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr
                            data-testid={`graph-quality-finding-trail-row-${f.id}`}
                          >
                            <td
                              colSpan={6}
                              className="bg-muted/20 px-3 py-2 text-xs"
                            >
                              <FindingTrailView
                                trailQ={trailQ}
                                findingId={f.id}
                              />
                            </td>
                          </tr>
                        ) : null}
                        {isTriageOpen ? (
                          <tr
                            data-testid={`graph-quality-finding-triage-row-${f.id}`}
                          >
                            <td
                              colSpan={6}
                              className="bg-muted/20 px-3 py-2 text-xs"
                            >
                              <div className="space-y-2">
                                <label
                                  className="block text-muted-foreground"
                                  htmlFor={`graph-quality-triage-textarea-${f.id}`}
                                >
                                  Triage rationale (optional, max 2000
                                  chars):
                                </label>
                                <textarea
                                  id={`graph-quality-triage-textarea-${f.id}`}
                                  data-testid={`graph-quality-finding-triage-textarea-${f.id}`}
                                  className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs"
                                  rows={3}
                                  maxLength={2000}
                                  value={triageDraft}
                                  onChange={(e) =>
                                    setTriageDraft(e.target.value)
                                  }
                                  disabled={isTriagePending}
                                />
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={isTriagePending}
                                    className="rounded bg-primary px-2 py-0.5 text-primary-foreground disabled:opacity-50"
                                    data-testid={`graph-quality-finding-triage-confirm-${f.id}`}
                                    onClick={() => {
                                      const trimmed = triageDraft.trim();
                                      triageMutation.mutate({
                                        findingId: f.id,
                                        ...(trimmed !== ""
                                          ? { rationale: trimmed }
                                          : {}),
                                      });
                                    }}
                                  >
                                    {isTriagePending
                                      ? "Triaging…"
                                      : "Confirm triage"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isTriagePending}
                                    className="underline text-muted-foreground disabled:opacity-50"
                                    data-testid={`graph-quality-finding-triage-cancel-${f.id}`}
                                    onClick={closeTriageEditor}
                                  >
                                    Cancel
                                  </button>
                                  <span className="ml-auto text-muted-foreground">
                                    {triageDraft.length} / 2000
                                  </span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                        {isReasonOpen ? (
                          <tr
                            data-testid={`graph-quality-finding-reason-row-${f.id}`}
                          >
                            <td
                              colSpan={6}
                              className="bg-muted/20 px-3 py-2 text-xs"
                            >
                              <div className="space-y-2">
                                <label
                                  className="block text-muted-foreground"
                                  htmlFor={`graph-quality-reason-textarea-${f.id}`}
                                >
                                  Dismiss reason (optional, max 2000 chars):
                                </label>
                                <textarea
                                  id={`graph-quality-reason-textarea-${f.id}`}
                                  data-testid={`graph-quality-finding-reason-textarea-${f.id}`}
                                  className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs"
                                  rows={3}
                                  maxLength={2000}
                                  value={reasonDraft}
                                  onChange={(e) =>
                                    setReasonDraft(e.target.value)
                                  }
                                  disabled={isPending}
                                />
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={isPending}
                                    className="rounded bg-destructive px-2 py-0.5 text-destructive-foreground disabled:opacity-50"
                                    data-testid={`graph-quality-finding-reason-confirm-${f.id}`}
                                    onClick={() => {
                                      const trimmed = reasonDraft.trim();
                                      dismissMutation.mutate({
                                        findingId: f.id,
                                        ...(trimmed !== ""
                                          ? { reason: trimmed }
                                          : {}),
                                      });
                                    }}
                                  >
                                    {isPending
                                      ? "Dismissing…"
                                      : "Confirm dismiss"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isPending}
                                    className="underline text-muted-foreground disabled:opacity-50"
                                    data-testid={`graph-quality-finding-reason-cancel-${f.id}`}
                                    onClick={closeReasonEditor}
                                  >
                                    Cancel
                                  </button>
                                  <span className="ml-auto text-muted-foreground">
                                    {reasonDraft.length} / 2000
                                  </span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * T-F.86 FindingTrailView — inline audit-trail expansion for a
 * findings-list row. Consumes `getFindingAuditTrail` (server work
 * shipped earlier as part of Phase 23 §1, single bundled query).
 *
 * Renders three stacked sections:
 *   1. Finding row (createdAt + sourceTypeKey:sourceId + details).
 *   2. Proposal (when present — kind / status / confidence /
 *      rationale / proposedBy* / createdAt).
 *   3. Audit events (eventKind + createdAt + optional metadata).
 *
 * `trailQ` is passed in from the parent so the gating
 * (`enabled: expandedFindingId !== null`) lives at the parent level
 * and the trail isn't re-fetched per render.
 */
function FindingTrailView({
  trailQ,
  findingId,
}: {
  readonly trailQ: ReturnType<
    typeof trpc.agentStudio.graphQuality.getFindingAuditTrail.useQuery
  >;
  readonly findingId: number;
}) {
  if (trailQ.isLoading) {
    return (
      <p
        className="text-muted-foreground italic"
        data-testid={`graph-quality-finding-trail-loading-${findingId}`}
      >
        Loading trail…
      </p>
    );
  }
  if (trailQ.error) {
    return (
      <p
        className="text-destructive"
        data-testid={`graph-quality-finding-trail-error-${findingId}`}
      >
        Failed to load trail: {trailQ.error.message}
      </p>
    );
  }
  if (!trailQ.data) {
    return (
      <p
        className="text-muted-foreground italic"
        data-testid={`graph-quality-finding-trail-unavailable-${findingId}`}
      >
        Trail history unavailable.
      </p>
    );
  }
  const { finding, proposal, auditEvents } = trailQ.data;
  return (
    <div
      className="space-y-3"
      data-testid={`graph-quality-finding-trail-${findingId}`}
    >
      <div>
        <p className="font-medium">Finding</p>
        <p className="text-muted-foreground">
          created {new Date(finding.createdAt).toISOString()} ·{" "}
          {finding.sourceTypeKey ?? "—"}
          {finding.sourceId ? `: ${finding.sourceId}` : ""}
        </p>
        {finding.details ? (
          <pre
            className="mt-1 max-h-40 overflow-auto rounded bg-background/50 p-2 font-mono text-[10px]"
            data-testid={`graph-quality-finding-trail-details-${findingId}`}
          >
            {JSON.stringify(finding.details, null, 2)}
          </pre>
        ) : null}
      </div>
      <div>
        <p className="font-medium">Proposal</p>
        {proposal ? (
          <ul
            className="ml-3 list-disc text-muted-foreground"
            data-testid={`graph-quality-finding-trail-proposal-${findingId}`}
          >
            <li>kind: {proposal.proposalKind}</li>
            <li>status: {proposal.status}</li>
            {proposal.confidence ? (
              <li>confidence: {proposal.confidence}</li>
            ) : null}
            {proposal.rationale ? <li>rationale: {proposal.rationale}</li> : null}
            <li>
              proposedBy:{" "}
              {proposal.proposedByUserId
                ? `user#${proposal.proposedByUserId}`
                : proposal.proposedByAgentId
                  ? `agent#${proposal.proposedByAgentId}`
                  : "—"}
            </li>
            <li>created: {new Date(proposal.createdAt).toISOString()}</li>
          </ul>
        ) : (
          <p
            className="text-muted-foreground italic"
            data-testid={`graph-quality-finding-trail-proposal-empty-${findingId}`}
          >
            No proposal yet — finding has not been triaged.
          </p>
        )}
      </div>
      <div>
        <p className="font-medium">
          Audit events ({auditEvents.length})
        </p>
        {auditEvents.length === 0 ? (
          <p
            className="text-muted-foreground italic"
            data-testid={`graph-quality-finding-trail-audit-empty-${findingId}`}
          >
            No audit events.
          </p>
        ) : (
          <ul
            className="ml-3 list-disc text-muted-foreground"
            data-testid={`graph-quality-finding-trail-audit-${findingId}`}
          >
            {auditEvents.map((ev) => (
              <li key={ev.id}>
                {new Date(ev.createdAt).toISOString()} —{" "}
                <span className="font-mono">{ev.eventKind}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
