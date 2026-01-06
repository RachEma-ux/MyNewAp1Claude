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
