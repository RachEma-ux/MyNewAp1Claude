/**
 * RAG — Event types
 */
export const RAG_EVENTS = {
  indexStarted: "rag.index.started",
  indexCompleted: "rag.index.completed",
  indexFailed: "rag.index.failed",
} as const;

export type RagEventType = (typeof RAG_EVENTS)[keyof typeof RAG_EVENTS];

/** Events RAG consumes from the platform. */
export const RAG_CONSUMES = {
  documentsUploaded: "documents.uploaded",
} as const;
