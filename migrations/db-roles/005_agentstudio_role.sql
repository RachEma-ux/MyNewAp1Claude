-- Agent Studio module DB role (agent_runtime_user)
-- Run AS a superuser, while connected to the Agent Studio DB (asdb).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_runtime_user') THEN
    CREATE ROLE agent_runtime_user LOGIN;
  END IF;
END $$;

GRANT CONNECT ON DATABASE asdb TO agent_runtime_user;
GRANT USAGE ON SCHEMA public TO agent_runtime_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO agent_runtime_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO agent_runtime_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO agent_runtime_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO agent_runtime_user;

-- ALTER ROLE agent_runtime_user WITH ENCRYPTED PASSWORD '...';
