-- Manual ops migration — pgvector optional engine activation
--
-- Authority: D-PARSE-PGVECTOR-1..4 (see docs/architecture/agent-studio-pgvector-future-migration.md §11)
-- Deployment: ASDB (Agent Studio dedicated database)
-- Run: psql -d asdb -f scripts/migrations/manual/pgvector-optional-engine.sql
--
-- This migration is INTENTIONALLY NOT in the Drizzle migration sequence.
-- The pgvector extension requires CREATE EXTENSION privilege and is not
-- guaranteed to be available on every Postgres install. Operators run
-- this script when they have decided to enable pgvector-backed vector
-- retrieval for their deployment.
--
-- The retrofit-shipped `agsKnowledgeChunks` Drizzle schema includes the
-- `embedding` column declared as a custom column type. Until this
-- migration runs, the column does NOT physically exist; queries that
-- reference it will fail. The pgvector adapter probes for the column
-- via pg_attribute before issuing queries (see
-- `services/rac/ingestion/local-pgvector-adapter.ts`); when absent it
-- returns `health: unavailable` and `search: source_unavailable`.
--
-- Pre-flight (run these checks first):
--   SELECT * FROM pg_available_extensions WHERE name = 'vector';
--   -- Should return one row. If not, install the pgvector OS package
--   -- (apt: postgresql-NN-pgvector, brew: pgvector, etc.) before continuing.

BEGIN;

-- 1. Install the pgvector extension. Idempotent.
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add the nullable embedding column to the canonical chunks table.
--    Sources whose embedding dim is NOT 1536 cannot use this column;
--    the adapter refuses with `embedding_dim_unsupported` at search
--    time. Adding additional dim columns is a future amendment.
ALTER TABLE ags_knowledge_chunks
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 3. HNSW index for cosine similarity. HNSW is preferred over IVFFlat
--    for the typical retrofit corpus size (10K–10M vectors); switch
--    to IVFFlat only if HNSW memory pressure becomes a problem.
--
--    The index covers only NOT-NULL rows; sources that haven't been
--    backfilled don't pay index-write cost.
CREATE INDEX IF NOT EXISTS ags_knowledge_chunks_embedding_hnsw_idx
  ON ags_knowledge_chunks
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

COMMIT;

-- Verification (run after the script completes):
--   SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
--   SELECT column_name, data_type, udt_name
--     FROM information_schema.columns
--     WHERE table_name = 'ags_knowledge_chunks' AND column_name = 'embedding';
--   SELECT indexname FROM pg_indexes
--     WHERE tablename = 'ags_knowledge_chunks'
--     AND indexname = 'ags_knowledge_chunks_embedding_hnsw_idx';
--
-- Back-out (non-destructive):
--   DROP INDEX IF EXISTS ags_knowledge_chunks_embedding_hnsw_idx;
--   ALTER TABLE ags_knowledge_chunks DROP COLUMN IF EXISTS embedding;
--   -- The extension itself is left in place; other databases on the
--   -- same Postgres may use it.
