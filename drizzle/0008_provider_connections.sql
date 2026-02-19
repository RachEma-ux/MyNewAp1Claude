-- Provider Connections & PAT Authentication (Governed)

CREATE TABLE IF NOT EXISTS "provider_connections" (
  "id" serial PRIMARY KEY NOT NULL,
  "providerId" integer NOT NULL,
  "workspaceId" integer NOT NULL,
  "baseUrl" text NOT NULL,
  "lifecycleStatus" varchar(30) DEFAULT 'draft' NOT NULL,
  "healthStatus" varchar(30),
  "lastHealthCheck" timestamp,
  "secretVersion" integer DEFAULT 1 NOT NULL,
  "capabilities" json,
  "modelCount" integer,
  "createdBy" integer NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_pconn_workspace" ON "provider_connections" ("workspaceId");
CREATE INDEX IF NOT EXISTS "idx_pconn_provider" ON "provider_connections" ("providerId");
CREATE INDEX IF NOT EXISTS "idx_pconn_status" ON "provider_connections" ("lifecycleStatus");

DO $$ BEGIN
  ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Provider Secrets (isolated encrypted PAT storage)

CREATE TABLE IF NOT EXISTS "provider_secrets" (
  "id" serial PRIMARY KEY NOT NULL,
  "connectionId" integer NOT NULL,
  "encryptedPat" text NOT NULL,
  "keyVersion" integer DEFAULT 1 NOT NULL,
  "rotatedFrom" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_psecret_connection" ON "provider_secrets" ("connectionId");

DO $$ BEGIN
  ALTER TABLE "provider_secrets" ADD CONSTRAINT "provider_secrets_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "provider_connections"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Provider Audit Log (immutable event trail)

CREATE TABLE IF NOT EXISTS "provider_audit_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "connectionId" integer NOT NULL,
  "action" varchar(50) NOT NULL,
  "actor" integer NOT NULL,
  "metadata" json,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_paudit_connection" ON "provider_audit_log" ("connectionId");
CREATE INDEX IF NOT EXISTS "idx_paudit_action" ON "provider_audit_log" ("action");
CREATE INDEX IF NOT EXISTS "idx_paudit_timestamp" ON "provider_audit_log" ("createdAt");

DO $$ BEGIN
  ALTER TABLE "provider_audit_log" ADD CONSTRAINT "provider_audit_log_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "provider_connections"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
