import { and, eq, ne } from "drizzle-orm";
import { conflict, forbidden, notFound, unprocessable } from "../../../../common/http/errors.js";
import { teacherService } from "../../../users/teachers/index.js";
import { academicYearService } from "../../academic-years/index.js";
import { sectionService } from "../../sections/index.js";
import { sectionSubjectService } from "../../section-subjects/index.js";
import { WEEKDAY_NAMES as DAY_NAMES } from "../../shared/constants/academic.constants.js";
import { teacherAssignmentService, teachingScope } from "../../teacher-assignments/index.js";
import { timetableSlots } from "../models/timetableSlot.schema.js";
import { timetableSlotRepository } from "../repositories/timetableSlot.repository.js";
import { periodService } from "./period.service.js";

const slotDetails = {
  period: { columns: { id: true, periodNumber: true, name: true, startTime: true, endTime: true } },
  subject: { columns: { id: true, subjectName: true, subjectCode: true } },
  teacher: {
    columns: { id: true, employeeCode: true },
    with: { user: { columns: { firstName: true, lastName: true } } }
  },
  section: {
    columns: { id: true, sectionName: true },
    with: { class: { columns: { className: true, classOrder: true } } }
  }
};

const busy = (ctx, slot, extra, exceptId) =>
  timetableSlotRepository.findOne(
    ctx.tenantId,
    [
      eq(timetableSlots.weekday, slot.weekday),
      eq(timetableSlots.periodId, slot.periodId),
      extra,
      exceptId && ne(timetableSlots.id, exceptId)
    ].filter(Boolean),
    { with: slotDetails }
  );

/* Validate a full slot (section, weekday, period, subject, teacher, room) and
   resolve the teacher from the section's teacher assignment when omitted */
const checkSlot = async (ctx, slot, exceptId) => {
  const section = await sectionService.findById(ctx, slot.sectionId);
  if (!section) throw unprocessable("sectionId does not refer to an existing section");
  const academicYear = await academicYearService.findById(ctx, section.academicYearId);

  const period = await periodService.findById(ctx, slot.periodId);
  if (!period || period.academicYearId !== section.academicYearId) {
    throw unprocessable("periodId does not refer to a period of the section's academic year");
  }
  if (period.isBreak) throw unprocessable(`${period.name} is a break; classes cannot be scheduled in it`);
  if (academicYear.weeklyOffDays.includes(slot.weekday % 7)) {
    throw unprocessable(`${DAY_NAMES[slot.weekday]} is a weekly off day for this academic year`);
  }

  if (!(await sectionSubjectService.isTaught(ctx, section.academicYearId, slot.sectionId, slot.subjectId))) {
    throw unprocessable("This subject is not taught in the section. Add it to the section first.");
  }

  const assignment = (await teacherAssignmentService.findForSection(ctx, slot.sectionId)).find(
    a => a.subjectId === slot.subjectId
  );
  const teacherId = slot.teacherId ?? assignment?.teacherId;
  if (!teacherId) throw unprocessable("No teacher is assigned to this subject in the section; send teacherId");
  if (!(await teacherService.exists(ctx, teacherId)))
    throw unprocessable("teacherId does not refer to an existing teacher");

  const resolved = { ...slot, teacherId, academicYearId: section.academicYearId, room: slot.room ?? null };
  const when = `${DAY_NAMES[slot.weekday]} ${period.name}`;

  const sectionClash = await busy(ctx, resolved, eq(timetableSlots.sectionId, slot.sectionId), exceptId);
  if (sectionClash) throw conflict(`The section already has ${sectionClash.subject.subjectName} on ${when}`);

  const teacherClash = await busy(ctx, resolved, eq(timetableSlots.teacherId, teacherId), exceptId);
  if (teacherClash) {
    const where = `${teacherClash.section.class.className}-${teacherClash.section.sectionName}`;
    throw conflict(`The teacher is already teaching ${where} on ${when}`);
  }

  if (resolved.room) {
    const roomClash = await busy(
      ctx,
      resolved,
      and(eq(timetableSlots.room, resolved.room), eq(timetableSlots.academicYearId, resolved.academicYearId)),
      exceptId
    );
    if (roomClash) throw conflict(`Room ${resolved.room} is already in use on ${when}`);
  }
  return resolved;
};

/* Group slots into a weekly grid: { periods, days: [{ weekday, name, slots }] } */
const toGrid = (periods, slots, weeklyOffDays) => ({
  periods: periods.map(p => ({
    id: p.id,
    periodNumber: p.periodNumber,
    name: p.name,
    startTime: p.startTime,
    endTime: p.endTime,
    isBreak: p.isBreak
  })),
  days: [1, 2, 3, 4, 5, 6, 7]
    .filter(weekday => !weeklyOffDays.includes(weekday % 7))
    .map(weekday => ({
      weekday,
      name: DAY_NAMES[weekday],
      slots: slots
        .filter(slot => slot.weekday === weekday)
        .sort((a, b) => a.period.periodNumber - b.period.periodNumber)
        .map(slot => ({
          id: slot.id,
          period: slot.period,
          subject: slot.subject,
          teacher: slot.teacher
            ? {
                id: slot.teacher.id,
                name: `${slot.teacher.user?.firstName ?? ""} ${slot.teacher.user?.lastName ?? ""}`.trim()
              }
            : null,
          section: slot.section
            ? { id: slot.section.id, name: `${slot.section.class?.className}-${slot.section.sectionName}` }
            : null,
          room: slot.room
        }))
    }))
});

const lessonsWhere = async (ctx, condition) =>
  (await timetableSlotRepository.findMany(ctx.tenantId, { conditions: [condition], with: slotDetails })).sort(
    (a, b) => a.weekday - b.weekday || a.period.periodNumber - b.period.periodNumber
  );

export const timetableService = {
  create: async (ctx, data) => {
    const slot = await checkSlot(ctx, data);
    return timetableSlotRepository.create(ctx.tenantId, slot);
  },

  update: async (ctx, slotId, data) => {
    const existing = await timetableSlotRepository.findById(ctx.tenantId, slotId);
    if (!existing) throw notFound("Timetable slot");
    const merged = { ...existing, ...data };
    /* A new subject means a new default teacher, unless one is sent */
    if (data.subjectId && !data.teacherId) delete merged.teacherId;
    const slot = await checkSlot(ctx, merged, slotId);
    return timetableSlotRepository.update(ctx.tenantId, slotId, slot);
  },

  remove: async (ctx, slotId) => {
    const row = await timetableSlotRepository.softDelete(ctx.tenantId, slotId);
    if (!row) throw notFound("Timetable slot");
    return row;
  },

  /* Weekly grid of a section. Teachers: only as its class teacher or deputy (D-11). */
  forSection: async (ctx, sectionId) => {
    const section = await sectionService.findById(ctx, sectionId);
    if (!section) throw notFound("Section");
    if (!(await teachingScope.leadsSection(ctx, sectionId))) {
      throw forbidden("You can see your own timetable, and a section's timetable only as its class teacher");
    }
    const academicYear = await academicYearService.findById(ctx, section.academicYearId);
    const [periods, slots] = await Promise.all([
      periodService.findAllInYear(ctx, section.academicYearId),
      timetableSlotRepository.findMany(ctx.tenantId, {
        conditions: [eq(timetableSlots.sectionId, sectionId)],
        with: slotDetails
      })
    ]);
    return {
      section: { id: section.id, name: `${section.class?.className}-${section.sectionName}` },
      academicYearId: section.academicYearId,
      ...toGrid(periods, slots, academicYear.weeklyOffDays)
    };
  },

  /* Weekly grid of a teacher in an academic year. Teachers: only their own (D-11). */
  forTeacher: async (ctx, teacherId, academicYear) => {
    const scope = await teachingScope.of(ctx);
    if (scope && scope.teacherId !== teacherId) throw forbidden("You can only see your own timetable");
    if (!(await teacherService.exists(ctx, teacherId))) throw notFound("Teacher");
    const [periods, slots] = await Promise.all([
      periodService.findAllInYear(ctx, academicYear.id),
      timetableSlotRepository.findMany(ctx.tenantId, {
        conditions: [eq(timetableSlots.teacherId, teacherId), eq(timetableSlots.academicYearId, academicYear.id)],
        with: slotDetails
      })
    ]);
    const lessons = slots.length;
    return {
      teacherId,
      academicYearId: academicYear.id,
      weeklyLessons: lessons,
      ...toGrid(periods, slots, academicYear.weeklyOffDays)
    };
  },

  /* For attendance: the class a section has in a period on a weekday (with subject, teacher), or null */
  lessonAt: (ctx, sectionId, weekday, periodId) =>
    timetableSlotRepository.findOne(
      ctx.tenantId,
      [
        eq(timetableSlots.sectionId, sectionId),
        eq(timetableSlots.weekday, weekday),
        eq(timetableSlots.periodId, periodId)
      ],
      { with: slotDetails }
    ),

  /* Every weekly class of a section, by weekday and bell order */
  lessonsOf: (ctx, sectionId) => lessonsWhere(ctx, eq(timetableSlots.sectionId, sectionId)),

  /* Every weekly class of an academic year, by weekday and bell order */
  lessonsInYear: (ctx, academicYearId) => lessonsWhere(ctx, eq(timetableSlots.academicYearId, academicYearId))
};
