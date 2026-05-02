/**
 * DataAcquisitionRunsPage — ingestion run timeline.
 */

import { WorkerStatusBanner } from "../components/WorkerStatusBanner";
import { IngestionRunTimeline } from "../components/IngestionRunTimeline";

export default function DataAcquisitionRunsPage() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Data Acquisition · Runs
        </h1>
        <p className="text-muted-foreground mt-1 max-w-3xl">
          Every ingestion run from every connector — filed under the
          universal core, never silently dropped.
        </p>
      </div>
      <WorkerStatusBanner />
      <IngestionRunTimeline />
    </div>
  );
}
