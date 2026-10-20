import { eq, gte, inArray } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { publish } from "../../../../common/events/events.js";
import { conflict, forbidden, notFound, unprocessable } from "../../../../common/http/errors.js";
import { tenantNow, tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { addDays, eachDay, isoWeekday } from "../../../../common/utils/date.util.js";
import { teacherService } from "../../../users/teachers/index.js";
import { academicYearService } from "../../academic-years/index.js";
import { calendarService } from "../../calendar/index.js";
import { sectionService } from "../../sections/index.js";
import { sectionSubjectService } from "../../section-subjects/index.js";
import { lockKey } from "../../shared/utils/locks.util.js";
import { subjectService } from "../../subjects/index.js";
import { teacherAssignmentService } from "../../teacher-assignments/index.js";
import { timetableService } from "../../timetable/index.js";
import { substitutions } from "../models/substitution.schema.js";
import { substitutionRepository } from "../repositories/substitution.repository.js";
import { AWAY_TEXT, absenceService, awayIn, teacherName } from "./absence.service.js";

/* Substitution planning (D-79): on a date, every lesson whose timetabled teacher is away
   needs cover (in the academic year the date falls in). ADMIN plans each one: a substitute teacher, an extra or co-curricular
   activity, or leisure. A lesson nobody plans is a leisure period: no register is due
   and nobody answers for it. Planning is for today and later dates; a past day's plan
   is history. The planned substitute takes the period's register. */

export const SUBSTITUTION_ASSIGNED = "academics.substitution.assigned";
export const SUBSTITUTION_CANCELLED = "academics.substitution.cancelled";

const person = { columns: { id: true, employeeCode: true }, with: { user: { columns: { firstName: true, lastName: true } } } };
const planDetails = {
  substituteTeacher: person,
  absentTeacher: person,
  subject: { columns: { id: true, subjectName: true } },
  section: { columns: { id: true, sectionName: true }, with: { class: { columns: { className: true } } } },
  period: { columns: { id: true, periodNumber: true, name: true, startTime: true, endTime: true } },
  slot: { columns: { id: true, subjectId: true }, with: { subject: { columns: { id: true, subjectName: true } } } }
};

const CLOSURE_TEXT = { WEEKLY_OFF: "a weekly off day", OUTSIDE_ACADEMIC_YEAR: "in no academic year" };
const closureText = closure => CLOSURE_TEXT[closure] ?? `a ${closure.toLowerCase().replaceAll("_", " ")}`;

const sectionName = section => `${section?.class?.className ?? ""}-${section?.sectionName ?? ""}`;
const teacherRef = teacher => (teacher ? { id: teacher.id, name: teacherName(teacher) } : null);
const periodRef = period => ({
  id: period.id,
  periodNumber: period.periodNumber,
  name: period.name,
  startTime: period.startTime,
  endTime: period.endTime
});
const byPeriod = (a, b) => a.period.periodNumber - b.period.periodNumber;

const planView = plan =>
  plan && {
    id: plan.id,
    kind: plan.kind,
    substitute: teacherRef(plan.substituteTeacher),
    /* SUBSTITUTE: the subject they take when it is not the lesson's */
    subject: plan.subject ? { id: plan.subject.id, subjectName: plan.subject.subjectName } : null,
    activity: plan.activity,
    note: plan.note,
    assignedBy: plan.assignedBy,
    updatedAt: plan.updatedAt
  };

/* NEEDED: nobody planned it yet; once the period is over unplanned, it was a leisure period */
const statusOf = ({ plan, ended }) => plan?.kind ?? (ended ? "LEISURE" : "NEEDED");

/* One lesson that needs cover, as listed in the day's plan */
const itemView = item => ({
  timetableSlotId: item.lesson.id,
  period: periodRef(item.lesson.period),
  section: { id: item.lesson.section.id, name: sectionName(item.lesson.section) },
  subject: { id: item.lesson.subject.id, subjectName: item.lesson.subject.subjectName },
  room: item.lesson.room,
  absentTeacher: teacherRef(item.lesson.teacher),
  ended: item.ended,
  status: statusOf(item),
  plan: planView(item.plan)
});

/* A stored plan with its lesson (a substitute's duty, or a plan no longer needed) */
const dutyView = plan => ({
  ...planView(plan),
  date: plan.date,
  timetableSlotId: plan.timetableSlotId,
  section: { id: plan.section.id, name: sectionName(plan.section) },
  period: periodRef(plan.period),
  lessonSubject: plan.slot?.subject ?? null,
  absentTeacher: teacherRef(plan.absentTeacher)
});

const emptyCounts = () => ({ periods: 0, needed: 0, substitute: 0, activity: 0, leisure: 0, notNeeded: 0 });
const COUNT_KEYS = {
  NEEDED: "needed",
  SUBSTITUTE: "substitute",
  ACTIVITY: "activity",
  LEISURE: "leisure",
  NOT_NEEDED: "notNeeded"
};
const countsOf = items => {
  const counts = emptyCounts();
  for (const item of items) {
    counts.periods++;
    counts[COUNT_KEYS[statusOf(item)]]++;
  }
  return counts;
};

const countBy = (rows, key) => {
  const counts = new Map();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return counts;
};

/* The mark that keeps the lesson's timetabled teacher from it on the date (it needs cover),
   or null. A plan for a lesson nobody is away from is "no longer needed": the absence was
   withdrawn, or the timetable changed. */
const awayMark = (absence, lesson, date) => {
  const mark = absence.markOf(lesson.teacherId, date);
  return mark && awayIn(mark, lesson.period) ? mark : null;
};

/* The plans still needed: their lesson is on the timetable that weekday and its teacher is
   away then. Attendance honours only these. */
const stillNeeded = async (ctx, plans) => {
  if (!plans.length) return plans;
  const dates = plans.map(plan => plan.date).sort();
  const [lessons, absence] = await Promise.all([
    timetableService.lessonsByIds(ctx, [...new Set(plans.map(plan => plan.timetableSlotId))]),
    absenceService.inRange(ctx, dates[0], dates.at(-1))
  ]);
  const lessonOf = new Map(lessons.map(lesson => [lesson.id, lesson]));
  return plans.filter(plan => {
    const lesson = lessonOf.get(plan.timetableSlotId);
    return Boolean(lesson && lesson.weekday === isoWeekday(plan.date) && awayMark(absence, lesson, plan.date));
  });
};

/* Everything about one date: its academic year, the lessons of its weekday, who is away,
   the plans, and the lessons that need cover
   -> { date, today, academicYear, closure, lessons, absence, plans, items: [{ lesson, mark, plan, ended }] } */
const loadDay = async (ctx, date) => {
  const [academicYear, now] = await Promise.all([
    academicYearService.findContaining(ctx, date),
    tenantNow(ctx.tenantId)
  ]);
  const closure = academicYear ? await calendarService.closureOn(ctx, academicYear, date) : "OUTSIDE_ACADEMIC_YEAR";
  const day = { date, today: now.date, academicYear, closure, lessons: [], absence: null, plans: [], items: [] };
  if (closure) return day;

  const weekday = isoWeekday(date);
  const [lessons, absence, plans] = await Promise.all([
    timetableService.lessonsInYear(ctx, academicYear.id),
    absenceService.inRange(ctx, date, date),
    substitutionRepository.findInRange(ctx.tenantId, { from: date, to: date }, { with: planDetails })
  ]);
  day.lessons = lessons.filter(lesson => lesson.weekday === weekday);
  day.absence = absence;
  day.plans = plans;
  const planOf = new Map(plans.map(plan => [plan.timetableSlotId, plan]));
  const ended = period => date < now.date || (date === now.date && period.endTime <= now.time);
  for (const lesson of day.lessons) {
    const mark = awayMark(absence, lesson, date);
    if (!mark) continue;
    day.items.push({ lesson, mark, plan: planOf.get(lesson.id) ?? null, ended: ended(lesson.period) });
  }
  return day;
};

/* The lesson of the day that needs cover, or a 404/422 that says why it does not */
const itemOf = (day, timetableSlotId) => {
  const item = day.items.find(candidate => candidate.lesson.id === timetableSlotId);
  if (item) return item;
  const lesson = day.lessons.find(candidate => candidate.id === timetableSlotId);
  if (!lesson) {
    throw unprocessable(`timetableSlotId does not refer to a lesson of the timetable on ${day.date}'s weekday`);
  }
  throw unprocessable(
    `${teacherName(lesson.teacher)} is not away for ${lesson.period.name} of ${sectionName(lesson.section)} on ${day.date}: only an absent teacher's periods are planned (record the absence or leave in Staff attendance first)`
  );
};

/* Why the teacher cannot take the lesson's period that day, or null when they can */
const unavailability = (day, lesson, teacherId) => {
  const mark = day.absence.markOf(teacherId, day.date);
  if (mark && awayIn(mark, lesson.period)) return `they are ${AWAY_TEXT[mark.status]} then`;
  const own = day.lessons.find(other => other.teacherId === teacherId && other.periodId === lesson.periodId);
  if (own) return `they teach ${own.subject.subjectName} in ${sectionName(own.section)} then`;
  const cover = day.plans.find(
    plan =>
      plan.substituteTeacherId === teacherId && plan.periodId === lesson.periodId && plan.timetableSlotId !== lesson.id
  );
  if (cover) return `they already cover ${sectionName(cover.section)} then`;
  return null;
};

const assertPlannable = (day, today) => {
  if (day.date < today) throw unprocessable("Substitutions are planned for today or a later date: a past day's plan cannot change");
  if (day.closure) throw unprocessable(`There are no classes on ${day.date}: it is ${closureText(day.closure)}`);
};

/* Tell the teachers: the one taken off the lesson (the plan may be gone, so the event
   names the lesson), and the one now on it. `lesson`: a plan with planDetails. */
const notify = async (ctx, previous, row, lesson = row) => {
  const before = previous?.substituteTeacherId ?? null;
  if (before && before !== row?.substituteTeacherId) {
    await publish(SUBSTITUTION_CANCELLED, {
      tenantId: ctx.tenantId,
      substitutionId: previous.id,
      teacherId: before,
      date: lesson.date,
      sectionId: lesson.sectionId,
      sectionName: sectionName(lesson.section),
      periodName: lesson.period.name
    });
  }
  if (!row?.substituteTeacherId) return;
  const changed =
    !previous ||
    before !== row.substituteTeacherId ||
    previous.kind !== row.kind ||
    previous.activity !== row.activity ||
    previous.subjectId !== row.subjectId;
  if (changed) {
    await publish(SUBSTITUTION_ASSIGNED, { tenantId: ctx.tenantId, substitutionId: row.id });
  }
};

export const substitutionService = {
  /* The day's plan: every absent teacher with the lessons they miss and how each is covered,
     the counts, and plans whose teacher is no longer away (leave cancelled, timetable changed) */
  plan: async (ctx, { date } = {}) => {
    const day = await loadDay(ctx, date ?? (await tenantToday(ctx.tenantId)));
    const byTeacher = new Map();
    for (const item of day.items) {
      if (!byTeacher.has(item.lesson.teacherId)) byTeacher.set(item.lesson.teacherId, []);
      byTeacher.get(item.lesson.teacherId).push(item);
    }
    const covered = new Set(day.items.map(item => item.lesson.id));
    return {
      date: day.date,
      today: day.today,
      workingDay: !day.closure,
      closure: day.closure,
      /* Today and later dates can be planned */
      editable: !day.closure && day.date >= day.today,
      counts: countsOf(day.items),
      absentTeachers: [...byTeacher.values()]
        .map(items => {
          const { lesson, mark } = items[0];
          return {
            teacher: { ...teacherRef(lesson.teacher), employeeCode: lesson.teacher.employeeCode },
            status: mark.status,
            checkIn: mark.checkIn,
            checkOut: mark.checkOut,
            remarks: mark.remarks,
            onLeave: Boolean(mark.leaveRequestId),
            periods: items.sort((a, b) => byPeriod(a.lesson, b.lesson)).map(itemView)
          };
        })
        .sort((a, b) => a.teacher.name.localeCompare(b.teacher.name)),
      noLongerNeeded: day.plans.filter(plan => !covered.has(plan.timetableSlotId)).map(dutyView)
    };
  },

  /* For the home page: periods still to plan today, and on the next working day */
  summary: async ctx => {
    const today = await loadDay(ctx, await tenantToday(ctx.tenantId));
    const { workingDays } = today.academicYear
      ? await calendarService.workingDays(ctx, today.academicYear, addDays(today.date, 1), addDays(today.date, 14))
      : { workingDays: [] };
    const next = workingDays[0] ? await loadDay(ctx, workingDays[0]) : null;
    const brief = day => {
      const counts = countsOf(day.items);
      return {
        date: day.date,
        needed: counts.needed,
        periods: counts.periods,
        absentTeachers: new Set(day.items.map(item => item.lesson.teacherId)).size
      };
    };
    return { ...brief(today), workingDay: !today.closure, next: next && brief(next) };
  },

  /* Teachers for one lesson, the ones who can take it first: free then, then who teaches
     the section, then who teaches the subject, then the lightest day */
  candidates: async (ctx, { date, timetableSlotId }) => {
    const day = await loadDay(ctx, date);
    if (day.closure) throw unprocessable(`There are no classes on ${date}: it is ${closureText(day.closure)}`);
    const { lesson, plan } = itemOf(day, timetableSlotId);
    const [section, assignments, taught] = await Promise.all([
      sectionService.findById(ctx, lesson.sectionId),
      teacherAssignmentService.findInYear(ctx, day.academicYear.id),
      sectionSubjectService.findForSections(ctx, [lesson.sectionId])
    ]);
    const subjects = await subjectService.findManyByIds(
      ctx,
      taught.map(row => row.subjectId)
    );
    const ofSection = new Set(
      [
        section?.classTeacherId,
        section?.deputyClassTeacherId,
        ...assignments.filter(a => a.sectionId === lesson.sectionId).map(a => a.teacherId)
      ].filter(Boolean)
    );
    const ofSubject = new Set(assignments.filter(a => a.subjectId === lesson.subjectId).map(a => a.teacherId));
    const lessonsOf = countBy(day.lessons, l => l.teacherId);
    const coversOf = countBy(
      day.plans.filter(p => p.substituteTeacherId),
      p => p.substituteTeacherId
    );

    const rows = [...day.absence.teachers.values()]
      .filter(teacher => teacher.id !== lesson.teacherId)
      .map(teacher => {
        const reason = unavailability(day, lesson, teacher.id);
        return {
          teacherId: teacher.id,
          name: teacherName(teacher),
          employeeCode: teacher.employeeCode,
          available: !reason,
          unavailableReason: reason,
          teachesSection: ofSection.has(teacher.id),
          teachesSubject: ofSubject.has(teacher.id),
          lessonsThatDay: lessonsOf.get(teacher.id) ?? 0,
          coversThatDay: coversOf.get(teacher.id) ?? 0,
          current: plan?.substituteTeacherId === teacher.id
        };
      })
      .sort(
        (a, b) =>
          b.available - a.available ||
          b.teachesSection - a.teachesSection ||
          b.teachesSubject - a.teachesSubject ||
          a.lessonsThatDay + a.coversThatDay - (b.lessonsThatDay + b.coversThatDay) ||
          a.name.localeCompare(b.name)
      );
    return {
      date,
      timetableSlotId,
      lesson: itemView({ lesson, plan, ended: false }),
      teachers: rows,
      /* What a substitute may teach instead of the lesson's subject */
      subjects: subjects
        .map(subject => ({ id: subject.id, subjectName: subject.subjectName }))
        .sort((a, b) => a.subjectName.localeCompare(b.subjectName))
    };
  },

  /* Plan one lesson (again: replace its plan). -> { created, item } */
  assign: async (ctx, { date, timetableSlotId, kind, substituteTeacherId, subjectId, activity, note }) => {
    const day = await loadDay(ctx, date);
    assertPlannable(day, day.today);
    const item = itemOf(day, timetableSlotId);
    const { lesson, mark } = item;
    const when = `${lesson.period.name} of ${sectionName(lesson.section)} on ${date}`;

    const values = {
      kind,
      substituteTeacherId: null,
      subjectId: null,
      activity: kind === "ACTIVITY" ? activity : null,
      note: note ?? null
    };
    if (substituteTeacherId) {
      const teacher = day.absence.teachers.get(substituteTeacherId);
      if (!teacher) throw unprocessable("substituteTeacherId does not refer to a teacher with an active account");
      if (teacher.id === lesson.teacherId) throw unprocessable(`${teacherName(teacher)} is the absent teacher of ${when}`);
      const reason = unavailability(day, lesson, teacher.id);
      if (reason) throw conflict(`${teacherName(teacher)} cannot take ${when}: ${reason}`);
      values.substituteTeacherId = teacher.id;
    }
    if (kind === "SUBSTITUTE" && subjectId && subjectId !== lesson.subjectId) {
      if (!(await sectionSubjectService.isTaught(ctx, day.academicYear.id, lesson.sectionId, subjectId))) {
        throw unprocessable(`subjectId does not refer to a subject taught in ${sectionName(lesson.section)}`);
      }
      values.subjectId = subjectId;
    }
    if (kind === "NOT_NEEDED" && mark.status !== "HALF_DAY") {
      throw unprocessable(
        `${teacherName(lesson.teacher)} is ${AWAY_TEXT[mark.status]} for the whole day: they cannot take ${when}`
      );
    }

    const { id, previous } = await transaction(async tx => {
      await lockKey(tx, "academics.substitution", ctx.tenantId, timetableSlotId, date);
      const existing = await substitutionRepository.findAt(ctx.tenantId, { timetableSlotId, date }, { dbc: tx });
      const fields = {
        ...values,
        sectionId: lesson.sectionId,
        periodId: lesson.periodId,
        absentTeacherId: lesson.teacherId,
        assignedBy: ctx.userId
      };
      const row = existing
        ? await substitutionRepository.update(ctx.tenantId, existing.id, fields, { dbc: tx })
        : await substitutionRepository.create(
            ctx.tenantId,
            { ...fields, academicYearId: day.academicYear.id, date, timetableSlotId },
            { dbc: tx }
          );
      return { id: row.id, previous: existing };
    });

    const row = await substitutionRepository.findById(ctx.tenantId, id, { with: planDetails });
    await notify(ctx, previous, row);
    return { created: !previous, item: itemView({ ...item, plan: row }) };
  },

  /* Cancel a plan: the lesson needs cover again. -> the cancelled plan */
  cancel: async (ctx, substitutionId) => {
    const row = await substitutionRepository.findById(ctx.tenantId, substitutionId, { with: planDetails });
    if (!row) throw notFound("Substitution");
    if (row.date < (await tenantToday(ctx.tenantId))) {
      throw unprocessable("A past day's plan cannot change");
    }
    const removed = await substitutionRepository.softDelete(ctx.tenantId, row.id);
    if (!removed) throw notFound("Substitution");
    await notify(ctx, row, null, row);
    return dutyView(row);
  },

  /* For the timetable: these lessons are being removed (by hand, or a generated week replacing
     them), so their plans for today and later go too, in the caller's transaction. A past
     day's plan stays as history. -> the cancelled plans: pass them to notifyCancelled once
     the transaction commits */
  cancelForLessons: async (ctx, timetableSlotIds, { dbc }) => {
    if (!timetableSlotIds.length) return [];
    const conditions = [
      inArray(substitutions.timetableSlotId, timetableSlotIds),
      gte(substitutions.date, await tenantToday(ctx.tenantId))
    ];
    const rows = await substitutionRepository.findMany(ctx.tenantId, { conditions, with: planDetails, dbc });
    if (rows.length) await substitutionRepository.softDeleteWhere(ctx.tenantId, conditions, { dbc });
    return rows;
  },

  /* Tell each substitute they are off the lesson, as a cancelled plan does */
  notifyCancelled: async (ctx, plans) => {
    for (const plan of plans) await notify(ctx, plan, null, plan);
  },

  /* The signed-in teacher's substitution duties in [from, to] (default: the next 7 days) */
  mine: async (ctx, { from, to }) => {
    const teacher = await teacherService.findByUserId(ctx, ctx.userId);
    if (!teacher) throw forbidden("Only teachers have substitution duties");
    const start = from ?? (await tenantToday(ctx.tenantId));
    const end = to ?? addDays(start, 6);
    const rows = await substitutionRepository.findInRange(
      ctx.tenantId,
      { from: start, to: end, conditions: [eq(substitutions.substituteTeacherId, teacher.id)] },
      { with: planDetails }
    );
    return {
      teacherId: teacher.id,
      from: start,
      to: end,
      duties: rows
        .sort((a, b) => a.date.localeCompare(b.date) || a.period.periodNumber - b.period.periodNumber)
        .map(dutyView)
    };
  },

  findById: (ctx, substitutionId) =>
    substitutionRepository.findById(ctx.tenantId, substitutionId, { with: planDetails }),

  /* For attendance: the plan in force for a lesson on a date, or null (also when it is no
     longer needed: the timetabled teacher takes the lesson) */
  planAt: async (ctx, { timetableSlotId, date }) => {
    const plan = await substitutionRepository.findAt(ctx.tenantId, { timetableSlotId, date });
    return plan ? ((await stillNeeded(ctx, [plan]))[0] ?? null) : null;
  },

  /* For attendance: a section's plans still needed on a date, with the substitute's name
     -> [plan view + slot id] */
  forSectionOn: async (ctx, sectionId, date) =>
    (
      await stillNeeded(
        ctx,
        await substitutionRepository.findInRange(
          ctx.tenantId,
          { from: date, to: date, conditions: [eq(substitutions.sectionId, sectionId)] },
          { with: planDetails }
        )
      )
    ).map(dutyView),

  /* For attendance: the lessons a teacher covers on a date (substitute or activity in charge),
     while still needed */
  dutiesOn: async (ctx, teacherId, date) =>
    stillNeeded(
      ctx,
      await substitutionRepository.findInRange(ctx.tenantId, {
        from: date,
        to: date,
        conditions: [eq(substitutions.substituteTeacherId, teacherId)]
      })
    ),

  /* For attendance: how the year's lessons in [from, to] are covered
     -> Map("slotId|date" -> { away: the timetabled teacher is away then, plan | null }) */
  coverage: async (ctx, academicYear, from, to) => {
    const [lessons, absence, plans] = await Promise.all([
      timetableService.lessonsInYear(ctx, academicYear.id),
      absenceService.inRange(ctx, from, to),
      substitutionRepository.findInRange(ctx.tenantId, { from, to })
    ]);
    const coverage = new Map();
    const byWeekday = Map.groupBy(lessons, lesson => lesson.weekday);
    for (const date of eachDay(from, to)) {
      for (const lesson of byWeekday.get(isoWeekday(date)) ?? []) {
        if (awayMark(absence, lesson, date)) coverage.set(`${lesson.id}|${date}`, { away: true, plan: null });
      }
    }
    for (const plan of plans) {
      const key = `${plan.timetableSlotId}|${plan.date}`;
      coverage.set(key, { away: coverage.get(key)?.away ?? false, plan });
    }
    return coverage;
  }
};
