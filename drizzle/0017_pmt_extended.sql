-- 0017_pmt_extended.sql
-- PMT Module: new columns on pmt_tasks + all Phase 1-6 tables

-- ============================================================================
-- ALTER pmt_tasks — new columns added in Phases 1-3
-- ============================================================================

ALTER TABLE "pmt_tasks" ADD COLUMN IF NOT EXISTS "type" varchar(30) DEFAULT 'task';
ALTER TABLE "pmt_tasks" ADD COLUMN IF NOT EXISTS "accountableId" integer REFERENCES "users"("id");
ALTER TABLE "pmt_tasks" ADD COLUMN IF NOT EXISTS "parentId" integer;
ALTER TABLE "pmt_tasks" ADD COLUMN IF NOT EXISTS "sprintId" integer;
ALTER TABLE "pmt_tasks" ADD COLUMN IF NOT EXISTS "startDate" timestamp;
ALTER TABLE "pmt_tasks" ADD COLUMN IF NOT EXISTS "estimatedHours" integer;
ALTER TABLE "pmt_tasks" ADD COLUMN IF NOT EXISTS "remainingHours" integer;
ALTER TABLE "pmt_tasks" ADD COLUMN IF NOT EXISTS "percentComplete" integer DEFAULT 0;
ALTER TABLE "pmt_tasks" ADD COLUMN IF NOT EXISTS "storyPoints" integer;
ALTER TABLE "pmt_tasks" ADD COLUMN IF NOT EXISTS "labels" json;
ALTER TABLE "pmt_tasks" ADD COLUMN IF NOT EXISTS "position" integer;

-- ALTER pmt_projects — new columns
ALTER TABLE "pmt_projects" ADD COLUMN IF NOT EXISTS "parentProjectId" integer;
ALTER TABLE "pmt_projects" ADD COLUMN IF NOT EXISTS "lifecycle" varchar(30) DEFAULT 'active';

-- New indexes on pmt_tasks
CREATE INDEX IF NOT EXISTS "idx_pmt_tasks_type" ON "pmt_tasks"("type");
CREATE INDEX IF NOT EXISTS "idx_pmt_tasks_parent" ON "pmt_tasks"("parentId");
CREATE INDEX IF NOT EXISTS "idx_pmt_tasks_assignee" ON "pmt_tasks"("assigneeId");
CREATE INDEX IF NOT EXISTS "idx_pmt_tasks_sprint" ON "pmt_tasks"("sprintId");

-- ============================================================================
-- Phase 1: Comments, Attachments, Watchers
-- ============================================================================

CREATE TABLE IF NOT EXISTS "pm_comments" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "workItemId" integer NOT NULL REFERENCES "pmt_tasks"("id"),
  "parentId" integer,
  "authorId" integer REFERENCES "users"("id"),
  "authorType" varchar(20) DEFAULT 'human',
  "content" text NOT NULL,
  "mentions" json,
  "metadata" json,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pm_comments_work_item" ON "pm_comments"("workItemId");
CREATE INDEX IF NOT EXISTS "idx_pm_comments_ws" ON "pm_comments"("workspaceId");
CREATE INDEX IF NOT EXISTS "idx_pm_comments_parent" ON "pm_comments"("parentId");

CREATE TABLE IF NOT EXISTS "pm_attachments" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "workItemId" integer NOT NULL REFERENCES "pmt_tasks"("id"),
  "fileName" varchar(500) NOT NULL,
  "fileSize" integer NOT NULL,
  "mimeType" varchar(100),
  "storagePath" text NOT NULL,
  "uploadedBy" integer REFERENCES "users"("id"),
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pm_attachments_work_item" ON "pm_attachments"("workItemId");
CREATE INDEX IF NOT EXISTS "idx_pm_attachments_ws" ON "pm_attachments"("workspaceId");

CREATE TABLE IF NOT EXISTS "pm_watchers" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "workItemId" integer NOT NULL REFERENCES "pmt_tasks"("id"),
  "userId" integer NOT NULL REFERENCES "users"("id"),
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pm_watchers_work_item" ON "pm_watchers"("workItemId");
CREATE INDEX IF NOT EXISTS "idx_pm_watchers_ws" ON "pm_watchers"("workspaceId");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_pm_watchers_unique" ON "pm_watchers"("workItemId", "userId");

-- ============================================================================
-- Phase 2: Config, Custom Fields, Views, Versions, Baselines
-- ============================================================================

CREATE TABLE IF NOT EXISTS "pm_statuses" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "name" varchar(100) NOT NULL,
  "color" varchar(7) NOT NULL,
  "isClosed" boolean DEFAULT false,
  "isDefault" boolean DEFAULT false,
  "position" integer NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pm_statuses_ws" ON "pm_statuses"("workspaceId");

CREATE TABLE IF NOT EXISTS "pm_types" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "name" varchar(100) NOT NULL,
  "color" varchar(7),
  "icon" varchar(50),
  "isDefault" boolean DEFAULT false,
  "isMilestone" boolean DEFAULT false,
  "position" integer NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pm_types_ws" ON "pm_types"("workspaceId");

CREATE TABLE IF NOT EXISTS "pm_workflows" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "typeId" integer NOT NULL REFERENCES "pm_types"("id"),
  "fromStatusId" integer NOT NULL REFERENCES "pm_statuses"("id"),
  "toStatusId" integer NOT NULL REFERENCES "pm_statuses"("id"),
  "roleId" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pm_workflows_ws" ON "pm_workflows"("workspaceId");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_pm_workflows_unique" ON "pm_workflows"("workspaceId", "typeId", "fromStatusId", "toStatusId");

CREATE TABLE IF NOT EXISTS "pm_custom_fields" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "name" varchar(255) NOT NULL,
  "fieldType" varchar(30) NOT NULL,
  "options" json,
  "required" boolean DEFAULT false,
  "position" integer NOT NULL,
  "helpText" text,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pm_custom_fields_ws" ON "pm_custom_fields"("workspaceId");

CREATE TABLE IF NOT EXISTS "pm_custom_values" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "workItemId" integer NOT NULL REFERENCES "pmt_tasks"("id"),
  "fieldId" integer NOT NULL REFERENCES "pm_custom_fields"("id"),
  "value" text
);
CREATE INDEX IF NOT EXISTS "idx_pm_custom_values_ws" ON "pm_custom_values"("workspaceId");
CREATE INDEX IF NOT EXISTS "idx_pm_custom_values_work_item" ON "pm_custom_values"("workItemId");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_pm_custom_values_unique" ON "pm_custom_values"("workItemId", "fieldId");

CREATE TABLE IF NOT EXISTS "pm_saved_views" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "projectId" integer REFERENCES "pmt_projects"("id"),
  "name" varchar(255) NOT NULL,
  "viewType" varchar(20) NOT NULL,
  "config" json NOT NULL,
  "isDefault" boolean DEFAULT false,
  "isPublic" boolean DEFAULT true,
  "ownerId" integer REFERENCES "users"("id"),
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pm_saved_views_ws" ON "pm_saved_views"("workspaceId");
CREATE INDEX IF NOT EXISTS "idx_pm_saved_views_project" ON "pm_saved_views"("projectId");

CREATE TABLE IF NOT EXISTS "pm_versions" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "projectId" integer NOT NULL REFERENCES "pmt_projects"("id"),
  "name" varchar(255) NOT NULL,
  "description" text,
  "status" varchar(30) DEFAULT 'open',
  "startDate" timestamp,
  "dueDate" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pm_versions_ws" ON "pm_versions"("workspaceId");
CREATE INDEX IF NOT EXISTS "idx_pm_versions_project" ON "pm_versions"("projectId");

CREATE TABLE IF NOT EXISTS "pm_baselines" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "projectId" integer NOT NULL REFERENCES "pmt_projects"("id"),
  "name" varchar(255) NOT NULL,
  "snapshot" json NOT NULL,
  "createdBy" integer REFERENCES "users"("id"),
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pm_baselines_ws" ON "pm_baselines"("workspaceId");
CREATE INDEX IF NOT EXISTS "idx_pm_baselines_project" ON "pm_baselines"("projectId");

-- ============================================================================
-- Phase 3: Sprints, Meetings, Discussions, News
-- ============================================================================

CREATE TABLE IF NOT EXISTS "pm_sprints" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "projectId" integer NOT NULL REFERENCES "pmt_projects"("id"),
  "name" varchar(255) NOT NULL,
  "goal" text,
  "status" varchar(20) DEFAULT 'planning',
  "startDate" timestamp NOT NULL,
  "endDate" timestamp NOT NULL,
  "velocity" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pm_sprints_ws" ON "pm_sprints"("workspaceId");
CREATE INDEX IF NOT EXISTS "idx_pm_sprints_project" ON "pm_sprints"("projectId");

CREATE TABLE IF NOT EXISTS "pm_meetings" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "projectId" integer REFERENCES "pmt_projects"("id"),
  "title" varchar(500) NOT NULL,
  "location" varchar(500),
  "startTime" timestamp NOT NULL,
  "endTime" timestamp,
  "createdBy" integer REFERENCES "users"("id"),
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pm_meetings_ws" ON "pm_meetings"("workspaceId");

CREATE TABLE IF NOT EXISTS "pm_meeting_items" (
  "id" serial PRIMARY KEY,
  "meetingId" integer NOT NULL REFERENCES "pm_meetings"("id"),
  "itemType" varchar(20) NOT NULL,
  "content" text NOT NULL,
  "assigneeId" integer REFERENCES "users"("id"),
  "position" integer NOT NULL,
  "done" boolean DEFAULT false
);
CREATE INDEX IF NOT EXISTS "idx_pm_meeting_items_meeting" ON "pm_meeting_items"("meetingId");

CREATE TABLE IF NOT EXISTS "pm_discussions" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "projectId" integer REFERENCES "pmt_projects"("id"),
  "title" varchar(500) NOT NULL,
  "pinned" boolean DEFAULT false,
  "locked" boolean DEFAULT false,
  "createdBy" integer REFERENCES "users"("id"),
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pm_discussions_ws" ON "pm_discussions"("workspaceId");

CREATE TABLE IF NOT EXISTS "pm_discussion_posts" (
  "id" serial PRIMARY KEY,
  "discussionId" integer NOT NULL REFERENCES "pm_discussions"("id"),
  "authorId" integer REFERENCES "users"("id"),
  "content" text NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pm_discussion_posts_disc" ON "pm_discussion_posts"("discussionId");

CREATE TABLE IF NOT EXISTS "pm_news" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "projectId" integer REFERENCES "pmt_projects"("id"),
  "title" varchar(500) NOT NULL,
  "summary" text,
  "content" text,
  "authorId" integer REFERENCES "users"("id"),
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pm_news_ws" ON "pm_news"("workspaceId");

-- ============================================================================
-- Phase 4: Time & Cost Tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS "pm_activity_types" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "name" varchar(100) NOT NULL,
  "billable" boolean DEFAULT true,
  "position" integer NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pm_activity_types_ws" ON "pm_activity_types"("workspaceId");

CREATE TABLE IF NOT EXISTS "pm_time_entries" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "workItemId" integer REFERENCES "pmt_tasks"("id"),
  "projectId" integer NOT NULL REFERENCES "pmt_projects"("id"),
  "userId" integer NOT NULL REFERENCES "users"("id"),
  "activityTypeId" integer REFERENCES "pm_activity_types"("id"),
  "hours" real NOT NULL,
  "comment" text,
  "spentOn" timestamp NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pm_time_entries_ws" ON "pm_time_entries"("workspaceId");
CREATE INDEX IF NOT EXISTS "idx_pm_time_entries_project" ON "pm_time_entries"("projectId");
CREATE INDEX IF NOT EXISTS "idx_pm_time_entries_user" ON "pm_time_entries"("userId");

CREATE TABLE IF NOT EXISTS "pm_cost_entries" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "workItemId" integer REFERENCES "pmt_tasks"("id"),
  "projectId" integer NOT NULL REFERENCES "pmt_projects"("id"),
  "userId" integer NOT NULL REFERENCES "users"("id"),
  "units" real NOT NULL,
  "unitCost" real NOT NULL,
  "comment" text,
  "spentOn" timestamp NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pm_cost_entries_ws" ON "pm_cost_entries"("workspaceId");
CREATE INDEX IF NOT EXISTS "idx_pm_cost_entries_project" ON "pm_cost_entries"("projectId");

CREATE TABLE IF NOT EXISTS "pm_budgets" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "projectId" integer NOT NULL REFERENCES "pmt_projects"("id"),
  "name" varchar(255) NOT NULL,
  "description" text,
  "plannedLabor" real DEFAULT 0,
  "plannedUnits" real DEFAULT 0,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pm_budgets_ws" ON "pm_budgets"("workspaceId");
CREATE INDEX IF NOT EXISTS "idx_pm_budgets_project" ON "pm_budgets"("projectId");

-- ============================================================================
-- Phase 5: Integrations — Git, Templates, Custom Actions, Notifications, Webhooks
-- ============================================================================

CREATE TABLE IF NOT EXISTS "pm_git_references" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "workItemId" integer NOT NULL REFERENCES "pmt_tasks"("id"),
  "provider" varchar(20) NOT NULL,
  "refType" varchar(20) NOT NULL,
  "refId" varchar(255) NOT NULL,
  "refUrl" text NOT NULL,
  "refTitle" text,
  "refState" varchar(30),
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pm_git_references_ws" ON "pm_git_references"("workspaceId");
CREATE INDEX IF NOT EXISTS "idx_pm_git_references_work_item" ON "pm_git_references"("workItemId");

CREATE TABLE IF NOT EXISTS "pm_project_templates" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "name" varchar(255) NOT NULL,
  "description" text,
  "templateData" json NOT NULL,
  "createdBy" integer REFERENCES "users"("id"),
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pm_project_templates_ws" ON "pm_project_templates"("workspaceId");

CREATE TABLE IF NOT EXISTS "pm_work_item_templates" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "name" varchar(255) NOT NULL,
  "description" text,
  "templateData" json NOT NULL,
  "typeId" integer,
  "createdBy" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pm_work_item_templates_ws" ON "pm_work_item_templates"("workspaceId");

CREATE TABLE IF NOT EXISTS "pm_custom_actions" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "name" varchar(255) NOT NULL,
  "description" text,
  "conditions" json NOT NULL,
  "changes" json NOT NULL,
  "position" integer NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pm_custom_actions_ws" ON "pm_custom_actions"("workspaceId");

CREATE TABLE IF NOT EXISTS "pm_notifications" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "userId" integer NOT NULL,
  "workItemId" integer,
  "type" varchar(50) NOT NULL,
  "message" text NOT NULL,
  "readAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pm_notifications_ws" ON "pm_notifications"("workspaceId");
CREATE INDEX IF NOT EXISTS "idx_pm_notifications_user" ON "pm_notifications"("userId");

CREATE TABLE IF NOT EXISTS "pm_webhooks" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id"),
  "name" varchar(255) NOT NULL,
  "url" text NOT NULL,
  "events" json NOT NULL,
  "secret" varchar(255),
  "active" boolean DEFAULT true,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pm_webhooks_ws" ON "pm_webhooks"("workspaceId");
