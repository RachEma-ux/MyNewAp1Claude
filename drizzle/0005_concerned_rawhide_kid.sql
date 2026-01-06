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
