ALTER TABLE "attendance_policies" ADD COLUMN "low_attendance_threshold" integer DEFAULT 75 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_policies" ADD COLUMN "low_attendance_min_days" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_low_threshold_chk" CHECK ("attendance_policies"."low_attendance_threshold" BETWEEN 1 AND 100);--> statement-breakpoint
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_low_min_days_chk" CHECK ("attendance_policies"."low_attendance_min_days" BETWEEN 1 AND 365);
