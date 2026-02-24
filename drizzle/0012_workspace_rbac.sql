-- 0012_workspace_rbac.sql
-- Workspace RBAC: capability-based access control tables

-- Capabilities catalog
CREATE TABLE IF NOT EXISTS "capabilities" (
  "id" serial PRIMARY KEY,
  "key" text NOT NULL UNIQUE,
  "description" text,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

-- Workspace roles
CREATE TABLE IF NOT EXISTS "workspace_roles" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "name" varchar(100) NOT NULL,
  "description" text,
  "isSystem" boolean DEFAULT false NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  UNIQUE("workspaceId", "name")
);

-- Role → capability mappings
CREATE TABLE IF NOT EXISTS "workspace_role_capabilities" (
  "id" serial PRIMARY KEY,
  "roleId" integer NOT NULL REFERENCES "workspace_roles"("id"),
  "capabilityId" integer NOT NULL REFERENCES "capabilities"("id"),
  "scope" varchar(50) DEFAULT 'workspace' NOT NULL,
  "constraints" json,
  UNIQUE("roleId", "capabilityId")
);

-- Principal (user) → capability overrides
CREATE TABLE IF NOT EXISTS "workspace_principal_capabilities" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "userId" integer NOT NULL REFERENCES "users"("id"),
  "capabilityId" integer NOT NULL REFERENCES "capabilities"("id"),
  "effect" varchar(10) NOT NULL,
  "constraints" json,
  UNIQUE("workspaceId", "userId", "capabilityId")
);

-- Add roleId FK to existing workspace_members table
ALTER TABLE "workspace_members" ADD COLUMN IF NOT EXISTS "roleId" integer;
