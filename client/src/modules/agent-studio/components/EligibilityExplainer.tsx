/**
 * EligibilityExplainer — operator-facing explainer for the
 * approval-lifecycle retention predicate (PR #702).
 *
 * Calls `agentStudio.publish.explainRetentionEligibility` for a given
 * `(entityType, entityId)` and renders one of:
 *
 *   - Loading line while the query is in flight.
 *   - Amber error line carrying the surfaced message.
 *   - Amber preserved-state panel listing the blocker codes (one per row)
 *     when retention is currently blocked.
 *   - Emerald eligible-state panel with the "next sweep will delete this
 *     row" affirmation when no blockers are present.
 *
 * Answers operator triage of "why isn't this row being swept?" without
 * log parsing. The 90-day window is the standard approval-lifecycle
 * retention default (matches the daily-sweep cron defaults at slots
 * 18 / 19 / 20 UTC).
 *
 * Originally lived inside `RetrofitPage.tsx`; extracted in PR #708 to
 * isolate it for unit testing.
 */

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "./ui";

export interface EligibilityExplainerProps {
  readonly entityType:
    | "ags_publish_requests"
    | "ags_approval_steps"
    | "ags_note_promotions";
  readonly entityId: number;
}

export function EligibilityExplainer(props: EligibilityExplainerProps) {
  const query =
    trpc.agentStudio.publish.explainRetentionEligibility.useQuery(
      {
        entityType: props.entityType,
        entityId: props.entityId,
        retentionDays: 90,
      },
      { retry: false },
    );

  if (query.isLoading) {
    return (
      <div className="text-xs text-zinc-500 mt-2">
        Loading retention eligibility…
      </div>
    );
  }
  if (query.error) {
    return (
      <div className="text-xs text-amber-400 mt-2">
        Eligibility lookup failed: {query.error.message}
      </div>
    );
  }
  const data = query.data;
  if (!data) return null;

  return (
    <div
      className={`rounded border p-2 text-xs mt-2 ${
        data.retentionEligible
          ? "border-emerald-900 bg-emerald-950/20"
          : "border-amber-900 bg-amber-950/20"
      }`}
    >
      <div className="flex items-center justify-between">
        <SectionLabel>Retention eligibility (90-day window)</SectionLabel>
        <Badge variant={data.retentionEligible ? "default" : "secondary"}>
          {data.retentionEligible ? "eligible" : "preserved"}
        </Badge>
      </div>
      <div className="mt-1 text-zinc-400">
        state: <span className="font-mono">{data.state}</span> · terminalAt:{" "}
        <span className="font-mono">
          {data.terminalAt ? new Date(data.terminalAt).toISOString() : "—"}
        </span>
      </div>
      <div className="mt-0.5 text-zinc-400">
        retentionEligibleAt:{" "}
        <span className="font-mono">
          {data.retentionEligibleAt
            ? new Date(data.retentionEligibleAt).toISOString()
            : "—"}
        </span>
      </div>
      {data.retentionBlockers.length > 0 ? (
        <div className="mt-1">
          <div className="text-zinc-500 uppercase tracking-wide">blockers</div>
          <ul className="list-disc list-inside text-zinc-400">
            {data.retentionBlockers.map((code: string) => (
              <li key={code} className="font-mono">
                {code}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-1 text-emerald-400">
          No active blockers — the next sweep will delete this row.
        </div>
      )}
    </div>
  );
}

export default EligibilityExplainer;
