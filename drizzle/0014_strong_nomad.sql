CREATE TABLE `wcp_executions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workflowId` int NOT NULL,
	`workflowName` varchar(255) NOT NULL,
	`status` enum('pending','running','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`duration` int,
	`executionLog` json,
	`errorMessage` text,
	`triggerType` enum('time','event','webhook','manual') DEFAULT 'manual',
	`triggerData` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wcp_executions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wcp_workflows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`nodes` text NOT NULL,
	`edges` text NOT NULL,
	`wcpBytecode` text,
	`status` enum('draft','active','paused','archived') NOT NULL DEFAULT 'draft',
	`lastRunAt` timestamp,
	`lastRunStatus` enum('completed','failed','running'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wcp_workflows_id` PRIMARY KEY(`id`)
);
