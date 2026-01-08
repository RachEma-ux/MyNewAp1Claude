-- Migration: Add LLM Control Plane tables and agentVersions
-- Generated: 2026-01-08
-- Description: Adds 7 new tables for LLM Control Plane system and Agent Versioning

-- =============================================================================
-- Agent Versions Table
-- =============================================================================
CREATE TABLE `agentVersions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`version` int NOT NULL,
	`createdBy` int NOT NULL,
	`changeNotes` text,
	`agentSnapshot` json NOT NULL,
	`policyDigest` varchar(64),
	`policySetHash` varchar(64),
	`promotionRequestId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agentVersions_id` PRIMARY KEY(`id`)
);

-- =============================================================================
-- LLM Identity Table
-- =============================================================================
CREATE TABLE `llms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`role` enum('planner','executor','router','guard','observer','embedder') NOT NULL,
	`ownerTeam` varchar(255),
	`archived` boolean DEFAULT false,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `llms_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_llm_name` ON `llms` (`name`);
CREATE INDEX `idx_llm_role` ON `llms` (`role`);

-- =============================================================================
-- LLM Versions Table
-- =============================================================================
CREATE TABLE `llm_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`llmId` int NOT NULL,
	`version` int NOT NULL,
	`environment` enum('sandbox','governed','production') NOT NULL DEFAULT 'sandbox',
	`config` json NOT NULL,
	`configHash` varchar(64) NOT NULL,
	`policyBundleRef` varchar(512),
	`policyHash` varchar(64),
	`policyDecision` enum('pass','warn','deny') DEFAULT 'pass',
	`policyViolations` json,
	`attestationContract` json,
	`attestationStatus` enum('pending','attested','stale','failed','revoked') DEFAULT 'pending',
	`driftStatus` enum('none','benign','suspicious','critical') DEFAULT 'none',
	`callable` boolean DEFAULT false,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`changeNotes` text,
	`promotionRequestId` int,
	CONSTRAINT `llm_versions_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_llm_version_llm_id` ON `llm_versions` (`llmId`);
CREATE INDEX `idx_llm_version_env` ON `llm_versions` (`environment`);
CREATE INDEX `idx_llm_version_callable` ON `llm_versions` (`callable`);
CREATE UNIQUE INDEX `unique_llm_version` ON `llm_versions` (`llmId`,`version`);

-- =============================================================================
-- LLM Promotions Table
-- =============================================================================
CREATE TABLE `llm_promotions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`llmVersionId` int NOT NULL,
	`fromEnvironment` enum('sandbox','governed','production') NOT NULL,
	`toEnvironment` enum('sandbox','governed','production') NOT NULL,
	`status` enum('pending','simulated','approved','rejected','executed','failed') NOT NULL DEFAULT 'pending',
	`simulationResults` json,
	`simulatedAt` timestamp,
	`requestedBy` int NOT NULL,
	`requestedAt` timestamp NOT NULL DEFAULT (now()),
	`approvedBy` int,
	`approvedAt` timestamp,
	`approvalComment` text,
	`rejectedBy` int,
	`rejectedAt` timestamp,
	`rejectionReason` text,
	`executedAt` timestamp,
	`executionError` text,
	`newVersionId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `llm_promotions_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_promotion_version` ON `llm_promotions` (`llmVersionId`);
CREATE INDEX `idx_promotion_status` ON `llm_promotions` (`status`);

-- =============================================================================
-- LLM Attestations Table
-- =============================================================================
CREATE TABLE `llm_attestations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`llmVersionId` int NOT NULL,
	`status` enum('attested','stale','failed','revoked') NOT NULL,
	`evidence` json NOT NULL,
	`evidenceHash` varchar(64),
	`imageDigest` varchar(255),
	`configHash` varchar(64),
	`workloadIdentity` varchar(512),
	`submittedAt` timestamp NOT NULL,
	`verifiedAt` timestamp,
	`expiresAt` timestamp,
	`revokedAt` timestamp,
	`revokedBy` int,
	`revocationReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `llm_attestations_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_attestation_version` ON `llm_attestations` (`llmVersionId`);
CREATE INDEX `idx_attestation_status` ON `llm_attestations` (`status`);

-- =============================================================================
-- LLM Drift Events Table
-- =============================================================================
CREATE TABLE `llm_drift_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`llmVersionId` int NOT NULL,
	`severity` enum('benign','suspicious','critical') NOT NULL,
	`signal` varchar(255) NOT NULL,
	`expected` json NOT NULL,
	`observed` json NOT NULL,
	`responseAction` enum('warn','block_new','immediate_revoke'),
	`responseTaken` boolean DEFAULT false,
	`detectedAt` timestamp NOT NULL,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `llm_drift_events_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_drift_version` ON `llm_drift_events` (`llmVersionId`);
CREATE INDEX `idx_drift_severity` ON `llm_drift_events` (`severity`);

-- =============================================================================
-- LLM Audit Events Table
-- =============================================================================
CREATE TABLE `llm_audit_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventType` varchar(100) NOT NULL,
	`llmId` int,
	`llmVersionId` int,
	`promotionId` int,
	`actor` int,
	`actorType` enum('user','system') DEFAULT 'user',
	`payload` json NOT NULL,
	`configHash` varchar(64),
	`policyHash` varchar(64),
	`eventSignature` text,
	`environment` enum('sandbox','governed','production'),
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `llm_audit_events_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_audit_event_type` ON `llm_audit_events` (`eventType`);
CREATE INDEX `idx_audit_llm_id` ON `llm_audit_events` (`llmId`);
CREATE INDEX `idx_audit_timestamp` ON `llm_audit_events` (`timestamp`);
