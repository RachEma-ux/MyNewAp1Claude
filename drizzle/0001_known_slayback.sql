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
CREATE TABLE `workflows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`triggerType` enum('time','event','webhook') NOT NULL,
	`triggerConfig` json NOT NULL,
	`workflowDefinition` json NOT NULL,
	`enabled` boolean DEFAULT true,
	`lastRunAt` timestamp,
	`lastRunStatus` enum('success','error','running'),
	`createdBy` int NOT NULL,
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
