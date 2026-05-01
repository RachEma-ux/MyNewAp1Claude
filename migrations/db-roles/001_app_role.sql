-- Platform DB role (app_runtime_user)
-- Run AS a superuser, while connected to the platform DB (mynewap1claude).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime_user') THEN
    CREATE ROLE app_runtime_user LOGIN;
  END IF;
END $$;

REVOKE CONNECT ON DATABASE mynewap1claude FROM PUBLIC;
GRANT CONNECT ON DATABASE mynewap1claude TO app_runtime_user;
GRANT USAGE ON SCHEMA public TO app_runtime_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_runtime_user;

-- Set the password out-of-band:
--   ALTER ROLE app_runtime_user WITH ENCRYPTED PASSWORD '...';
