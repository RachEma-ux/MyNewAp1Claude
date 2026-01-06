CREATE TABLE `action_registry` (
	`id` int AUTO_INCREMENT NOT NULL,
	`typeId` varchar(100) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`category` enum('control','logic','communication','integration','data','file','ai','human','security','observability','system','custom') NOT NULL,
	`semanticVersion` varchar(20) NOT NULL,
	`icon` varchar(50),
	`classification` enum('side-effecting','transformational','control-flow','ai-agent') NOT NULL,
	`isDeterministic` boolean NOT NULL,
	`isIdempotent` boolean NOT NULL,
	`safeByDefault` boolean NOT NULL DEFAULT true,
	`intentDoc` text NOT NULL,
	`sideEffects` json NOT NULL,
	`configSchema` json NOT NULL,
	`configSchemaVersion` int NOT NULL DEFAULT 1,
	`defaultConfig` json,
	`uiRenderer` text,
	`requiredFields` json,
	`unsafeOptions` json,
	`validationRules` json,
	`retryBehaviorVisible` boolean NOT NULL DEFAULT true,
	`timeoutBehaviorVisible` boolean NOT NULL DEFAULT true,
	`failureBehaviorVisible` boolean NOT NULL DEFAULT true,
	`inputContract` json NOT NULL,
	`outputContract` json NOT NULL,
	`outputTypes` json,
	`noGlobalMutation` boolean NOT NULL DEFAULT true,
	`executionMode` enum('sync','async') NOT NULL,
	`blockingBehavior` enum('blocking','non-blocking') NOT NULL,
	`retryPolicy` json,
	`timeoutPolicy` json,
	`failureHandling` json,
	`stateTier` enum('ephemeral','durable') NOT NULL,
	`maxStateSize` int,
	`concurrentIsolation` text,
	`compensationStrategy` text NOT NULL,
	`compensationAutomation` json,
	`workflowFailureHandler` json,
	`idempotencyKeyField` varchar(100),
	`partialRollbackPaths` json,
	`requiredPermissions` json,
	`riskLevel` enum('low','medium','high','critical') NOT NULL,
	`preExecutionPolicies` json,
	`secretFields` json,
	`promptVariableSanitization` json,
	`tokenCap` int,
	`costCap` int,
	`outputSchema` json,
	`confidenceScoreExposed` boolean DEFAULT false,
	`highRiskDefinition` json,
	`humanInLoopRequired` boolean DEFAULT false,
	`tenantScoped` boolean NOT NULL DEFAULT true,
	`tenantIsolation` text,
	`metricsConfig` json,
	`logFields` json,
	`errorClassification` json,
	`performanceProfile` enum('light','standard','heavy') NOT NULL,
	`latencySLA` json,
	`throughputExpectation` int,
	`degradationBehavior` text,
	`rateLimits` json,
	`costQuotas` json,
	`backpressureStrategy` text,
	`purposeDoc` text NOT NULL,
	`useCases` json,
	`failureModes` json,
	`securityConsiderations` text,
	`examples` json,
	`testCoverage` json,
	`dryRunSupported` boolean NOT NULL DEFAULT false,
	`simulationConfig` json,
	`deprecationNotice` text,
	`migrationPath` text,
	`replacementTypeId` varchar(100),
	`subWorkflowSupport` boolean NOT NULL DEFAULT false,
	`maxNestingDepth` int DEFAULT 5,
	`variableScopingRules` text,
	`failureBubblingRules` text,
	`handlerCode` text,
	`handlerType` enum('inline','external','api') NOT NULL,
	`handlerEndpoint` varchar(500),
	`requiresNetwork` boolean NOT NULL DEFAULT false,
	`requiresSecrets` boolean NOT NULL DEFAULT false,
	`hasSideEffects` boolean NOT NULL DEFAULT false,
	`hasCost` boolean NOT NULL DEFAULT false,
	`status` enum('draft','pending_approval','approved','rejected','deprecated') NOT NULL DEFAULT 'draft',
	`approvedBy` int,
	`approvedAt` timestamp,
	`rejectionReason` text,
	`criticalViolations` int NOT NULL DEFAULT 0,
	`majorIssues` int NOT NULL DEFAULT 0,
	`complianceScore` int,
	`lastValidated` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `action_registry_id` PRIMARY KEY(`id`),
	CONSTRAINT `action_registry_typeId_unique` UNIQUE(`typeId`)
);
--> statement-breakpoint
CREATE TABLE `agent_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`eventType` enum('created','promoted','policy_changed','status_updated','modified','deleted') NOT NULL,
	`eventData` json,
	`oldStatus` varchar(50),
	`newStatus` varchar(50),
	`actorId` int,
	`actorName` varchar(255),
	`description` text,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agent_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agent_proofs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentSpecId` int NOT NULL,
	`policyDecision` enum('PASS','FAIL') NOT NULL,
	`policyHash` varchar(255) NOT NULL,
	`specHash` varchar(255) NOT NULL,
	`authority` varchar(255) NOT NULL,
	`signedAt` timestamp NOT NULL,
	`signature` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agent_proofs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agent_specs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`version` varchar(50) NOT NULL,
	`description` text,
	`roleClass` enum('compliance','analysis','ideation') NOT NULL,
	`mode` enum('sandbox','governed') NOT NULL,
	`governanceStatus` enum('SANDBOX','GOVERNED_VALID','GOVERNED_RESTRICTED','GOVERNED_INVALIDATED') NOT NULL DEFAULT 'SANDBOX',
	`anatomy` json NOT NULL,
	`localConstraints` json NOT NULL,
	`sandboxConstraints` json,
	`governance` json,
	`proofId` int,
	`expiresAt` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agent_specs_id` PRIMARY KEY(`id`),
	CONSTRAINT `unique_name_version` UNIQUE(`workspaceId`,`name`,`version`)
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`systemPrompt` text NOT NULL,
	`modelId` int,
	`temperature` varchar(10) DEFAULT '0.7',
	`hasDocumentAccess` boolean DEFAULT true,
	`hasToolAccess` boolean DEFAULT false,
	`allowedTools` json,
	`maxIterations` int DEFAULT 10,
	`autoSummarize` boolean DEFAULT false,
	`lifecycleState` enum('draft','sandbox','governed','disabled') DEFAULT 'draft',
	`lifecycleVersion` int DEFAULT 1,
	`origin` varchar(50) DEFAULT 'scratch',
	`trigger` json,
	`limits` json,
	`anatomy` json,
	`policyContext` json,
	`mode` enum('sandbox','governed') DEFAULT 'sandbox',
	`governanceStatus` enum('SANDBOX','GOVERNED_VALID','GOVERNED_RESTRICTED','GOVERNED_INVALIDATED') DEFAULT 'SANDBOX',
	`governance` json,
	`version` int DEFAULT 1,
	`roleClass` varchar(50) DEFAULT 'assistant',
	`sandboxConstraints` json,
	`expiresAt` timestamp,
	`proofId` varchar(255),
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`agentId` int,
	`title` varchar(500),
	`userId` int NOT NULL,
	`modelId` int,
	`temperature` varchar(10),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `document_chunks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentId` int NOT NULL,
	`content` text NOT NULL,
	`chunkIndex` int NOT NULL,
	`pageNumber` int,
	`heading` varchar(500),
	`vectorId` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `document_chunks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`filename` varchar(255) NOT NULL,
	`fileType` varchar(50) NOT NULL,
	`fileSize` int NOT NULL,
	`fileUrl` text NOT NULL,
	`fileKey` varchar(500) NOT NULL,
	`status` enum('pending','processing','completed','error') DEFAULT 'pending',
	`errorMessage` text,
	`title` varchar(500),
	`author` varchar(255),
	`pageCount` int,
	`wordCount` int,
	`chunkCount` int DEFAULT 0,
	`embeddingModel` varchar(255),
	`uploadedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `download_analytics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`downloadId` int NOT NULL,
	`modelId` int NOT NULL,
	`userId` int NOT NULL,
	`instantSpeed` varchar(50),
	`averageSpeed` varchar(50),
	`bytesDownloaded` varchar(50),
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`elapsedSeconds` int DEFAULT 0,
	`connectionType` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `download_analytics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `hardware_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cpuModel` varchar(255),
	`cpuCores` int,
	`cpuThreads` int,
	`gpuModel` varchar(255),
	`gpuVram` int,
	`gpuDriver` varchar(100),
	`gpuComputeCapability` varchar(50),
	`totalRamMb` int,
	`availableRamMb` int,
	`supportsCuda` boolean DEFAULT false,
	`supportsRocm` boolean DEFAULT false,
	`supportsMetal` boolean DEFAULT false,
	`performanceScore` int,
	`detectedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hardware_profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `knowledge_packs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`category` varchar(100),
	`version` varchar(50) NOT NULL,
	`documentCount` int DEFAULT 0,
	`totalSize` int DEFAULT 0,
	`packData` json NOT NULL,
	`createdBy` int NOT NULL,
	`isPublic` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledge_packs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`role` enum('user','assistant','system') NOT NULL,
	`content` text NOT NULL,
	`tokenCount` int,
	`retrievedChunks` json,
	`toolCalls` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `model_benchmarks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`modelId` int NOT NULL,
	`benchmarkType` enum('speed','quality','memory','cost') NOT NULL,
	`benchmarkName` varchar(255) NOT NULL,
	`score` varchar(50),
	`tokensPerSecond` int,
	`memoryUsageMb` int,
	`costPer1kTokens` varchar(20),
	`metadata` json,
	`runBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `model_benchmarks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `model_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`modelId` int NOT NULL,
	`userId` int NOT NULL,
	`temperature` varchar(10) DEFAULT '0.7',
	`topP` varchar(10) DEFAULT '0.9',
	`topK` int DEFAULT 40,
	`maxTokens` int DEFAULT 2048,
	`repeatPenalty` varchar(10) DEFAULT '1.1',
	`stopSequences` json,
	`systemPrompt` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `model_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `model_conversions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`modelId` int NOT NULL,
	`userId` int NOT NULL,
	`sourceFormat` varchar(50) NOT NULL,
	`targetFormat` varchar(50) NOT NULL,
	`quantization` varchar(50),
	`sourcePath` text NOT NULL,
	`outputPath` text,
	`status` enum('queued','converting','completed','failed') DEFAULT 'queued',
	`progress` int DEFAULT 0,
	`outputSize` varchar(50),
	`errorMessage` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `model_conversions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `model_downloads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`modelId` int NOT NULL,
	`userId` int NOT NULL,
	`sourceUrl` text NOT NULL,
	`destinationPath` text,
	`fileSize` varchar(50),
	`status` enum('queued','downloading','paused','completed','failed') DEFAULT 'queued',
	`progress` int DEFAULT 0,
	`bytesDownloaded` varchar(50) DEFAULT '0',
	`downloadSpeed` varchar(50),
	`priority` int DEFAULT 0,
	`scheduledFor` timestamp,
	`bandwidthLimit` int,
	`errorMessage` text,
	`retryCount` int DEFAULT 0,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `model_downloads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `model_share_references` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shareId` int NOT NULL,
	`userId` int,
	`workspaceId` int,
	`lastUsedAt` timestamp DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `model_share_references_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `model_shares` (
	`id` int AUTO_INCREMENT NOT NULL,
	`modelId` int NOT NULL,
	`storagePath` text NOT NULL,
	`fileSize` varchar(50),
	`checksum` varchar(128),
	`referenceCount` int NOT NULL DEFAULT 1,
	`shareScope` enum('user','workspace','global') DEFAULT 'user',
	`ownerId` int NOT NULL,
	`lastAccessedAt` timestamp DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `model_shares_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `model_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`modelId` int NOT NULL,
	`version` varchar(50) NOT NULL,
	`releaseDate` timestamp,
	`sourceUrl` text,
	`fileSize` varchar(50),
	`checksum` varchar(128),
	`changelog` text,
	`isLatest` boolean DEFAULT false,
	`isDeprecated` boolean DEFAULT false,
	`downloadCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `model_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `models` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`displayName` varchar(255) NOT NULL,
	`modelType` enum('llm','embedding','reranker') NOT NULL,
	`huggingFaceId` varchar(255),
	`architecture` varchar(100),
	`parameterCount` varchar(50),
	`quantization` varchar(50),
	`contextLength` int,
	`fileSize` varchar(50),
	`filePath` text,
	`fileFormat` varchar(50) DEFAULT 'gguf',
	`status` enum('downloading','converting','ready','error') DEFAULT 'ready',
	`downloadProgress` int DEFAULT 0,
	`tokensPerSecond` int,
	`memoryUsageMb` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `models_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `plugins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`displayName` varchar(255) NOT NULL,
	`description` text,
	`version` varchar(50) NOT NULL,
	`author` varchar(255),
	`runtime` enum('python','node') NOT NULL,
	`entryPoint` varchar(500) NOT NULL,
	`permissions` json NOT NULL,
	`enabled` boolean DEFAULT true,
	`verified` boolean DEFAULT false,
	`installedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `plugins_id` PRIMARY KEY(`id`),
	CONSTRAINT `plugins_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `policy_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`policySet` varchar(255) NOT NULL,
	`version` varchar(50) NOT NULL,
	`bundle` json NOT NULL,
	`policyHash` varchar(255) NOT NULL,
	`revokedSigners` json DEFAULT ('[]'),
	`invalidatedAgents` json DEFAULT ('{}'),
	`loadedAt` timestamp NOT NULL,
	`loadedBy` int NOT NULL,
	`isCurrent` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `policy_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `unique_policy_version` UNIQUE(`policySet`,`version`)
);
--> statement-breakpoint
CREATE TABLE `promotion_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`requestedBy` int NOT NULL,
	`status` enum('pending','approved','rejected','cancelled') DEFAULT 'pending',
	`justification` text,
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`reviewNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `promotion_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `protocols` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`content` text NOT NULL,
	`version` int DEFAULT 1,
	`tags` json,
	`fileName` varchar(255),
	`fileSize` int,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `protocols_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `provider_health_checks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`providerId` int NOT NULL,
	`status` enum('healthy','degraded','down') NOT NULL,
	`responseTimeMs` int,
	`errorMessage` text,
	`checkedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `provider_health_checks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `provider_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`providerId` int NOT NULL,
	`avgLatencyMs` int,
	`p95LatencyMs` int,
	`p99LatencyMs` int,
	`tokensPerSecond` int,
	`successRate` varchar(10),
	`errorRate` varchar(10),
	`uptime` varchar(10),
	`totalRequests` int DEFAULT 0,
	`totalTokens` int DEFAULT 0,
	`totalCost` varchar(20),
	`periodStart` timestamp NOT NULL,
	`periodEnd` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `provider_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `provider_usage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`providerId` int NOT NULL,
	`modelName` varchar(255),
	`tokensUsed` int NOT NULL,
	`cost` varchar(20),
	`latencyMs` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `provider_usage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `providers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` enum('local-llamacpp','local-ollama','openai','anthropic','google','custom') NOT NULL,
	`enabled` boolean DEFAULT true,
	`priority` int DEFAULT 50,
	`config` json NOT NULL,
	`costPer1kTokens` varchar(20),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `providers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `secrets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`key` varchar(255) NOT NULL,
	`encryptedValue` text NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `secrets_id` PRIMARY KEY(`id`),
	CONSTRAINT `unique_user_key` UNIQUE(`userId`,`key`)
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settingKey` varchar(255) NOT NULL,
	`settingValue` text NOT NULL,
	`settingType` enum('string','number','boolean','json') NOT NULL,
	`description` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_settings_settingKey_unique` UNIQUE(`settingKey`)
);
--> statement-breakpoint
CREATE TABLE `trigger_registry` (
	`id` int AUTO_INCREMENT NOT NULL,
	`typeId` varchar(100) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`category` enum('time','event','data','user','system','integration') NOT NULL,
	`semanticVersion` varchar(20) NOT NULL,
	`icon` varchar(50),
	`classification` enum('external','time-based','manual') NOT NULL,
	`isDeterministic` boolean NOT NULL,
	`isIdempotent` boolean NOT NULL,
	`safeByDefault` boolean NOT NULL DEFAULT true,
	`intentDoc` text NOT NULL,
	`configSchema` json NOT NULL,
	`configSchemaVersion` int NOT NULL DEFAULT 1,
	`defaultConfig` json,
	`uiRenderer` text,
	`requiredFields` json,
	`unsafeOptions` json,
	`validationRules` json,
	`samplePayload` json,
	`inputContract` json,
	`outputContract` json NOT NULL,
	`outputTypes` json,
	`initialWorkflowSchema` json,
	`executionMode` enum('sync','async') NOT NULL,
	`blockingBehavior` enum('blocking','non-blocking') NOT NULL,
	`retryPolicy` json,
	`timeoutPolicy` json,
	`failureHandling` json,
	`stateTier` enum('ephemeral','durable') NOT NULL,
	`maxStateSize` int,
	`concurrentIsolation` text,
	`compensationStrategy` text,
	`workflowFailureHandler` json,
	`idempotencyKeyField` varchar(100),
	`requiredPermissions` json,
	`riskLevel` enum('low','medium','high','critical') NOT NULL,
	`preExecutionPolicies` json,
	`secretFields` json,
	`tenantScoped` boolean NOT NULL DEFAULT true,
	`tenantIsolation` text,
	`metricsConfig` json,
	`logFields` json,
	`errorClassification` json,
	`performanceProfile` enum('light','standard','heavy') NOT NULL,
	`latencySLA` json,
	`throughputExpectation` int,
	`degradationBehavior` text,
	`rateLimits` json,
	`costQuotas` json,
	`backpressureStrategy` text,
	`purposeDoc` text NOT NULL,
	`useCases` json,
	`failureModes` json,
	`securityConsiderations` text,
	`examples` json,
	`testCoverage` json,
	`dryRunSupported` boolean NOT NULL DEFAULT false,
	`simulationConfig` json,
	`deprecationNotice` text,
	`migrationPath` text,
	`replacementTypeId` varchar(100),
	`subWorkflowSupport` boolean NOT NULL DEFAULT false,
	`maxNestingDepth` int DEFAULT 5,
	`variableScopingRules` text,
	`failureBubblingRules` text,
	`handlerCode` text,
	`handlerType` enum('inline','external','webhook') NOT NULL,
	`handlerEndpoint` varchar(500),
	`requiresNetwork` boolean NOT NULL DEFAULT false,
	`requiresSecrets` boolean NOT NULL DEFAULT false,
	`hasSideEffects` boolean NOT NULL DEFAULT false,
	`hasCost` boolean NOT NULL DEFAULT false,
	`status` enum('draft','pending_approval','approved','rejected','deprecated') NOT NULL DEFAULT 'draft',
	`approvedBy` int,
	`approvedAt` timestamp,
	`rejectionReason` text,
	`criticalViolations` int NOT NULL DEFAULT 0,
	`majorIssues` int NOT NULL DEFAULT 0,
	`complianceScore` int,
	`lastValidated` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trigger_registry_id` PRIMARY KEY(`id`),
	CONSTRAINT `trigger_registry_typeId_unique` UNIQUE(`typeId`)
);
--> statement-breakpoint
CREATE TABLE `workflow_execution_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`executionId` int NOT NULL,
	`nodeId` varchar(255) NOT NULL,
	`nodeType` varchar(100) NOT NULL,
	`nodeLabel` varchar(255),
	`status` enum('pending','running','completed','failed','skipped') NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`duration` int,
	`input` json,
	`output` json,
	`error` text,
	`logLevel` enum('debug','info','warn','error') DEFAULT 'info',
	`message` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workflow_execution_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflow_executions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workflowId` int NOT NULL,
	`versionId` int,
	`status` enum('pending','running','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`duration` int,
	`triggerType` enum('time','event','webhook','manual'),
	`triggerData` json,
	`executedBy` int,
	`error` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workflow_executions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflow_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workflowId` int NOT NULL,
	`status` enum('running','success','error') NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`triggerData` json,
	`executionLog` json,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workflow_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflow_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`category` enum('productivity','data','communication','monitoring') NOT NULL,
	`workflowDefinition` json NOT NULL,
	`icon` varchar(50),
	`tags` json,
	`usageCount` int DEFAULT 0,
	`isPublic` boolean DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workflow_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflow_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workflowId` int NOT NULL,
	`version` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`nodes` text NOT NULL,
	`edges` text NOT NULL,
	`schemaVersion` int NOT NULL,
	`triggerType` enum('time','event','webhook','manual'),
	`triggerConfig` json,
	`publishedAt` timestamp NOT NULL DEFAULT (now()),
	`publishedBy` int NOT NULL,
	`changeNotes` text,
	`status` enum('published','archived') DEFAULT 'published',
	CONSTRAINT `workflow_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`workspaceId` int,
	`name` varchar(255) NOT NULL,
	`description` text,
	`nodes` text NOT NULL,
	`edges` text NOT NULL,
	`triggerType` enum('time','event','webhook','manual') DEFAULT 'manual',
	`triggerConfig` json,
	`schemaVersion` int NOT NULL DEFAULT 1,
	`publishedVersionId` int,
	`draftData` json,
	`status` enum('draft','validated','published','active','paused','archived') DEFAULT 'draft',
	`enabled` boolean DEFAULT true,
	`lastRunAt` timestamp,
	`lastRunStatus` enum('success','error','running'),
	`permissions` json,
	`isPublic` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workflows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','editor','viewer') NOT NULL DEFAULT 'viewer',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workspace_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workspace_providers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`providerId` int NOT NULL,
	`enabled` boolean DEFAULT true,
	`priority` int DEFAULT 50,
	`quotaTokensPerDay` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workspace_providers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`ownerId` int NOT NULL,
	`embeddingModel` varchar(255) DEFAULT 'bge-small-en-v1.5',
	`chunkingStrategy` enum('semantic','fixed','recursive') DEFAULT 'semantic',
	`chunkSize` int DEFAULT 512,
	`chunkOverlap` int DEFAULT 50,
	`vectorDb` enum('qdrant','milvus') DEFAULT 'qdrant',
	`collectionName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspaces_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_agent_spec` ON `agent_proofs` (`agentSpecId`);--> statement-breakpoint
CREATE INDEX `idx_policy_hash` ON `agent_proofs` (`policyHash`);--> statement-breakpoint
CREATE INDEX `idx_workspace` ON `agent_specs` (`workspaceId`);--> statement-breakpoint
CREATE INDEX `idx_mode` ON `agent_specs` (`mode`);--> statement-breakpoint
CREATE INDEX `idx_status` ON `agent_specs` (`governanceStatus`);--> statement-breakpoint
CREATE INDEX `idx_expiry` ON `agent_specs` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `idx_policy_set` ON `policy_versions` (`policySet`);--> statement-breakpoint
CREATE INDEX `idx_current` ON `policy_versions` (`isCurrent`);--> statement-breakpoint
CREATE INDEX `idx_userId` ON `secrets` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_category` ON `workflow_templates` (`category`);--> statement-breakpoint
CREATE INDEX `idx_createdBy` ON `workflow_templates` (`createdBy`);