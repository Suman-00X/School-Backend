import { ROLES } from "../../../../common/auth/roles.js";
import { parentService } from "../../../users/parents/index.js";
import { studentParentService, studentService } from "../../../users/students/index.js";
import { allocationService } from "../../allocations/index.js";
import { resourceAssignmentService } from "../../resource-assignments/index.js";
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

const toAllocation = allocation => ({
  id: allocation.id,
  phase: allocation.phase,
  fromDate: allocation.fromDate,
  toDate: allocation.toDate,
  bedNumber: allocation.bedNumber,
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
});

const toResource = assignment => ({
  id: assignment.id,
  phase: assignment.phase,
  fromDate: assignment.fromDate,
  toDate: assignment.toDate,
  withBed: Boolean(assignment.allocationId),
  resource: {
    id: assignment.resource.id,
    name: assignment.resource.name,
    resourceType: assignment.resource.resourceType,
    customType: assignment.resource.customType,
    monthlyFee: assignment.resource.monthlyFee
  }
});

export const myHostelService = {
  /* One entry per student the caller may see: today's bed (current, or null), beds booked
     ahead (upcoming), and current and upcoming resources (lockers, plans) */
  get: async ctx => {
    const studentIds = await ownStudentIds(ctx);
    const [students, allocations, resources] = await Promise.all([
      studentService.findManyByIds(ctx, studentIds),
      allocationService.notEndedForStudents(ctx, studentIds),
      resourceAssignmentService.notEndedForStudents(ctx, studentIds)
    ]);
    return students
      .sort((a, b) => fullName(a.user).localeCompare(fullName(b.user)))
      .map(student => {
        const own = allocations.filter(a => a.studentId === student.id);
        const current = own.find(a => a.phase === "CURRENT");
        return {
          student: { id: student.id, studentCode: student.studentCode, name: fullName(student.user) },
          current: current ? toAllocation(current) : null,
          upcoming: own.filter(a => a.phase === "UPCOMING").map(toAllocation),
          resources: resources.filter(r => r.studentId === student.id).map(toResource)
        };
      });
  }
};
