ALTER TABLE "calendar_events" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "exam_id" uuid;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "start_time" time;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "end_time" time;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "venue" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "class_ids" uuid[];--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_exam_uq" ON "calendar_events" USING btree ("exam_id") WHERE "calendar_events"."exam_id" IS NOT NULL AND "calendar_events"."is_active" = true;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_times_chk" CHECK ("calendar_events"."start_time" IS NULL OR "calendar_events"."end_time" IS NULL OR "calendar_events"."end_time" > "calendar_events"."start_time");