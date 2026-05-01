-- RAG module DB role (rag_runtime_user)
-- Run AS a superuser, while connected to the RAG DB (ragdb).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rag_runtime_user') THEN
    CREATE ROLE rag_runtime_user LOGIN;
  END IF;
END $$;

REVOKE CONNECT ON DATABASE ragdb FROM PUBLIC;
GRANT CONNECT ON DATABASE ragdb TO rag_runtime_user;
GRANT USAGE ON SCHEMA public TO rag_runtime_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rag_runtime_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rag_runtime_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rag_runtime_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO rag_runtime_user;

-- ALTER ROLE rag_runtime_user WITH ENCRYPTED PASSWORD '...';
