/**
 * Worker degraded banner — Data Acquisition.
 *
 * Renders a clean, non-blocking banner when the Data Acquisition
 * worker is unavailable. UI remains usable; processing-bound
 * operations record failed/degraded runs rather than crash.
 */

import { trpc } from "@/lib/trpc";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle } from "lucide-react";

export function WorkerStatusBanner() {
  const status =
    trpc.dataAnalysis.dataAcquisition.workerStatus.useQuery(undefined, {
      refetchInterval: 30_000,
    });

  if (status.isLoading) return null;
  const data = status.data as
    | { healthy: boolean; url: string; message: string }
    | undefined;
  if (!data) return null;

  if (data.healthy) {
    return (
      <Alert>
        <CheckCircle className="h-4 w-4" />
        <AlertTitle>Worker reachable</AlertTitle>
        <AlertDescription>
          Data Acquisition worker at <code>{data.url}</code> is healthy.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Data Acquisition worker unavailable</AlertTitle>
      <AlertDescription>
        {data.message} Processing operations will record failed/degraded runs
        until the worker at <code>{data.url}</code> is reachable. UI remains
        usable; sources, runs, items, classifications and routing decisions
        continue to be recorded.
      </AlertDescription>
    </Alert>
  );
}
