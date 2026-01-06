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
