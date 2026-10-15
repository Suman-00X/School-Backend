import { accountService } from "../../../users/accounts/index.js";
import { parentService } from "../../../users/parents/index.js";
import { studentParentService, studentService } from "../../../users/students/index.js";
import { academicYearService } from "../../../academics/academic-years/index.js";
import { enrollmentService } from "../../../academics/enrollments/index.js";
import { sectionService } from "../../../academics/sections/index.js";

/* Turns "who should hear about this" into user ids */
export const recipients = {
  /* Accounts of these students and/or their linked parents */
  forStudents: async (ctx, studentIds, { students = true, parents = true } = {}) => {
    const ids = [];
    if (!studentIds.length) return ids;
    if (students) ids.push(...(await studentService.findManyByIds(ctx, studentIds)).map(s => s.userId));
    if (parents) {
      const links = await studentParentService.linksForStudents(ctx, studentIds);
      const parentRows = await parentService.findManyByIds(ctx, [...new Set(links.map(l => l.parentId))]);
      ids.push(...parentRows.map(p => p.userId));
    }
    return [...new Set(ids)];
  },

  /* Students currently enrolled in sections (all sections of the current year when none given) */
  studentsInSections: async (ctx, { sectionIds = [], classIds = [] } = {}) => {
    const year = await academicYearService.findCurrent(ctx);
    if (!year) return [];
    let sections = await sectionService.findAllInYear(ctx, year.id);
    if (sectionIds.length) sections = sections.filter(s => sectionIds.includes(s.id));
    if (classIds.length) sections = sections.filter(s => classIds.includes(s.classId));
    const rosters = await Promise.all(sections.map(s => enrollmentService.findRoster(ctx, s.id)));
    return [...new Set(rosters.flat().map(e => e.studentId))];
  },

  /* Announcement audience -> user ids.
     roles: which kinds of people; classIds/sectionIds narrow STUDENT and PARENT. */
  forAudience: async (ctx, { roles, classIds = [], sectionIds = [] }) => {
    const ids = new Set();
    const staffRoles = roles.filter(role => role !== "STUDENT" && role !== "PARENT");
    if (staffRoles.length) (await accountService.findByRoles(ctx, staffRoles)).forEach(u => ids.add(u.id));

    const wantsStudents = roles.includes("STUDENT");
    const wantsParents = roles.includes("PARENT");
    if (wantsStudents || wantsParents) {
      const studentIds = await recipients.studentsInSections(ctx, { sectionIds, classIds });
      (await recipients.forStudents(ctx, studentIds, { students: wantsStudents, parents: wantsParents })).forEach(id =>
        ids.add(id)
      );
    }
    return [...ids];
  }
};
