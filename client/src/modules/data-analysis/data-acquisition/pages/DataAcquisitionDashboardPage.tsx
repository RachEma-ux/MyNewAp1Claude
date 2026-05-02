/**
 * DataAcquisitionDashboardPage — top-level overview.
 *
 * Combines worker status, summary cards, and the run timeline so an
 * operator can land here and see the universal acquisition layer's
 * health at a glance — not just the document subset.
 */

import { WorkerStatusBanner } from "../components/WorkerStatusBanner";
import { DataAcquisitionSummaryCards } from "../components/DataAcquisitionSummaryCards";
import { IngestionRunTimeline } from "../components/IngestionRunTimeline";

export default function DataAcquisitionDashboardPage() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Data Acquisition · Dashboard
        </h1>
        <p className="text-muted-foreground mt-1 max-w-3xl">
          Universal acquisition layer inside Data Analysis — sources, runs,
          items, and downstream outputs across all modes.
        </p>
      </div>
      <WorkerStatusBanner />
      <DataAcquisitionSummaryCards />
      <IngestionRunTimeline />
    </div>
  );
}
