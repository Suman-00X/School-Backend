CREATE TYPE "public"."library_fine_day_basis" AS ENUM('ACADEMIC_DAYS', 'CALENDAR_DAYS');--> statement-breakpoint
ALTER TABLE "library_policies" ADD COLUMN "fine_day_basis" "library_fine_day_basis" DEFAULT 'ACADEMIC_DAYS' NOT NULL;--> statement-breakpoint
/* Hand-written: schools that counted every day keep doing so */
UPDATE "library_policies" SET "fine_day_basis" = 'CALENDAR_DAYS' WHERE NOT "skip_closed_days_in_fines";--> statement-breakpoint
ALTER TABLE "library_policies" DROP COLUMN "skip_closed_days_in_fines";