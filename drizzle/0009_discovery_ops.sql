-- Discovery Ops: event logging, promotion candidates, patch artifacts

-- Provider Discovery Events — immutable log of every discovery attempt
CREATE TABLE IF NOT EXISTS "provider_discovery_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "actorId" integer,
  "domain" text NOT NULL,
  "normalizedUrl" text,
  "status" varchar(20) NOT NULL,
  "failureReason" varchar(50),
  "bestUrl" text,
  "candidateCount" integer DEFAULT 0,
  "probeSummary" json,
  "warnings" json,
  "debug" json
);

CREATE INDEX IF NOT EXISTS "idx_pde_domain" ON "provider_discovery_events" ("domain");
CREATE INDEX IF NOT EXISTS "idx_pde_created_at" ON "provider_discovery_events" ("createdAt");
CREATE INDEX IF NOT EXISTS "idx_pde_domain_created_at" ON "provider_discovery_events" ("domain", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_pde_status" ON "provider_discovery_events" ("status");

-- Registry Promotion Candidates — domains flagged for manual review
CREATE TABLE IF NOT EXISTS "registry_promotion_candidates" (
  "id" serial PRIMARY KEY NOT NULL,
  "domain" text NOT NULL UNIQUE,
  "status" varchar(20) DEFAULT 'OPEN' NOT NULL,
  "firstDetectedAt" timestamp DEFAULT now() NOT NULL,
  "lastDetectedAt" timestamp DEFAULT now() NOT NULL,
  "lastSeenAt" timestamp DEFAULT now() NOT NULL,
  "triggerType" varchar(50),
  "attemptsTotal" integer DEFAULT 0 NOT NULL,
  "attemptsFailed" integer DEFAULT 0 NOT NULL,
  "bestUrlNullRate" decimal(5, 4) DEFAULT '0',
  "reviewedBy" integer,
  "reviewedAt" timestamp,
  "rejectedBy" integer,
  "rejectedAt" timestamp,
  "rejectCategory" varchar(50),
  "rejectNotes" text,
  "rejectSnapshot" json,
  "acceptedBy" integer,
  "acceptedAt" timestamp,
  "patchId" integer,
  "draftRegistryEntry" json,
  "attemptsSinceReject" integer DEFAULT 0 NOT NULL,
  "autoReopenedAt" timestamp,
  "autoReopenReason" varchar(30),
  "autoReopenEvidence" json
);

CREATE INDEX IF NOT EXISTS "idx_rpc_status" ON "registry_promotion_candidates" ("status");
CREATE INDEX IF NOT EXISTS "idx_rpc_last_seen" ON "registry_promotion_candidates" ("lastSeenAt");
CREATE INDEX IF NOT EXISTS "idx_rpc_domain" ON "registry_promotion_candidates" ("domain");
CREATE INDEX IF NOT EXISTS "idx_rpc_status_last_seen" ON "registry_promotion_candidates" ("status", "lastSeenAt");

-- Registry Patch Artifacts — proposed registry entries from promotion acceptance
CREATE TABLE IF NOT EXISTS "registry_patch_artifacts" (
  "id" serial PRIMARY KEY NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "createdBy" integer NOT NULL,
  "sourceDomain" text NOT NULL,
  "status" varchar(20) DEFAULT 'PROPOSED' NOT NULL,
  "draftRegistryEntry" json NOT NULL,
  "notes" text,
  "linkedPrUrl" text
);

CREATE INDEX IF NOT EXISTS "idx_rpa_source_domain" ON "registry_patch_artifacts" ("sourceDomain");
CREATE INDEX IF NOT EXISTS "idx_rpa_status" ON "registry_patch_artifacts" ("status");
CREATE INDEX IF NOT EXISTS "idx_rpa_created_at" ON "registry_patch_artifacts" ("createdAt");
