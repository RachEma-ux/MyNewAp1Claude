/**
 * DataAcquisitionOutputsPage — output runs by pipeline.
 */

import { OutputPipelinePanel } from "../components/OutputPipelinePanel";

export default function DataAcquisitionOutputsPage() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Data Acquisition · Outputs
        </h1>
        <p className="text-muted-foreground mt-1 max-w-3xl">
          Downstream output destinations — RAG / GraphRAG / analytics /
          warehouse / alerts / reports / markdown / html / pdf. Every
          emit-attempt is recorded with status (completed / failed /
          degraded) — never silently dropped.
        </p>
      </div>
      <OutputPipelinePanel />
    </div>
  );
}
