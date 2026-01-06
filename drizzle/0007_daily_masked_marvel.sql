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
