-- Sandbox WF module DB role (sandbox_wf_runtime_user)
-- Run AS a superuser, while connected to the Sandbox WF DB (wfdb).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_wf_runtime_user') THEN
    CREATE ROLE sandbox_wf_runtime_user LOGIN;
  END IF;
END $$;

GRANT CONNECT ON DATABASE wfdb TO sandbox_wf_runtime_user;
GRANT USAGE ON SCHEMA public TO sandbox_wf_runtime_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sandbox_wf_runtime_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sandbox_wf_runtime_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sandbox_wf_runtime_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO sandbox_wf_runtime_user;

-- ALTER ROLE sandbox_wf_runtime_user WITH ENCRYPTED PASSWORD '...';
