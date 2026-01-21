CREATE TABLE "llm_creation_audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"eventType" varchar(100) NOT NULL,
	"projectId" integer,
	"datasetId" integer,
	"trainingRunId" integer,
	"evaluationId" integer,
	"quantizationId" integer,
	"actor" integer,
	"actorType" varchar(50) DEFAULT 'user',
	"phase" varchar(50),
	"action" varchar(100),
	"payload" json NOT NULL,
	"status" varchar(50),
	"errorMessage" text,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_creation_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"path" varchar(10) NOT NULL,
	"target" json NOT NULL,
	"baseModel" json,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"currentPhase" varchar(50),
	"progress" integer DEFAULT 0,
	"finalModelPath" varchar(512),
	"ollamaModelName" varchar(255),
	"deploymentStatus" varchar(50),
	"llmId" integer,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "llm_datasets" (
	"id" serial PRIMARY KEY NOT NULL,
	"projectId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"source" varchar(50),
	"format" varchar(50) NOT NULL,
	"filePath" varchar(512),
	"fileSize" bigint,
	"recordCount" integer,
	"tokenCount" bigint,
	"stats" json,
	"qualityScore" numeric(5, 2),
	"qualityChecks" json,
	"status" varchar(50) DEFAULT 'pending',
	"processingLogs" text,
	"validated" boolean DEFAULT false,
	"validationErrors" json,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_evaluations" (
	"id" serial PRIMARY KEY NOT NULL,
	"projectId" integer NOT NULL,
	"trainingRunId" integer,
	"modelPath" varchar(512),
	"modelType" varchar(50),
	"evalDatasetId" integer,
	"benchmarks" json,
	"results" json NOT NULL,
	"overallScore" numeric(5, 2),
	"taskAccuracy" numeric(5, 2),
	"formatCorrectness" numeric(5, 2),
	"refusalCorrectness" numeric(5, 2),
	"latency" integer,
	"throughput" numeric(10, 2),
	"baselineEvalId" integer,
	"improvement" numeric(5, 2),
	"status" varchar(50) DEFAULT 'pending',
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "llm_quantizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"projectId" integer NOT NULL,
	"sourceTrainingRunId" integer,
	"sourceModelPath" varchar(512) NOT NULL,
	"quantizationType" varchar(50) NOT NULL,
	"method" varchar(50),
	"outputPath" varchar(512),
	"outputFormat" varchar(50),
	"fileSize" bigint,
	"accuracyDrop" numeric(5, 2),
	"compressionRatio" numeric(5, 2),
	"inferenceSpeedup" numeric(5, 2),
	"memoryReduction" numeric(5, 2),
	"status" varchar(50) DEFAULT 'pending',
	"logs" text,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "llm_training_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"projectId" integer NOT NULL,
	"trainingType" varchar(50) NOT NULL,
	"phase" varchar(50),
	"config" json NOT NULL,
	"configHash" varchar(64),
	"datasetIds" json,
	"framework" varchar(50),
	"accelerator" varchar(50),
	"status" varchar(50) DEFAULT 'pending',
	"progress" integer DEFAULT 0,
	"currentStep" integer,
	"totalSteps" integer,
	"metrics" json,
	"finalLoss" numeric(10, 6),
	"gpuHours" numeric(10, 2),
	"estimatedCost" numeric(10, 2),
	"actualCost" numeric(10, 2),
	"checkpointPath" varchar(512),
	"loraAdapterPath" varchar(512),
	"logs" text,
	"startedAt" timestamp,
	"completedAt" timestamp,
	"failedAt" timestamp,
	"errorMessage" text,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routing_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer,
	"requestId" varchar(64) NOT NULL,
	"primaryProviderId" integer NOT NULL,
	"actualProviderId" integer NOT NULL,
	"routeTaken" varchar(50) NOT NULL,
	"auditReasons" json,
	"policySnapshot" json,
	"latencyMs" integer,
	"tokensUsed" integer,
	"estimatedCost" varchar(20),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "promotionRequests" ADD COLUMN "approvers" json;--> statement-breakpoint
ALTER TABLE "promotionRequests" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "kind" varchar(20) DEFAULT 'cloud';--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "capabilities" json;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "policyTags" json;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "limits" json;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "routingProfile" json;--> statement-breakpoint
CREATE INDEX "idx_creation_audit_type" ON "llm_creation_audit_events" USING btree ("eventType");--> statement-breakpoint
CREATE INDEX "idx_creation_audit_project" ON "llm_creation_audit_events" USING btree ("projectId");--> statement-breakpoint
CREATE INDEX "idx_creation_audit_timestamp" ON "llm_creation_audit_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_creation_audit_actor" ON "llm_creation_audit_events" USING btree ("actor");--> statement-breakpoint
CREATE INDEX "idx_creation_project_name" ON "llm_creation_projects" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_creation_project_status" ON "llm_creation_projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_creation_project_creator" ON "llm_creation_projects" USING btree ("createdBy");--> statement-breakpoint
CREATE INDEX "idx_dataset_project" ON "llm_datasets" USING btree ("projectId");--> statement-breakpoint
CREATE INDEX "idx_dataset_type" ON "llm_datasets" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_dataset_status" ON "llm_datasets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_evaluation_project" ON "llm_evaluations" USING btree ("projectId");--> statement-breakpoint
CREATE INDEX "idx_evaluation_run" ON "llm_evaluations" USING btree ("trainingRunId");--> statement-breakpoint
CREATE INDEX "idx_evaluation_status" ON "llm_evaluations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_quantization_project" ON "llm_quantizations" USING btree ("projectId");--> statement-breakpoint
CREATE INDEX "idx_quantization_status" ON "llm_quantizations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_training_run_project" ON "llm_training_runs" USING btree ("projectId");--> statement-breakpoint
CREATE INDEX "idx_training_run_status" ON "llm_training_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_training_run_type" ON "llm_training_runs" USING btree ("trainingType");