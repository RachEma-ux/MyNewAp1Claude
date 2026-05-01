-- PRM module DB role (prm_runtime_user)
-- Run AS a superuser, while connected to the PRM DB (prmdb).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prm_runtime_user') THEN
    CREATE ROLE prm_runtime_user LOGIN;
  END IF;
END $$;

REVOKE CONNECT ON DATABASE prmdb FROM PUBLIC;
GRANT CONNECT ON DATABASE prmdb TO prm_runtime_user;
GRANT USAGE ON SCHEMA public TO prm_runtime_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO prm_runtime_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO prm_runtime_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO prm_runtime_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO prm_runtime_user;

-- ALTER ROLE prm_runtime_user WITH ENCRYPTED PASSWORD '...';
