import { ROLES } from "../../../../common/auth/roles.js";
import { parentService } from "../../../users/parents/index.js";
import { studentParentService, studentService } from "../../../users/students/index.js";
import { allocationService } from "../../allocations/index.js";
import { fullName } from "../../shared/utils/hostel.util.js";

/* The signed-in student, or a parent's linked children */
const ownStudentIds = async ctx => {
  if (ctx.role === ROLES.STUDENT) {
    const student = await studentService.findByUserId(ctx, ctx.userId);
    return student ? [student.id] : [];
  }
  const parent = await parentService.findByUserId(ctx, ctx.userId);
  return parent ? (await studentParentService.childrenOf(ctx, parent.id)).map(link => link.studentId) : [];
};

const toEntry = (student, allocation) => ({
  student: {
    id: student.id,
    studentCode: student.studentCode,
    name: fullName(student.user)
  },
  allocation: allocation
    ? {
        id: allocation.id,
        academicYearId: allocation.academicYearId,
        bedNumber: allocation.bedNumber,
        allocatedOn: allocation.allocatedOn,
        hostel: {
          id: allocation.hostel.id,
          name: allocation.hostel.name,
          code: allocation.hostel.code,
          address: allocation.hostel.address,
          contactPhone: allocation.hostel.contactPhone
        },
        room: allocation.room,
        warden: allocation.hostel.warden
          ? { name: fullName(allocation.hostel.warden), phone: allocation.hostel.warden.phone }
          : null
      }
    : null
});

export const myHostelService = {
  /* One entry per student the caller may see; allocation is null when they have no bed */
  get: async ctx => {
    const studentIds = await ownStudentIds(ctx);
    const [students, allocations] = await Promise.all([
      studentService.findManyByIds(ctx, studentIds),
      allocationService.activeForStudents(ctx, studentIds)
    ]);
    return students
      .sort((a, b) => fullName(a.user).localeCompare(fullName(b.user)))
      .map(student =>
        toEntry(
          student,
          allocations.find(a => a.studentId === student.id)
        )
      );
  }
};
