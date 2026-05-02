/**
 * DataAcquisitionClassificationPage — classification results per item.
 */

import { ClassificationPanel } from "../components/ClassificationPanel";

export default function DataAcquisitionClassificationPage() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Data Acquisition · Classification
        </h1>
        <p className="text-muted-foreground mt-1 max-w-3xl">
          Classifier output per item — the universal step that picks which
          specialized pipeline an item flows into.
        </p>
      </div>
      <ClassificationPanel />
    </div>
  );
}
