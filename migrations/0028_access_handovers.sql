CREATE TYPE "public"."access_revoke_reason" AS ENUM('REVOKED', 'HANDOVER');--> statement-breakpoint
ALTER TABLE "access_assignments" ADD COLUMN "revoke_reason" "access_revoke_reason";--> statement-breakpoint
ALTER TABLE "access_assignments" ADD CONSTRAINT "access_assignments_revoke_reason_chk" CHECK ("access_assignments"."revoke_reason" IS NULL OR "access_assignments"."revoked_at" IS NOT NULL);--> statement-breakpoint
-- Hand-written: rows revoked before reasons were recorded were revoked by hand
UPDATE "access_assignments" SET "revoke_reason" = 'REVOKED' WHERE "revoked_at" IS NOT NULL AND "revoke_reason" IS NULL;
