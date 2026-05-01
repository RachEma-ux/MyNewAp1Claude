-- PSM module DB role (psm_runtime_user)
-- Run AS a superuser, while connected to the PSM DB (psmdb).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'psm_runtime_user') THEN
    CREATE ROLE psm_runtime_user LOGIN;
  END IF;
END $$;

GRANT CONNECT ON DATABASE psmdb TO psm_runtime_user;
GRANT USAGE ON SCHEMA public TO psm_runtime_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO psm_runtime_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO psm_runtime_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO psm_runtime_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO psm_runtime_user;

-- ALTER ROLE psm_runtime_user WITH ENCRYPTED PASSWORD '...';
