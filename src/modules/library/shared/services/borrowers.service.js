import { ROLES } from "../../../../common/auth/roles.js";
import { notFound, unprocessable } from "../../../../common/http/errors.js";
import { academicYearService } from "../../../academics/academic-years/index.js";
import { enrollmentService } from "../../../academics/enrollments/index.js";
import { sectionService } from "../../../academics/sections/index.js";
import { accountService } from "../../../users/accounts/index.js";
import { parentService } from "../../../users/parents/index.js";
import { studentParentService, studentService } from "../../../users/students/index.js";
import { BORROWER_ROLES } from "../constants/library.constants.js";
import { fullName } from "../utils/circulation.util.js";

/* The class a student is in this year (null when not enrolled) */
const currentClassOf = async (ctx, studentId) => {
  const year = await academicYearService.findCurrent(ctx);
  if (!year || !studentId) return null;
  const enrollments = await enrollmentService.findAllForStudent(ctx, studentId);
  const current = enrollments.find(e => e.academicYearId === year.id && e.status === "ACTIVE");
  return current?.section?.classId ?? null;
};

/* Who borrows, and what decides their circulation rule (role; class for students) */
export const borrowers = {
  /* An active account that may borrow -> { id, role, name, classId, studentId } */
  forCirculation: async (ctx, userId, { field = "borrowerUserId" } = {}) => {
    const [user] = await accountService.findManyByIds(ctx, [userId]);
    if (!user) throw unprocessable(`${field} does not refer to an active account`);
    if (user.status !== "ACTIVE") {
      throw unprocessable(`${fullName(user)}'s account is ${user.status.toLowerCase()}; it cannot borrow books`);
    }
    if (!BORROWER_ROLES.includes(user.role)) {
      throw unprocessable("Parents cannot borrow books; issue them to the student instead");
    }
    const student = user.role === ROLES.STUDENT ? await studentService.findByUserId(ctx, userId) : null;
    return {
      id: user.id,
      role: user.role,
      name: fullName(user),
      studentId: student?.id ?? null,
      classId: student ? await currentClassOf(ctx, student.id) : null
    };
  },

  /* { id, name, role, status } of any account (inactive ones too: they may still owe fines) */
  describe: async (ctx, userId) => {
    const [user] = await accountService.findManyByIds(ctx, [userId]);
    if (!user) throw notFound("Borrower");
    return { id: user.id, name: fullName(user), role: user.role, status: user.status };
  },

  /* Student account id -> "Class 1 A" for this year's rosters (for reports) */
  classNames: async ctx => {
    const names = new Map();
    const year = await academicYearService.findCurrent(ctx);
    if (!year) return names;
    for (const section of await sectionService.findAllInYear(ctx, year.id)) {
      for (const enrollment of await enrollmentService.findRoster(ctx, section.id)) {
        names.set(enrollment.student.userId, `${section.class?.className ?? ""} ${section.sectionName}`.trim());
      }
    }
    return names;
  },

  /* "Asha Rao" */
  nameOf: async (ctx, userId) => {
    const [user] = await accountService.findManyByIds(ctx, [userId]);
    return user ? fullName(user) : "another reader";
  },

  /* Account ids of the parents linked to these student accounts */
  parentUserIdsOf: async (ctx, studentUserIds) => {
    const students = await Promise.all(studentUserIds.map(userId => studentService.findByUserId(ctx, userId)));
    const links = await studentParentService.linksForStudents(
      ctx,
      students.filter(Boolean).map(student => student.id)
    );
    const parents = await parentService.findManyByIds(ctx, [...new Set(links.map(link => link.parentId))]);
    return parents.map(parent => parent.userId);
  },

  /* Whose library account the signed-in person may see: their own; a parent, their children's */
  visibleTo: async ctx => {
    if (ctx.role !== ROLES.PARENT) return [ctx.userId];
    const parent = await parentService.findByUserId(ctx, ctx.userId);
    if (!parent) return [];
    const links = await studentParentService.childrenOf(ctx, parent.id);
    const children = await studentService.findManyByIds(
      ctx,
      links.map(link => link.studentId)
    );
    return children.map(child => child.userId);
  },

  /* Self-service acting for someone: yourself, or (a parent) one of your children.
     Anyone else is "not found", so a guess reveals nothing. */
  assertVisible: async (ctx, userId) => {
    if (!(await borrowers.visibleTo(ctx)).includes(userId)) throw notFound("Borrower");
  }
};
