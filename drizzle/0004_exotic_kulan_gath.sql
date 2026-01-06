ALTER TABLE `model_downloads` ADD `priority` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `model_downloads` ADD `scheduledFor` timestamp;--> statement-breakpoint
ALTER TABLE `model_downloads` ADD `bandwidthLimit` int;