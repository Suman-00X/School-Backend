CREATE TYPE "public"."document_format_type" AS ENUM('BONAFIDE', 'CHARACTER', 'TRANSFER', 'REPORT_CARD');--> statement-breakpoint
ALTER TABLE "certificate_format_versions" ALTER COLUMN "type" SET DATA TYPE "public"."document_format_type" USING "type"::text::"public"."document_format_type";
