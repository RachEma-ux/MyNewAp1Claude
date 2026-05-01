/**
 * RAG — Frontend Module Manifest
 *
 * Document ingestion, embeddings, vector DB, and the GraphRAG explorer
 * all belong to the RAG module's frontend surface.
 */

import { lazy } from "react";
import type { ClientModuleManifest } from "@/platform/modules/types";

const Documents = lazy(() => import("@/pages/Documents"));
const DocumentsDashboard = lazy(() => import("@/pages/DocumentsDashboard"));
const DocumentUpload = lazy(() => import("@/pages/DocumentUpload"));
const EmbeddingsManagement = lazy(() => import("@/pages/EmbeddingsManagement"));
const VectorDBManagement = lazy(() => import("@/pages/VectorDBManagement"));
const GraphRAGPage = lazy(() => import("@/pages/data-analysis/GraphRAGPage"));

export const ragClientManifest: ClientModuleManifest = {
  key: "rag",
  name: "RAG — Knowledge Retrieval",
  routes: [
    { path: "/documents", label: "Documents", component: Documents },
    { path: "/documents/dashboard", label: "Documents Dashboard", component: DocumentsDashboard },
    { path: "/documents/upload", label: "Upload Documents", component: DocumentUpload },
    { path: "/embeddings", label: "Embeddings", component: EmbeddingsManagement },
    { path: "/vectordb", label: "Vector DB", component: VectorDBManagement },
    { path: "/data-analysis/graphrag", label: "GraphRAG", component: GraphRAGPage },
  ],
  navigation: [{ group: "knowledge", label: "RAG", order: 10 }],
  requiredPermissions: ["rag.read"],
};
