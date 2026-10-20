import { staffAttendanceService } from "../../../hr/staff-attendance/index.js";
import { teacherService } from "../../../users/teachers/index.js";
import { AWAY_STATUSES } from "../../shared/constants/academic.constants.js";

/* Who is away: staff attendance is the one record of it. Approved leave writes its marks
   ahead (LEAVE, or HALF_DAY for a half-day leave), so future dates are known too. */

export const teacherName = teacher => `${teacher?.user?.firstName ?? ""} ${teacher?.user?.lastName ?? ""}`.trim();

/* "on leave", "absent", "on a half day" */
export const AWAY_TEXT = { ABSENT: "absent", LEAVE: "on leave", HALF_DAY: "on a half day" };

/* Does the mark keep the teacher from the period? A half day with a check-in time misses
   the periods that start before it, with a check-out time the ones that end after it, and
   with neither every period (which half is not known). */
export const awayIn = (mark, period) => {
  if (mark.status !== "HALF_DAY" || (!mark.checkIn && !mark.checkOut)) return true;
  return Boolean(
    (mark.checkIn && period.startTime < mark.checkIn) || (mark.checkOut && period.endTime > mark.checkOut)
  );
};

export const absenceService = {
  /* The teachers with active accounts, and their away marks in [from, to]
     -> { teachers: Map(teacherId -> teacher with user), markOf(teacherId, date) -> mark | null } */
  inRange: async (ctx, from, to) => {
    const [teachers, marks] = await Promise.all([
      teacherService.findAllActive(ctx),
      staffAttendanceService.inRange(ctx, from, to)
    ]);
    const byUser = new Map(teachers.map(teacher => [teacher.userId, teacher]));
    const away = new Map();
    for (const mark of marks) {
      const teacher = byUser.get(mark.userId);
      if (teacher && AWAY_STATUSES.includes(mark.status)) away.set(`${teacher.id}|${mark.date}`, mark);
    }
    return {
      teachers: new Map(teachers.map(teacher => [teacher.id, teacher])),
      markOf: (teacherId, date) => away.get(`${teacherId}|${date}`) ?? null
    };
  }
};
