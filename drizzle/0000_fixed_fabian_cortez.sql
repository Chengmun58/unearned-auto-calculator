CREATE TABLE `calculation_rows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`customerRef` varchar(255) NOT NULL,
	`item` varchar(255) NOT NULL,
	`aoikumoOwing` double NOT NULL DEFAULT 0,
	`aoikumoUnearned` double NOT NULL DEFAULT 0,
	`sequoiaBalance` double NOT NULL DEFAULT 0,
	`sequoiaUnearned` double NOT NULL DEFAULT 0,
	`status` varchar(10) NOT NULL,
	`statusReason` text,
	`excludeFlag` enum('Y','N') NOT NULL DEFAULT 'N',
	`settleFlag` enum('Y','N') NOT NULL DEFAULT 'N',
	`settlePct` double NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `calculation_rows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `upload_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionName` varchar(255) NOT NULL,
	`aoikumoFileName` varchar(255),
	`sequoiaFileName` varchar(255),
	`totalRecords` int NOT NULL DEFAULT 0,
	`totalExposure` double NOT NULL DEFAULT 0,
	`excludedAmount` double NOT NULL DEFAULT 0,
	`afterExclusion` double NOT NULL DEFAULT 0,
	`settledAmount` double NOT NULL DEFAULT 0,
	`finalRemaining` double NOT NULL DEFAULT 0,
	`statusBreakdown` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `upload_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
