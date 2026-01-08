CREATE TABLE "action_registry" (
	"id" serial PRIMARY KEY NOT NULL,
	"typeId" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"category" varchar(50) NOT NULL,
	"semanticVersion" varchar(20) NOT NULL,
	"icon" varchar(50),
	"classification" varchar(50) NOT NULL,
	"isDeterministic" boolean NOT NULL,
	"isIdempotent" boolean NOT NULL,
	"safeByDefault" boolean DEFAULT true NOT NULL,
	"intentDoc" text NOT NULL,
	"sideEffects" json NOT NULL,
	"configSchema" json NOT NULL,
	"configSchemaVersion" integer DEFAULT 1 NOT NULL,
	"defaultConfig" json,
	"uiRenderer" text,
	"requiredFields" json,
	"unsafeOptions" json,
	"validationRules" json,
	"retryBehaviorVisible" boolean DEFAULT true NOT NULL,
	"timeoutBehaviorVisible" boolean DEFAULT true NOT NULL,
	"failureBehaviorVisible" boolean DEFAULT true NOT NULL,
	"inputContract" json NOT NULL,
	"outputContract" json NOT NULL,
	"outputTypes" json,
	"noGlobalMutation" boolean DEFAULT true NOT NULL,
	"executionMode" varchar(50) NOT NULL,
	"blockingBehavior" varchar(50) NOT NULL,
	"retryPolicy" json,
	"timeoutPolicy" json,
	"failureHandling" json,
	"stateTier" varchar(50) NOT NULL,
	"maxStateSize" integer,
	"concurrentIsolation" text,
	"compensationStrategy" text NOT NULL,
	"compensationAutomation" json,
	"workflowFailureHandler" json,
	"idempotencyKeyField" varchar(100),
	"partialRollbackPaths" json,
	"requiredPermissions" json,
	"riskLevel" varchar(50) NOT NULL,
	"preExecutionPolicies" json,
	"secretFields" json,
	"promptVariableSanitization" json,
	"tokenCap" integer,
	"costCap" integer,
	"outputSchema" json,
	"confidenceScoreExposed" boolean DEFAULT false,
	"highRiskDefinition" json,
	"humanInLoopRequired" boolean DEFAULT false,
	"tenantScoped" boolean DEFAULT true NOT NULL,
	"tenantIsolation" text,
	"metricsConfig" json,
	"logFields" json,
	"errorClassification" json,
	"performanceProfile" varchar(50) NOT NULL,
	"latencySLA" json,
	"throughputExpectation" integer,
	"degradationBehavior" text,
	"rateLimits" json,
	"costQuotas" json,
	"backpressureStrategy" text,
	"purposeDoc" text NOT NULL,
	"useCases" json,
	"failureModes" json,
	"securityConsiderations" text,
	"examples" json,
	"testCoverage" json,
	"dryRunSupported" boolean DEFAULT false NOT NULL,
	"simulationConfig" json,
	"deprecationNotice" text,
	"migrationPath" text,
	"replacementTypeId" varchar(100),
	"subWorkflowSupport" boolean DEFAULT false NOT NULL,
	"maxNestingDepth" integer DEFAULT 5,
	"variableScopingRules" text,
	"failureBubblingRules" text,
	"handlerCode" text,
	"handlerType" varchar(50) NOT NULL,
	"handlerEndpoint" varchar(500),
	"requiresNetwork" boolean DEFAULT false NOT NULL,
	"requiresSecrets" boolean DEFAULT false NOT NULL,
	"hasSideEffects" boolean DEFAULT false NOT NULL,
	"hasCost" boolean DEFAULT false NOT NULL,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"approvedBy" integer,
	"approvedAt" timestamp,
	"rejectionReason" text,
	"criticalViolations" integer DEFAULT 0 NOT NULL,
	"majorIssues" integer DEFAULT 0 NOT NULL,
	"complianceScore" integer,
	"lastValidated" timestamp,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "action_registry_typeId_unique" UNIQUE("typeId")
);
--> statement-breakpoint
CREATE TABLE "agent_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"agentId" integer NOT NULL,
	"eventType" varchar(50) NOT NULL,
	"eventData" json,
	"oldStatus" varchar(50),
	"newStatus" varchar(50),
	"actorId" integer,
	"actorName" varchar(255),
	"description" text,
	"metadata" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_proofs" (
	"id" serial PRIMARY KEY NOT NULL,
	"agentId" integer NOT NULL,
	"policyDecision" varchar(50) NOT NULL,
	"policyHash" varchar(255) NOT NULL,
	"specHash" varchar(255) NOT NULL,
	"authority" varchar(255) NOT NULL,
	"signedAt" timestamp NOT NULL,
	"signature" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agentVersions" (
	"id" serial PRIMARY KEY NOT NULL,
	"agentId" integer NOT NULL,
	"version" integer NOT NULL,
	"createdBy" integer NOT NULL,
	"changeNotes" text,
	"agentSnapshot" json NOT NULL,
	"policyDigest" varchar(64),
	"policySetHash" varchar(64),
	"promotionRequestId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"createdBy" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"tags" json,
	"roleClass" varchar(50) NOT NULL,
	"lifecycle" json,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"systemPrompt" text NOT NULL,
	"modelId" varchar(255) NOT NULL,
	"temperature" numeric(3, 2) DEFAULT '0.7',
	"capabilities" json,
	"limits" json,
	"hasDocumentAccess" boolean DEFAULT false,
	"hasToolAccess" boolean DEFAULT false,
	"allowedTools" json,
	"policyDigest" varchar(64),
	"policySetHash" varchar(64),
	"lockedFields" json,
	"lastRunAt" timestamp,
	"lastRunStatus" varchar(50),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attestation_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"keyName" varchar(255) NOT NULL,
	"keyType" varchar(50) DEFAULT 'ed25519' NOT NULL,
	"keySize" integer,
	"publicKey" text NOT NULL,
	"privateKey" text,
	"keyId" varchar(255) NOT NULL,
	"thumbprint" varchar(255) NOT NULL,
	"generatedAt" timestamp NOT NULL,
	"expiresAt" timestamp,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"isActive" boolean DEFAULT false,
	"rotationId" integer,
	"previousKeyId" integer,
	"overlapStartsAt" timestamp,
	"overlapEndsAt" timestamp,
	"usageCount" integer DEFAULT 0,
	"lastUsedAt" timestamp,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "attestation_keys_keyId_unique" UNIQUE("keyId"),
	CONSTRAINT "attestation_keys_thumbprint_unique" UNIQUE("thumbprint")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"agentId" integer,
	"title" varchar(500),
	"userId" integer NOT NULL,
	"modelId" integer,
	"temperature" varchar(10),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"documentId" integer NOT NULL,
	"content" text NOT NULL,
	"chunkIndex" integer NOT NULL,
	"pageNumber" integer,
	"heading" varchar(500),
	"vectorId" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"filename" varchar(255) NOT NULL,
	"fileType" varchar(50) NOT NULL,
	"fileSize" integer NOT NULL,
	"fileUrl" text NOT NULL,
	"fileKey" varchar(500) NOT NULL,
	"status" varchar(50) DEFAULT 'pending',
	"errorMessage" text,
	"title" varchar(500),
	"author" varchar(255),
	"pageCount" integer,
	"wordCount" integer,
	"chunkCount" integer DEFAULT 0,
	"embeddingModel" varchar(255),
	"uploadedBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "download_analytics" (
	"id" serial PRIMARY KEY NOT NULL,
	"downloadId" integer NOT NULL,
	"modelId" integer NOT NULL,
	"userId" integer NOT NULL,
	"instantSpeed" varchar(50),
	"averageSpeed" varchar(50),
	"bytesDownloaded" varchar(50),
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"elapsedSeconds" integer DEFAULT 0,
	"connectionType" varchar(50),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hardware_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"cpuModel" varchar(255),
	"cpuCores" integer,
	"cpuThreads" integer,
	"gpuModel" varchar(255),
	"gpuVram" integer,
	"gpuDriver" varchar(100),
	"gpuComputeCapability" varchar(50),
	"totalRamMb" integer,
	"availableRamMb" integer,
	"supportsCuda" boolean DEFAULT false,
	"supportsRocm" boolean DEFAULT false,
	"supportsMetal" boolean DEFAULT false,
	"performanceScore" integer,
	"detectedAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"severity" varchar(50) DEFAULT 'medium' NOT NULL,
	"frozenEnvironments" json,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"createdBy" integer NOT NULL,
	"resolvedBy" integer,
	"resolvedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "key_rotation_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"rotationId" integer NOT NULL,
	"action" varchar(100) NOT NULL,
	"actionType" varchar(50) NOT NULL,
	"performedBy" integer,
	"performedBySystem" boolean DEFAULT false,
	"details" json,
	"status" varchar(50) NOT NULL,
	"message" text,
	"verificationStatus" varchar(50),
	"verificationDetails" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "key_rotation_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"policyName" varchar(255) NOT NULL,
	"description" text,
	"targetType" varchar(50) NOT NULL,
	"targetName" varchar(255),
	"rotationIntervalDays" integer NOT NULL,
	"rotationIntervalHours" integer,
	"daysBeforeExpiry" integer,
	"overlapWindowDays" integer DEFAULT 7,
	"autoRotate" boolean DEFAULT true,
	"requireApproval" boolean DEFAULT false,
	"notifyBefore" integer,
	"isActive" boolean DEFAULT true,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "key_rotation_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"policyId" integer NOT NULL,
	"rotationId" integer,
	"scheduledAt" timestamp NOT NULL,
	"reason" varchar(255),
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "key_rotations" (
	"id" serial PRIMARY KEY NOT NULL,
	"rotationType" varchar(50) NOT NULL,
	"targetName" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"scheduledAt" timestamp,
	"startedAt" timestamp,
	"completedAt" timestamp,
	"oldKeyId" integer,
	"newKeyId" integer,
	"overlapStartsAt" timestamp,
	"overlapEndsAt" timestamp,
	"initiatedBy" integer,
	"reason" varchar(500),
	"error" text,
	"rollbackReason" text,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_packs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(100),
	"version" varchar(50) NOT NULL,
	"documentCount" integer DEFAULT 0,
	"totalSize" integer DEFAULT 0,
	"packData" json NOT NULL,
	"createdBy" integer NOT NULL,
	"isPublic" boolean DEFAULT false,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_attestations" (
	"id" serial PRIMARY KEY NOT NULL,
	"llmVersionId" integer NOT NULL,
	"status" varchar(50) NOT NULL,
	"evidence" json NOT NULL,
	"evidenceHash" varchar(64),
	"imageDigest" varchar(255),
	"configHash" varchar(64),
	"workloadIdentity" varchar(512),
	"submittedAt" timestamp NOT NULL,
	"verifiedAt" timestamp,
	"expiresAt" timestamp,
	"revokedAt" timestamp,
	"revokedBy" integer,
	"revocationReason" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"eventType" varchar(100) NOT NULL,
	"llmId" integer,
	"llmVersionId" integer,
	"promotionId" integer,
	"actor" integer,
	"actorType" varchar(50) DEFAULT 'user',
	"payload" json NOT NULL,
	"configHash" varchar(64),
	"policyHash" varchar(64),
	"eventSignature" text,
	"environment" varchar(50),
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_drift_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"llmVersionId" integer NOT NULL,
	"severity" varchar(50) NOT NULL,
	"signal" varchar(255) NOT NULL,
	"expected" json NOT NULL,
	"observed" json NOT NULL,
	"responseAction" varchar(50),
	"responseTaken" boolean DEFAULT false,
	"detectedAt" timestamp NOT NULL,
	"resolvedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_promotions" (
	"id" serial PRIMARY KEY NOT NULL,
	"llmVersionId" integer NOT NULL,
	"fromEnvironment" varchar(50) NOT NULL,
	"toEnvironment" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"simulationResults" json,
	"simulatedAt" timestamp,
	"requestedBy" integer NOT NULL,
	"requestedAt" timestamp DEFAULT now() NOT NULL,
	"approvedBy" integer,
	"approvedAt" timestamp,
	"approvalComment" text,
	"rejectedBy" integer,
	"rejectedAt" timestamp,
	"rejectionReason" text,
	"executedAt" timestamp,
	"executionError" text,
	"newVersionId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"llmId" integer NOT NULL,
	"version" integer NOT NULL,
	"environment" varchar(50) DEFAULT 'sandbox' NOT NULL,
	"config" json NOT NULL,
	"configHash" varchar(64) NOT NULL,
	"policyBundleRef" varchar(512),
	"policyHash" varchar(64),
	"policyDecision" varchar(50) DEFAULT 'pass',
	"policyViolations" json,
	"attestationContract" json,
	"attestationStatus" varchar(50) DEFAULT 'pending',
	"driftStatus" varchar(50) DEFAULT 'none',
	"callable" boolean DEFAULT false,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"changeNotes" text,
	"promotionRequestId" integer
);
--> statement-breakpoint
CREATE TABLE "llms" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"role" varchar(50) NOT NULL,
	"ownerTeam" varchar(255),
	"archived" boolean DEFAULT false,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversationId" integer NOT NULL,
	"role" varchar(50) NOT NULL,
	"content" text NOT NULL,
	"tokenCount" integer,
	"retrievedChunks" json,
	"toolCalls" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_benchmarks" (
	"id" serial PRIMARY KEY NOT NULL,
	"modelId" integer NOT NULL,
	"benchmarkType" varchar(50) NOT NULL,
	"benchmarkName" varchar(255) NOT NULL,
	"score" varchar(50),
	"tokensPerSecond" integer,
	"memoryUsageMb" integer,
	"costPer1kTokens" varchar(20),
	"metadata" json,
	"runBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"modelId" integer NOT NULL,
	"userId" integer NOT NULL,
	"temperature" varchar(10) DEFAULT '0.7',
	"topP" varchar(10) DEFAULT '0.9',
	"topK" integer DEFAULT 40,
	"maxTokens" integer DEFAULT 2048,
	"repeatPenalty" varchar(10) DEFAULT '1.1',
	"stopSequences" json,
	"systemPrompt" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_conversions" (
	"id" serial PRIMARY KEY NOT NULL,
	"modelId" integer NOT NULL,
	"userId" integer NOT NULL,
	"sourceFormat" varchar(50) NOT NULL,
	"targetFormat" varchar(50) NOT NULL,
	"quantization" varchar(50),
	"sourcePath" text NOT NULL,
	"outputPath" text,
	"status" varchar(50) DEFAULT 'queued',
	"progress" integer DEFAULT 0,
	"outputSize" varchar(50),
	"errorMessage" text,
	"startedAt" timestamp,
	"completedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_downloads" (
	"id" serial PRIMARY KEY NOT NULL,
	"modelId" integer NOT NULL,
	"userId" integer NOT NULL,
	"sourceUrl" text NOT NULL,
	"destinationPath" text,
	"fileSize" varchar(50),
	"status" varchar(50) DEFAULT 'queued',
	"progress" integer DEFAULT 0,
	"bytesDownloaded" varchar(50) DEFAULT '0',
	"downloadSpeed" varchar(50),
	"priority" integer DEFAULT 0,
	"scheduledFor" timestamp,
	"bandwidthLimit" integer,
	"errorMessage" text,
	"retryCount" integer DEFAULT 0,
	"startedAt" timestamp,
	"completedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_share_references" (
	"id" serial PRIMARY KEY NOT NULL,
	"shareId" integer NOT NULL,
	"userId" integer,
	"workspaceId" integer,
	"lastUsedAt" timestamp DEFAULT now(),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_shares" (
	"id" serial PRIMARY KEY NOT NULL,
	"modelId" integer NOT NULL,
	"storagePath" text NOT NULL,
	"fileSize" varchar(50),
	"checksum" varchar(128),
	"referenceCount" integer DEFAULT 1 NOT NULL,
	"shareScope" varchar(50) DEFAULT 'user',
	"ownerId" integer NOT NULL,
	"lastAccessedAt" timestamp DEFAULT now(),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"modelId" integer NOT NULL,
	"version" varchar(50) NOT NULL,
	"releaseDate" timestamp,
	"sourceUrl" text,
	"fileSize" varchar(50),
	"checksum" varchar(128),
	"changelog" text,
	"isLatest" boolean DEFAULT false,
	"isDeprecated" boolean DEFAULT false,
	"downloadCount" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"displayName" varchar(255) NOT NULL,
	"modelType" varchar(50) NOT NULL,
	"huggingFaceId" varchar(255),
	"architecture" varchar(100),
	"parameterCount" varchar(50),
	"quantization" varchar(50),
	"contextLength" integer,
	"fileSize" varchar(50),
	"filePath" text,
	"fileFormat" varchar(50) DEFAULT 'gguf',
	"status" varchar(50) DEFAULT 'ready',
	"downloadProgress" integer DEFAULT 0,
	"tokensPerSecond" integer,
	"memoryUsageMb" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plugins" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"displayName" varchar(255) NOT NULL,
	"description" text,
	"version" varchar(50) NOT NULL,
	"author" varchar(255),
	"runtime" varchar(50) NOT NULL,
	"entryPoint" varchar(500) NOT NULL,
	"permissions" json NOT NULL,
	"enabled" boolean DEFAULT true,
	"verified" boolean DEFAULT false,
	"installedBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plugins_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"createdBy" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"version" varchar(50) DEFAULT '1.0',
	"content" json NOT NULL,
	"hash" varchar(64) NOT NULL,
	"isActive" boolean DEFAULT false,
	"isTemplate" boolean DEFAULT false,
	"rules" json,
	"appliedToAgents" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policyExceptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"agentId" integer NOT NULL,
	"policyId" varchar(255) NOT NULL,
	"scope" varchar(50) NOT NULL,
	"reason" text NOT NULL,
	"requestedBy" integer NOT NULL,
	"approvedBy" integer,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"approvedAt" timestamp,
	"revokedAt" timestamp,
	"revokedBy" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policyReloads" (
	"id" serial PRIMARY KEY NOT NULL,
	"initiatedBy" integer NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"ociRef" varchar(512) NOT NULL,
	"digest" varchar(64) NOT NULL,
	"cosignVerified" boolean DEFAULT false,
	"impactSnapshot" json,
	"previousDigest" varchar(64),
	"rolledBackAt" timestamp,
	"rolledBackBy" integer,
	"rollbackReason" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"activatedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "policyTemplates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(50) DEFAULT 'custom',
	"content" json NOT NULL,
	"rules" json,
	"version" varchar(50) DEFAULT '1.0',
	"isDefault" boolean DEFAULT false,
	"usageCount" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "policyTemplates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "policy_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"policySet" varchar(255) NOT NULL,
	"version" varchar(50) NOT NULL,
	"bundle" json NOT NULL,
	"policyHash" varchar(255) NOT NULL,
	"revokedSigners" json DEFAULT '[]'::json,
	"invalidatedAgents" json DEFAULT '{}'::json,
	"loadedAt" timestamp NOT NULL,
	"loadedBy" integer NOT NULL,
	"isCurrent" boolean DEFAULT false,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotionEvents" (
	"id" serial PRIMARY KEY NOT NULL,
	"promotionRequestId" integer NOT NULL,
	"eventType" varchar(10) NOT NULL,
	"actor" integer,
	"details" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotionRequests" (
	"id" serial PRIMARY KEY NOT NULL,
	"agentId" integer NOT NULL,
	"requestedBy" integer NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"diffHash" varchar(64),
	"diffSnapshot" json,
	"baselineVersion" integer,
	"proposedVersion" integer,
	"validationSnapshot" json,
	"policyDigest" varchar(64),
	"approvedBy" integer,
	"approvedAt" timestamp,
	"approvalComment" text,
	"rejectedBy" integer,
	"rejectedAt" timestamp,
	"rejectionReason" text,
	"executedAt" timestamp,
	"executionError" text,
	"slaDeadline" timestamp,
	"escalatedAt" timestamp,
	"escalationCount" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protocols" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"content" text NOT NULL,
	"version" integer DEFAULT 1,
	"tags" json,
	"fileName" varchar(255),
	"fileSize" integer,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_health_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"providerId" integer NOT NULL,
	"status" varchar(50) NOT NULL,
	"responseTimeMs" integer,
	"errorMessage" text,
	"checkedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"providerId" integer NOT NULL,
	"avgLatencyMs" integer,
	"p95LatencyMs" integer,
	"p99LatencyMs" integer,
	"tokensPerSecond" integer,
	"successRate" varchar(10),
	"errorRate" varchar(10),
	"uptime" varchar(10),
	"totalRequests" integer DEFAULT 0,
	"totalTokens" integer DEFAULT 0,
	"totalCost" varchar(20),
	"periodStart" timestamp NOT NULL,
	"periodEnd" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"providerId" integer NOT NULL,
	"modelName" varchar(255),
	"tokensUsed" integer NOT NULL,
	"cost" varchar(20),
	"latencyMs" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"enabled" boolean DEFAULT true,
	"priority" integer DEFAULT 50,
	"config" json NOT NULL,
	"costPer1kTokens" varchar(20),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secrets" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"key" varchar(255) NOT NULL,
	"encryptedValue" text NOT NULL,
	"description" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_certificates" (
	"id" serial PRIMARY KEY NOT NULL,
	"serviceName" varchar(255) NOT NULL,
	"certificateType" varchar(50) NOT NULL,
	"certificate" text NOT NULL,
	"privateKey" text NOT NULL,
	"publicKey" text,
	"subject" varchar(500),
	"issuer" varchar(500),
	"serialNumber" varchar(255),
	"fingerprint" varchar(255) NOT NULL,
	"issuedAt" timestamp NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"isActive" boolean DEFAULT false,
	"rotationId" integer,
	"previousCertificateId" integer,
	"overlapStartsAt" timestamp,
	"overlapEndsAt" timestamp,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "service_certificates_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"settingKey" varchar(255) NOT NULL,
	"settingValue" text NOT NULL,
	"settingType" varchar(50) NOT NULL,
	"description" text,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "system_settings_settingKey_unique" UNIQUE("settingKey")
);
--> statement-breakpoint
CREATE TABLE "trigger_registry" (
	"id" serial PRIMARY KEY NOT NULL,
	"typeId" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"category" varchar(50) NOT NULL,
	"semanticVersion" varchar(20) NOT NULL,
	"icon" varchar(50),
	"classification" varchar(50) NOT NULL,
	"isDeterministic" boolean NOT NULL,
	"isIdempotent" boolean NOT NULL,
	"safeByDefault" boolean DEFAULT true NOT NULL,
	"intentDoc" text NOT NULL,
	"configSchema" json NOT NULL,
	"configSchemaVersion" integer DEFAULT 1 NOT NULL,
	"defaultConfig" json,
	"uiRenderer" text,
	"requiredFields" json,
	"unsafeOptions" json,
	"validationRules" json,
	"samplePayload" json,
	"inputContract" json,
	"outputContract" json NOT NULL,
	"outputTypes" json,
	"initialWorkflowSchema" json,
	"executionMode" varchar(50) NOT NULL,
	"blockingBehavior" varchar(50) NOT NULL,
	"retryPolicy" json,
	"timeoutPolicy" json,
	"failureHandling" json,
	"stateTier" varchar(50) NOT NULL,
	"maxStateSize" integer,
	"concurrentIsolation" text,
	"compensationStrategy" text,
	"workflowFailureHandler" json,
	"idempotencyKeyField" varchar(100),
	"requiredPermissions" json,
	"riskLevel" varchar(50) NOT NULL,
	"preExecutionPolicies" json,
	"secretFields" json,
	"tenantScoped" boolean DEFAULT true NOT NULL,
	"tenantIsolation" text,
	"metricsConfig" json,
	"logFields" json,
	"errorClassification" json,
	"performanceProfile" varchar(50) NOT NULL,
	"latencySLA" json,
	"throughputExpectation" integer,
	"degradationBehavior" text,
	"rateLimits" json,
	"costQuotas" json,
	"backpressureStrategy" text,
	"purposeDoc" text NOT NULL,
	"useCases" json,
	"failureModes" json,
	"securityConsiderations" text,
	"examples" json,
	"testCoverage" json,
	"dryRunSupported" boolean DEFAULT false NOT NULL,
	"simulationConfig" json,
	"deprecationNotice" text,
	"migrationPath" text,
	"replacementTypeId" varchar(100),
	"subWorkflowSupport" boolean DEFAULT false NOT NULL,
	"maxNestingDepth" integer DEFAULT 5,
	"variableScopingRules" text,
	"failureBubblingRules" text,
	"handlerCode" text,
	"handlerType" varchar(50) NOT NULL,
	"handlerEndpoint" varchar(500),
	"requiresNetwork" boolean DEFAULT false NOT NULL,
	"requiresSecrets" boolean DEFAULT false NOT NULL,
	"hasSideEffects" boolean DEFAULT false NOT NULL,
	"hasCost" boolean DEFAULT false NOT NULL,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"approvedBy" integer,
	"approvedAt" timestamp,
	"rejectionReason" text,
	"criticalViolations" integer DEFAULT 0 NOT NULL,
	"majorIssues" integer DEFAULT 0 NOT NULL,
	"complianceScore" integer,
	"lastValidated" timestamp,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trigger_registry_typeId_unique" UNIQUE("typeId")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" varchar(50) DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE TABLE "wcp_executions" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflowId" integer NOT NULL,
	"workflowName" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"startedAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp,
	"duration" integer,
	"executionLog" json,
	"errorMessage" text,
	"triggerType" varchar(50) DEFAULT 'manual',
	"triggerData" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wcp_workflows" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"nodes" text NOT NULL,
	"edges" text NOT NULL,
	"wcpBytecode" text,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"lastRunAt" timestamp,
	"lastRunStatus" varchar(50),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_execution_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"executionId" integer NOT NULL,
	"nodeId" varchar(255) NOT NULL,
	"nodeType" varchar(100) NOT NULL,
	"nodeLabel" varchar(255),
	"status" varchar(50) NOT NULL,
	"startedAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp,
	"duration" integer,
	"input" json,
	"output" json,
	"error" text,
	"logLevel" varchar(50) DEFAULT 'info',
	"message" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_executions" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflowId" integer NOT NULL,
	"versionId" integer,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"startedAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp,
	"duration" integer,
	"triggerType" varchar(50),
	"triggerData" json,
	"executedBy" integer,
	"error" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflowId" integer NOT NULL,
	"status" varchar(50) NOT NULL,
	"startedAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp,
	"triggerData" json,
	"executionLog" json,
	"errorMessage" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(50) NOT NULL,
	"workflowDefinition" json NOT NULL,
	"icon" varchar(50),
	"tags" json,
	"usageCount" integer DEFAULT 0,
	"isPublic" boolean DEFAULT true,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflowId" integer NOT NULL,
	"version" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"nodes" text NOT NULL,
	"edges" text NOT NULL,
	"schemaVersion" integer NOT NULL,
	"triggerType" varchar(50),
	"triggerConfig" json,
	"publishedAt" timestamp DEFAULT now() NOT NULL,
	"publishedBy" integer NOT NULL,
	"changeNotes" text,
	"status" varchar(50) DEFAULT 'published'
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"workspaceId" integer,
	"name" varchar(255) NOT NULL,
	"description" text,
	"nodes" text NOT NULL,
	"edges" text NOT NULL,
	"triggerType" varchar(50) DEFAULT 'manual',
	"triggerConfig" json,
	"schemaVersion" integer DEFAULT 1 NOT NULL,
	"publishedVersionId" integer,
	"draftData" json,
	"status" varchar(50) DEFAULT 'draft',
	"enabled" boolean DEFAULT true,
	"lastRunAt" timestamp,
	"lastRunStatus" varchar(50),
	"permissions" json,
	"isPublic" boolean DEFAULT false,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"userId" integer NOT NULL,
	"role" varchar(50) DEFAULT 'viewer' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"providerId" integer NOT NULL,
	"enabled" boolean DEFAULT true,
	"priority" integer DEFAULT 50,
	"quotaTokensPerDay" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"ownerId" integer NOT NULL,
	"embeddingModel" varchar(255) DEFAULT 'bge-small-en-v1.5',
	"chunkingStrategy" varchar(50) DEFAULT 'semantic',
	"chunkSize" integer DEFAULT 512,
	"chunkOverlap" integer DEFAULT 50,
	"vectorDb" varchar(50) DEFAULT 'qdrant',
	"collectionName" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_agent" ON "agent_proofs" USING btree ("agentId");--> statement-breakpoint
CREATE INDEX "idx_policy_hash" ON "agent_proofs" USING btree ("policyHash");--> statement-breakpoint
CREATE INDEX "idx_attestation_version" ON "llm_attestations" USING btree ("llmVersionId");--> statement-breakpoint
CREATE INDEX "idx_attestation_status" ON "llm_attestations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_audit_event_type" ON "llm_audit_events" USING btree ("eventType");--> statement-breakpoint
CREATE INDEX "idx_audit_llm_id" ON "llm_audit_events" USING btree ("llmId");--> statement-breakpoint
CREATE INDEX "idx_audit_timestamp" ON "llm_audit_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_drift_version" ON "llm_drift_events" USING btree ("llmVersionId");--> statement-breakpoint
CREATE INDEX "idx_drift_severity" ON "llm_drift_events" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "idx_promotion_version" ON "llm_promotions" USING btree ("llmVersionId");--> statement-breakpoint
CREATE INDEX "idx_promotion_status" ON "llm_promotions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_llm_version_llm_id" ON "llm_versions" USING btree ("llmId");--> statement-breakpoint
CREATE INDEX "idx_llm_version_env" ON "llm_versions" USING btree ("environment");--> statement-breakpoint
CREATE INDEX "idx_llm_version_callable" ON "llm_versions" USING btree ("callable");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_llm_version" ON "llm_versions" USING btree ("llmId","version");--> statement-breakpoint
CREATE INDEX "idx_llm_name" ON "llms" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_llm_role" ON "llms" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_policy_set" ON "policy_versions" USING btree ("policySet");--> statement-breakpoint
CREATE INDEX "idx_current" ON "policy_versions" USING btree ("isCurrent");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_policy_version" ON "policy_versions" USING btree ("policySet","version");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_user_key" ON "secrets" USING btree ("userId","key");--> statement-breakpoint
CREATE INDEX "idx_userId" ON "secrets" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "idx_category" ON "workflow_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_createdBy" ON "workflow_templates" USING btree ("createdBy");