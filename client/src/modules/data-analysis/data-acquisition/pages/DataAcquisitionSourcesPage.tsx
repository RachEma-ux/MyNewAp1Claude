/**
 * DataAcquisitionSourcesPage — registered sources across all modes.
 */

import { WorkerStatusBanner } from "../components/WorkerStatusBanner";
import { SourceList } from "../components/SourceList";

export default function DataAcquisitionSourcesPage() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Data Acquisition · Sources
        </h1>
        <p className="text-muted-foreground mt-1 max-w-3xl">
          All registered sources — local, manual, webhook (real) plus S3 /
          GDrive / GitHub / API / DB / sensor / stream / SaaS / web / object
          storage (configured-or-stub).
        </p>
      </div>
      <WorkerStatusBanner />
      <SourceList />
    </div>
  );
}
