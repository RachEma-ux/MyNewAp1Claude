/**
 * DocumentIntelligencePage — Document Intelligence is one specialized
 * pipeline inside Data Acquisition, not the whole subdomain.
 *
 * This page is the document-only view: the document subset of items,
 * the canonical document model viewer, and the validation/quality
 * results — useful for operators who only care about the document
 * pipeline.
 */

import { DocumentList } from "../components/DocumentList";
import { CanonicalDocumentViewer } from "../components/CanonicalDocumentViewer";
import { ValidationResultPanel } from "../components/ValidationResultPanel";

export default function DocumentIntelligencePage() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Data Acquisition · Document Intelligence
        </h1>
        <p className="text-muted-foreground mt-1 max-w-3xl">
          One specialized pipeline among many — the document subset of the
          universal Data Acquisition layer (parser routing, OCR fallback,
          canonical document reconstruction, validation).
        </p>
      </div>
      <DocumentList />
      <CanonicalDocumentViewer />
      <ValidationResultPanel />
    </div>
  );
}
