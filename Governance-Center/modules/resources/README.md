# Resources — Module Governance

## Overview

Resources covers documents, embeddings, vector DB, and RAG pipeline.

## Governance Status: Minimal

- Document CRUD uses `protectedProcedure` with workspace access checks
- Known gap: `bulkDelete` bypasses access check (C4)
- No governance overlay for embeddings or vector DB operations

## Runtime References

| File | Location | Reason |
|---|---|---|
| Documents router | `server/routers/documents-crud-router.ts` | Runtime tRPC router |
| Documents server | `server/documents/` | Runtime document engine |
| Embeddings server | `server/embeddings/` | Runtime embedding pipeline |
| Vector DB server | `server/vectordb/` | Runtime Qdrant integration |
