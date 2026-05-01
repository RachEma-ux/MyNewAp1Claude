-- Code Studio module DB role (code_runtime_user)
-- Run AS a superuser, while connected to the Code Studio DB (codedb).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'code_runtime_user') THEN
    CREATE ROLE code_runtime_user LOGIN;
  END IF;
END $$;

GRANT CONNECT ON DATABASE codedb TO code_runtime_user;
GRANT USAGE ON SCHEMA public TO code_runtime_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO code_runtime_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO code_runtime_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO code_runtime_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO code_runtime_user;

-- ALTER ROLE code_runtime_user WITH ENCRYPTED PASSWORD '...';
