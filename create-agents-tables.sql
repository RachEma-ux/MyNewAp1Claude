-- Create agents table
CREATE TABLE IF NOT EXISTS `agents` (
  `id` VARCHAR(191) PRIMARY KEY,
  `workspaceId` INT,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `mode` ENUM('draft', 'sandbox', 'governed') DEFAULT 'draft',
  `governanceStatus` ENUM('SANDBOX', 'GOVERNED_VALID', 'GOVERNED_RESTRICTED', 'GOVERNED_INVALIDATED') DEFAULT 'SANDBOX',
  `spec` JSON NOT NULL,
  `proofBundle` JSON,
  `capabilities` JSON,
  `budget` JSON,
  `llm` JSON,
  `expiresAt` TIMESTAMP NULL,
  `createdBy` INT NOT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_workspace` (`workspaceId`),
  INDEX `idx_mode` (`mode`),
  INDEX `idx_status` (`governanceStatus`)
);

-- Create agent_proofs table
CREATE TABLE IF NOT EXISTS `agent_proofs` (
  `id` VARCHAR(191) PRIMARY KEY,
  `agentId` VARCHAR(191) NOT NULL,
  `specHash` VARCHAR(255) NOT NULL,
  `policyHash` VARCHAR(255) NOT NULL,
  `signature` TEXT NOT NULL,
  `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE CASCADE,
  INDEX `idx_agent` (`agentId`)
);

-- Create policy_versions table
CREATE TABLE IF NOT EXISTS `policy_versions` (
  `id` VARCHAR(191) PRIMARY KEY,
  `version` VARCHAR(50) NOT NULL,
  `hash` VARCHAR(255) NOT NULL,
  `content` TEXT NOT NULL,
  `cosignVerified` BOOLEAN DEFAULT FALSE,
  `active` BOOLEAN DEFAULT FALSE,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_version` (`version`),
  INDEX `idx_active` (`active`)
);

-- Create agent_history table
CREATE TABLE IF NOT EXISTS `agent_history` (
  `id` VARCHAR(191) PRIMARY KEY,
  `agentId` VARCHAR(191) NOT NULL,
  `eventType` ENUM('created', 'promoted', 'modified', 'status_changed') NOT NULL,
  `changes` JSON,
  `actor` VARCHAR(255),
  `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE CASCADE,
  INDEX `idx_agent` (`agentId`),
  INDEX `idx_timestamp` (`timestamp`)
);

-- Create protocols table
CREATE TABLE IF NOT EXISTS `protocols` (
  `id` VARCHAR(191) PRIMARY KEY,
  `workspaceId` INT,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `content` TEXT NOT NULL,
  `version` INT DEFAULT 1,
  `tags` JSON,
  `fileName` VARCHAR(255),
  `fileSize` INT,
  `createdBy` INT NOT NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_workspace` (`workspaceId`)
);

-- Create promotion_requests table
CREATE TABLE IF NOT EXISTS `promotion_requests` (
  `id` VARCHAR(191) PRIMARY KEY,
  `agentId` VARCHAR(191) NOT NULL,
  `requestedBy` INT NOT NULL,
  `status` ENUM('pending', 'approved', 'rejected', 'executed') DEFAULT 'pending',
  `approvedBy` INT,
  `rejectedBy` INT,
  `rejectionReason` TEXT,
  `slaDeadline` TIMESTAMP,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `approvedAt` TIMESTAMP NULL,
  `rejectedAt` TIMESTAMP NULL,
  `executedAt` TIMESTAMP NULL,
  FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE CASCADE,
  INDEX `idx_agent` (`agentId`),
  INDEX `idx_status` (`status`)
);

-- Create promotion_events table
CREATE TABLE IF NOT EXISTS `promotion_events` (
  `id` VARCHAR(191) PRIMARY KEY,
  `requestId` VARCHAR(191) NOT NULL,
  `eventType` ENUM('created', 'approved', 'rejected', 'executed') NOT NULL,
  `actor` INT NOT NULL,
  `details` JSON,
  `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`requestId`) REFERENCES `promotion_requests`(`id`) ON DELETE CASCADE,
  INDEX `idx_request` (`requestId`)
);
