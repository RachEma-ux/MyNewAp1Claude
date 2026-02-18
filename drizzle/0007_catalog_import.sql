-- Catalog Import & Discovery System
-- Phase 0 + Phase 1: import_sessions, import_preview_rows, import_audit_logs

CREATE TABLE IF NOT EXISTS "import_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" integer NOT NULL,
  "method" varchar(50) NOT NULL,
  "sourceRef" text NOT NULL,
  "status" varchar(50) DEFAULT 'pending' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "summary" json,
  "error" text,
  "expiresAt" timestamp NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_import_session_status" ON "import_sessions" ("status");
CREATE INDEX IF NOT EXISTS "idx_import_session_expires" ON "import_sessions" ("expiresAt");

CREATE TABLE IF NOT EXISTS "import_preview_rows" (
  "id" serial PRIMARY KEY NOT NULL,
  "sessionId" text NOT NULL REFERENCES "import_sessions"("id") ON DELETE CASCADE,
  "tempId" text NOT NULL,
  "type" varchar(50) NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "source" varchar(100) NOT NULL,
  "metadata" json,
  "duplicateStatus" varchar(50) DEFAULT 'new' NOT NULL,
  "riskLevel" varchar(20) DEFAULT 'low' NOT NULL,
  "validationIssues" json
);

CREATE INDEX IF NOT EXISTS "idx_import_preview_session" ON "import_preview_rows" ("sessionId");

CREATE TABLE IF NOT EXISTS "import_audit_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "sessionId" text,
  "userId" integer,
  "method" varchar(50),
  "sourceRef" text,
  "timestamp" timestamp DEFAULT now() NOT NULL,
  "previewCount" integer DEFAULT 0,
  "selectedCount" integer DEFAULT 0,
  "createdCount" integer DEFAULT 0,
  "skippedCount" integer DEFAULT 0,
  "conflictOverrides" integer DEFAULT 0,
  "highRiskCount" integer DEFAULT 0,
  "ipAddress" varchar(45),
  "userAgent" text
);

CREATE INDEX IF NOT EXISTS "idx_import_audit_session" ON "import_audit_logs" ("sessionId");
CREATE INDEX IF NOT EXISTS "idx_import_audit_timestamp" ON "import_audit_logs" ("timestamp");
