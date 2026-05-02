/**
 * DataAcquisitionProcessingPage — processing runs across all
 * pipelines (worker-bound or in-process).
 */

import { WorkerStatusBanner } from "../components/WorkerStatusBanner";
import { ParserRunList } from "../components/ParserRunList";

export default function DataAcquisitionProcessingPage() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Data Acquisition · Processing
        </h1>
        <p className="text-muted-foreground mt-1 max-w-3xl">
          Per-item processing runs across every specialized pipeline.
          Worker-bound runs that hit a degraded worker stay recorded —
          never silently dropped.
        </p>
      </div>
      <WorkerStatusBanner />
      <ParserRunList />
    </div>
  );
}
