import { subscribe } from "../../../common/events/events.js";
import { sectionService } from "../../academics/sections/index.js";
import {
  DIARY_ENTRY_WRITTEN,
  DIARY_KIND_LABELS,
  DIARY_PARENT_NOTE,
  NOTIFIED_KINDS,
  diaryService
} from "../../academics/diary/index.js";
import { teacherService } from "../../users/teachers/index.js";
import { notificationService } from "../notifications/index.js";
import { recipients } from "../shared/services/recipients.service.js";
import { messages } from "../shared/templates/messages.js";

const PREVIEW = 140;
const preview = text => (text.length > PREVIEW ? `${text.slice(0, PREVIEW - 1).trimEnd()}…` : text);
const fullName = user => (user ? `${user.firstName} ${user.lastName}`.trim() : "your child");
const sectionName = section => `${section?.class?.className ?? ""}-${section?.sectionName ?? ""}`;

/* A reminder or note in the diary -> the students who read it and their parents (in-app).
   Classwork and homework lines are read in the diary itself, without a notification. */
subscribe(DIARY_ENTRY_WRITTEN, "communication.diaryEntry", async ({ tenantId, entryId }) => {
  const ctx = { tenantId, role: "SYSTEM" };
  const entry = await diaryService.findEntry(ctx, entryId);
  if (!entry || !NOTIFIED_KINDS.includes(entry.kind)) return;
  const section = await sectionService.findById(ctx, entry.sectionId);
  await notificationService.notify(ctx, {
    userIds: await recipients.forStudents(ctx, await diaryService.readersOf(ctx, entry)),
    type: "MESSAGE",
    ...messages.diaryEntry({
      kindLabel: DIARY_KIND_LABELS[entry.kind],
      sectionName: sectionName(section),
      studentName: entry.studentId ? fullName(entry.student?.user) : null,
      date: entry.entryDate,
      preview: preview(entry.body)
    }),
    data: { diaryEntryId: entryId, sectionId: entry.sectionId, date: entry.entryDate, studentId: entry.studentId }
  });
});

/* A parent's note when signing -> the class teacher, the deputy, and whoever wrote a note to
   that student on the day */
subscribe(DIARY_PARENT_NOTE, "communication.diaryParentNote", async ({ tenantId, signatureId }) => {
  const ctx = { tenantId, role: "SYSTEM" };
  const signature = await diaryService.findSignature(ctx, signatureId);
  if (!signature?.parentNote) return;
  const section = await sectionService.findById(ctx, signature.sectionId);
  const leads = await teacherService.findActiveByIds(
    ctx,
    [section?.classTeacherId, section?.deputyClassTeacherId].filter(Boolean)
  );
  const writers = await diaryService.noteWritersFor(ctx, signature.studentId, signature.entryDate);
  const userIds = [...new Set([...leads.map(t => t.userId), ...writers])];
  if (!userIds.length) return;
  await notificationService.notify(ctx, {
    userIds,
    type: "MESSAGE",
    ...messages.diaryParentNote({
      studentName: fullName(signature.student?.user),
      date: signature.entryDate,
      preview: preview(signature.parentNote)
    }),
    data: { diarySignatureId: signatureId, sectionId: signature.sectionId, studentId: signature.studentId, date: signature.entryDate }
  });
});
