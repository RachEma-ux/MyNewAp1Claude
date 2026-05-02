/**
 * RAG — Frontend Module Manifest
 *
 * Document ingestion, embeddings, and vector DB make up the RAG
 * module's frontend surface.
 *
 * GraphRAG is intentionally NOT mounted here. Even though GraphRAG
 * uses retrieval primitives that overlap with RAG, GraphRAG is a
 * subdomain of the Data Analysis RTLM, not RAG. The canonical
 * `/data-analysis/graphrag` route is owned by Data Analysis's
 * client capsule (`client/src/modules/data-analysis/`). Listing it
 * here too would duplicate canonical ownership and fail
 * `check:module-routes-conflict` once Data Analysis is in strict
 * mode.
 */

import { lazy } from "react";
import type { ClientModuleManifest } from "@/platform/modules/types";

const Documents = lazy(() => import("@/pages/Documents"));
const DocumentsDashboard = lazy(() => import("@/pages/DocumentsDashboard"));
const DocumentUpload = lazy(() => import("@/pages/DocumentUpload"));
const EmbeddingsManagement = lazy(() => import("@/pages/EmbeddingsManagement"));
const VectorDBManagement = lazy(() => import("@/pages/VectorDBManagement"));

export const ragClientManifest: ClientModuleManifest = {
  key: "rag",
  name: "RAG — Knowledge Retrieval",
  routes: [
    { path: "/documents", label: "Documents", component: Documents },
    { path: "/documents/dashboard", label: "Documents Dashboard", component: DocumentsDashboard },
    { path: "/documents/upload", label: "Upload Documents", component: DocumentUpload },
    { path: "/embeddings", label: "Embeddings", component: EmbeddingsManagement },
    { path: "/vectordb", label: "Vector DB", component: VectorDBManagement },
  ],
  navigation: [{ group: "knowledge", label: "RAG", order: 10 }],
  requiredPermissions: ["rag.read"],
};
