/**
 * DataAcquisitionRoutingPage — pipeline/processor routing decisions.
 */

import { ParserRoutePanel } from "../components/ParserRoutePanel";

export default function DataAcquisitionRoutingPage() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Data Acquisition · Routing
        </h1>
        <p className="text-muted-foreground mt-1 max-w-3xl">
          Routing decisions assign each classified item to a pipeline /
          processor with a fallback chain — the universal handoff into
          specialized processing.
        </p>
      </div>
      <ParserRoutePanel />
    </div>
  );
}
