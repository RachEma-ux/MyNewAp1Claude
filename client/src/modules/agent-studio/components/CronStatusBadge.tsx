// CronStatusBadge — single source of truth for the 4-state badge
// rendered alongside each retention-cron operator panel.
//
// Pre-extraction state: the same 7-line conditional ladder was
// duplicated 18 times across RetrofitPage.tsx (one per retention
// cron). Centralizing the logic lets future operators tweak the
// surface in one place — e.g. add a "stale" state, change the
// "healthy" label — without 18-site search-and-replace.
//
// States (priority order):
//
//   1. loading      — query is in flight; secondary variant
//   2. error        — getStatus returned a lastError string; destructive variant
//   3. healthy      — at least one tick has fired (lastRunAt present); default variant
//   4. never run    — neither error nor lastRunAt present; secondary variant
//
// Inputs are intentionally narrow: the minimum subset of a
// useQuery result shape needed for the four-state decision.

import { Badge } from "@/components/ui/badge";

export interface CronStatusBadgeProps {
  readonly isLoading: boolean;
  readonly lastError: string | null | undefined;
  readonly lastRunAt: Date | string | null | undefined;
}

export function CronStatusBadge(props: CronStatusBadgeProps) {
  if (props.isLoading) {
    return <Badge variant="secondary">loading</Badge>;
  }
  if (props.lastError) {
    return <Badge variant="destructive">error</Badge>;
  }
  if (props.lastRunAt) {
    return <Badge>healthy</Badge>;
  }
  return <Badge variant="secondary">never run</Badge>;
}

export default CronStatusBadge;
