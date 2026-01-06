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
	`errorMessage` text,
	`retryCount` int DEFAULT 0,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `model_downloads_id` PRIMARY KEY(`id`)
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
