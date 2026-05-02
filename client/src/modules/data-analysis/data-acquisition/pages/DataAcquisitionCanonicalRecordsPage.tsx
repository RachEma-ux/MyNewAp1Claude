/**
 * DataAcquisitionCanonicalRecordsPage — universal canonical records.
 *
 * Canonical records are the universal output of the Data Acquisition
 * subdomain — every successful pipeline writes a row here regardless
 * of mode.
 */

import { CanonicalRecordViewer } from "../components/CanonicalRecordViewer";

export default function DataAcquisitionCanonicalRecordsPage() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Data Acquisition · Canonical Records
        </h1>
        <p className="text-muted-foreground mt-1 max-w-3xl">
          The universal canonical row produced by every pipeline — what
          downstream RAG / GraphRAG / analytics / warehouse / alerts /
          reports consume.
        </p>
      </div>
      <CanonicalRecordViewer />
    </div>
  );
}
