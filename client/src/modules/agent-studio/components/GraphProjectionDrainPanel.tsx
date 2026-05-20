// GraphProjectionDrainPanel — no-deferral continuation-35 slice 138.
//
// Closes the UI-consumer gap for graphProjection.{getDrainCronStatus,
// runDrainNow} — the 2 unconsumed endpoints on the graphProjection
// router. Renders alongside GraphHealthAdminPanel inside
// GraphHealthAdminPage.

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

export function GraphProjectionDrainPanel() {
  return (
    <div className="space-y-4" data-testid="gpd-panel">
      <DrainCronStatusCard />
      <RunDrainNowCard />
    </div>
  );
}

function DrainCronStatusCard() {
  const query = trpc.agentStudio.graphProjection.getDrainCronStatus.useQuery(
    undefined,
    { refetchOnWindowFocus: false },
  );

  const status = query.data as
    | {
        cron?: string | null;
        lastRunAt?: Date | string | null;
        nextRunAt?: Date | string | null;
        lastResult?: {
          processed?: number;
          completed?: number;
          failed?: number;
          unknownEventKind?: number;
          drainedAt?: Date | string | null;
        } | null;
      }
    | undefined;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Projection drain cron status</SectionLabel>
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">
            Loading drain cron status…
          </p>
        ) : query.error ? (
          <p className="text-sm text-destructive" data-testid="gpd-status-error">
            {query.error.message}
          </p>
        ) : status ? (
          <div
            className="space-y-1 font-mono text-xs"
            data-testid="gpd-status-body"
          >
            <div>cron: {status.cron ?? "—"}</div>
            <div>
              lastRunAt:{" "}
              {status.lastRunAt
                ? new Date(status.lastRunAt).toISOString()
                : "—"}
            </div>
            <div>
              nextRunAt:{" "}
              {status.nextRunAt
                ? new Date(status.nextRunAt).toISOString()
                : "—"}
            </div>
            {status.lastResult ? (
              <div className="mt-2 rounded border bg-background p-2">
                <div>processed: {status.lastResult.processed ?? 0}</div>
                <div>completed: {status.lastResult.completed ?? 0}</div>
                <div>failed: {status.lastResult.failed ?? 0}</div>
                <div>
                  unknownEventKind:{" "}
                  {status.lastResult.unknownEventKind ?? 0}
                </div>
                <div>
                  drainedAt:{" "}
                  {status.lastResult.drainedAt
                    ? new Date(status.lastResult.drainedAt).toISOString()
                    : "—"}
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground">
                No drain has run yet.
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RunDrainNowCard() {
  const [limitRaw, setLimitRaw] = useState("");
  const limit = parsePositiveInt(limitRaw);
  const limitValid =
    limitRaw.trim() === "" || (limit !== null && limit <= 1000);

  const utils = trpc.useUtils();
  const mut = trpc.agentStudio.graphProjection.runDrainNow.useMutation({
    onSuccess: (res) => {
      const r = res as {
        processed: number;
        completed: number;
        failed: number;
        unknownEventKind: number;
      };
      toast.success(
        `Drain: ${r.processed} processed / ${r.completed} ok / ${r.failed} failed / ${r.unknownEventKind} unknown-kind`,
      );
      void utils.agentStudio.graphProjection.getDrainCronStatus.invalidate();
    },
    onError: (err) => toast.error(`Drain failed: ${err.message ?? "unknown"}`),
  });

  const result = mut.data as
    | {
        processed: number;
        completed: number;
        failed: number;
        unknownEventKind: number;
        drainedAt?: Date | string;
        rows?: Array<{ id: number; lastError?: string | null }>;
      }
    | undefined;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Run drain now</SectionLabel>
        <p className="text-xs text-muted-foreground">
          On-demand drain of `ags_graph_projection_sync_jobs`. Use when
          a just-created note should appear in the graph immediately,
          or to flush a backlog after a Neo4j outage.
        </p>
        <div className="flex items-end gap-3">
          <div className="w-32">
            <Label htmlFor="gpd-limit">Limit (max 1000)</Label>
            <Input
              id="gpd-limit"
              data-testid="gpd-run-limit"
              type="number"
              min={1}
              max={1000}
              value={limitRaw}
              onChange={(e) => setLimitRaw(e.target.value)}
              placeholder="100"
            />
          </div>
          <Button
            type="button"
            disabled={!limitValid || mut.isPending}
            onClick={() =>
              mut.mutate(limit !== null ? { limit } : undefined)
            }
            data-testid="gpd-run-button"
          >
            {mut.isPending ? "Draining…" : "Run drain now"}
          </Button>
        </div>
        {!limitValid && limitRaw.length > 0 ? (
          <p
            className="text-xs text-destructive"
            data-testid="gpd-limit-error"
          >
            Must be 1–1000
          </p>
        ) : null}
        {result ? (
          <div
            className="rounded border bg-background p-2 font-mono text-xs"
            data-testid="gpd-run-result"
          >
            <div>processed: {result.processed}</div>
            <div>completed: {result.completed}</div>
            <div>failed: {result.failed}</div>
            <div>unknownEventKind: {result.unknownEventKind}</div>
            {result.rows && result.rows.some((r) => r.lastError) ? (
              <ul className="mt-2 text-destructive">
                {result.rows
                  .filter((r) => r.lastError)
                  .map((r) => (
                    <li key={r.id}>
                      #{r.id}: {r.lastError}
                    </li>
                  ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
