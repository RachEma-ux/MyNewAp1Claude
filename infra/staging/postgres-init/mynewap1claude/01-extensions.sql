-- Staging postgres init for the mynewap1claude DB.
-- Runs once on first container start (docker-entrypoint-initdb.d).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- App migrations create the actual schema; this file only ensures the
-- extensions Drizzle expects are installed before the migration runs.
