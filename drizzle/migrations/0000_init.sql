CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `account_deletion_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`status` text DEFAULT 'REQUESTED' NOT NULL,
	`requested_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`processed_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "account_deletion_requests_status_check" CHECK("account_deletion_requests"."status" in ('REQUESTED', 'PROCESSING', 'COMPLETED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_deletion_requests_one_open` ON `account_deletion_requests` (`user_id`) WHERE status in ('REQUESTED', 'PROCESSING');--> statement-breakpoint
CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`company_name` text NOT NULL,
	`company_name_normalized` text DEFAULT '' NOT NULL,
	`selection_type` text NOT NULL,
	`is_early_selection` integer DEFAULT false NOT NULL,
	`job_title` text,
	`applied_at` text,
	`company_url` text,
	`priority` integer,
	`application_source` text,
	`status` text DEFAULT 'PLANNED' NOT NULL,
	`current_step_id` text,
	`memo` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`student_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`id`,`current_step_id`) REFERENCES `selection_steps`(`application_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "applications_company_name_length" CHECK(length(trim("applications"."company_name")) between 1 and 200),
	CONSTRAINT "applications_selection_type_check" CHECK("applications"."selection_type" in ('INTERNSHIP', 'FULL_TIME')),
	CONSTRAINT "applications_status_check" CHECK("applications"."status" in ('PLANNED', 'IN_PROGRESS', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'CANCELLED')),
	CONSTRAINT "applications_job_title_length" CHECK("applications"."job_title" is null or length("applications"."job_title") <= 200),
	CONSTRAINT "applications_company_url_format" CHECK("applications"."company_url" is null or (length("applications"."company_url") <= 2048 and (lower(substr("applications"."company_url", 1, 7)) = 'http://' or lower(substr("applications"."company_url", 1, 8)) = 'https://'))),
	CONSTRAINT "applications_priority_range" CHECK("applications"."priority" is null or "applications"."priority" between 1 and 5),
	CONSTRAINT "applications_source_length" CHECK("applications"."application_source" is null or length("applications"."application_source") <= 100),
	CONSTRAINT "applications_memo_length" CHECK("applications"."memo" is null or length("applications"."memo") <= 10000),
	CONSTRAINT "applications_early_requires_full_time" CHECK(not "applications"."is_early_selection" or "applications"."selection_type" = 'FULL_TIME')
);
--> statement-breakpoint
CREATE INDEX `applications_student_idx` ON `applications` (`student_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `applications_company_normalized_idx` ON `applications` (`company_name_normalized`);--> statement-breakpoint
CREATE UNIQUE INDEX `applications_student_id_id_key` ON `applications` (`student_id`,`id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_id` text,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`application_id` text,
	`student_id` text,
	`action` text NOT NULL,
	`old_values` text,
	`new_values` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "audit_logs_action_check" CHECK("audit_logs"."action" in ('INSERT', 'UPDATE', 'DELETE'))
);
--> statement-breakpoint
CREATE INDEX `audit_logs_application_idx` ON `audit_logs` (`application_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_student_idx` ON `audit_logs` (`student_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`application_id` text,
	`title` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text,
	`description` text,
	`created_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`student_id`,`application_id`) REFERENCES `applications`(`student_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "events_title_length" CHECK(length(trim("events"."title")) between 1 and 200),
	CONSTRAINT "events_description_length" CHECK("events"."description" is null or length("events"."description") <= 5000),
	CONSTRAINT "events_time_order" CHECK("events"."ends_at" is null or "events"."ends_at" >= "events"."starts_at")
);
--> statement-breakpoint
CREATE INDEX `events_student_starts_idx` ON `events` (`student_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text,
	`invitee_role` text DEFAULT 'STUDENT' NOT NULL,
	`token_hash` text NOT NULL,
	`created_by` text,
	`expires_at` text NOT NULL,
	`used_at` text,
	`used_by` text,
	`revoked_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`used_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "invitations_role_check" CHECK("invitations"."invitee_role" in ('STUDENT', 'ADMIN')),
	CONSTRAINT "invitations_email_format" CHECK("invitations"."email" is null or ("invitations"."email" = lower("invitations"."email") and instr("invitations"."email", '@') > 1 and length("invitations"."email") <= 320)),
	CONSTRAINT "invitations_admin_requires_email" CHECK("invitations"."invitee_role" = 'STUDENT' or "invitations"."email" is not null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_hash_unique` ON `invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invitations_org_idx` ON `invitations` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `join_code_failures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`attempted_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `join_code_failures_user_idx` ON `join_code_failures` (`user_id`,`attempted_at`);--> statement-breakpoint
CREATE TABLE `join_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`consent_version` text NOT NULL,
	`consented_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`reviewed_at` text,
	`reviewed_by` text,
	FOREIGN KEY (`student_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "join_requests_status_check" CHECK("join_requests"."status" in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
	CONSTRAINT "join_requests_consent_version_length" CHECK(length("join_requests"."consent_version") between 1 and 50)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `join_requests_one_pending` ON `join_requests` (`student_id`) WHERE status = 'PENDING';--> statement-breakpoint
CREATE INDEX `join_requests_org_idx` ON `join_requests` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `organization_members` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "organization_members_role_check" CHECK("organization_members"."role" in ('OWNER', 'ADMIN'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_members_one_org_per_admin` ON `organization_members` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_members_one_owner` ON `organization_members` (`organization_id`) WHERE role = 'OWNER';--> statement-breakpoint
CREATE INDEX `organization_members_org_idx` ON `organization_members` (`organization_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_by` text,
	`join_code_hash` text,
	`join_code_issued_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "organizations_name_length" CHECK(length(trim("organizations"."name")) between 1 and 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_join_code_hash_unique` ON `organizations` (`join_code_hash`);--> statement-breakpoint
CREATE TABLE `rate_limit` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limit_key_unique` ON `rate_limit` (`key`);--> statement-breakpoint
CREATE TABLE `selection_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`step_type` text NOT NULL,
	`display_name` text NOT NULL,
	`position` integer NOT NULL,
	`status` text DEFAULT 'NOT_STARTED' NOT NULL,
	`result` text,
	`scheduled_at` text,
	`deadline_at` text,
	`location` text,
	`meeting_url` text,
	`notes` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "selection_steps_step_type_check" CHECK("selection_steps"."step_type" in ('ENTRY', 'DOCUMENT', 'APTITUDE_TEST', 'GROUP_DISCUSSION', 'GROUP_INTERVIEW', 'FIRST_INTERVIEW', 'SECOND_INTERVIEW', 'THIRD_INTERVIEW', 'FINAL_INTERVIEW', 'MEETING', 'ASSIGNMENT', 'OTHER')),
	CONSTRAINT "selection_steps_status_check" CHECK("selection_steps"."status" in ('NOT_STARTED', 'SCHEDULED', 'COMPLETED', 'SKIPPED')),
	CONSTRAINT "selection_steps_result_check" CHECK("selection_steps"."result" is null or "selection_steps"."result" in ('PENDING', 'PASSED', 'FAILED')),
	CONSTRAINT "selection_steps_display_name_length" CHECK(length(trim("selection_steps"."display_name")) between 1 and 100),
	CONSTRAINT "selection_steps_position_nonnegative" CHECK("selection_steps"."position" >= 0),
	CONSTRAINT "selection_steps_location_length" CHECK("selection_steps"."location" is null or length("selection_steps"."location") <= 200),
	CONSTRAINT "selection_steps_meeting_url_format" CHECK("selection_steps"."meeting_url" is null or (length("selection_steps"."meeting_url") <= 2048 and (lower(substr("selection_steps"."meeting_url", 1, 7)) = 'http://' or lower(substr("selection_steps"."meeting_url", 1, 8)) = 'https://'))),
	CONSTRAINT "selection_steps_notes_length" CHECK("selection_steps"."notes" is null or length("selection_steps"."notes") <= 5000)
);
--> statement-breakpoint
CREATE INDEX `selection_steps_application_idx` ON `selection_steps` (`application_id`,`position`);--> statement-breakpoint
CREATE INDEX `selection_steps_scheduled_idx` ON `selection_steps` (`scheduled_at`) WHERE scheduled_at is not null;--> statement-breakpoint
CREATE INDEX `selection_steps_deadline_idx` ON `selection_steps` (`deadline_at`) WHERE deadline_at is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `selection_steps_application_id_id_key` ON `selection_steps` (`application_id`,`id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `student_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`consent_version` text NOT NULL,
	`consented_at` text NOT NULL,
	`joined_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`ended_at` text,
	`ended_by` text,
	FOREIGN KEY (`student_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ended_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "student_memberships_status_check" CHECK("student_memberships"."status" in ('ACTIVE', 'ENDED')),
	CONSTRAINT "student_memberships_consent_version_length" CHECK(length("student_memberships"."consent_version") between 1 and 50),
	CONSTRAINT "student_memberships_ended_consistency" CHECK(("student_memberships"."status" = 'ACTIVE') = ("student_memberships"."ended_at" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_memberships_one_active` ON `student_memberships` (`student_id`) WHERE status = 'ACTIVE';--> statement-breakpoint
CREATE INDEX `student_memberships_org_active_idx` ON `student_memberships` (`organization_id`) WHERE status = 'ACTIVE';--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text NOT NULL,
	`university_name` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT "user_role_check" CHECK("user"."role" in ('STUDENT', 'ADMIN')),
	CONSTRAINT "user_name_length" CHECK(length(trim("user"."name")) between 1 and 100),
	CONSTRAINT "user_university_length" CHECK("user"."university_name" is null or length(trim("user"."university_name")) between 1 and 100),
	CONSTRAINT "user_student_requires_university" CHECK("user"."role" <> 'STUDENT' or "user"."university_name" is not null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);