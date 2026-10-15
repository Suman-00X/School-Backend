import { ROLES } from "../../../../common/auth/roles.js";
import { parentService } from "../../../users/parents/index.js";
import { studentParentService, studentService } from "../../../users/students/index.js";
import { assignmentService } from "../../assignments/index.js";

/* A student sees themselves; a parent sees the children linked to them */
const visibleStudents = async ctx => {
  if (ctx.role === ROLES.STUDENT) {
    const student = await studentService.findByUserId(ctx, ctx.userId);
    return student ? [student] : [];
  }
  const parent = await parentService.findByUserId(ctx, ctx.userId);
  if (!parent) return [];
  const links = await studentParentService.childrenOf(ctx, parent.id);
  return studentService.findManyByIds(
    ctx,
    links.map(link => link.studentId)
  );
};

/* What a family needs to know: where and when to board, and whom to call */
const transportView = assignment => {
  const { route, stop, direction } = assignment;
  const vehicle = route.vehicle;
  return {
    assignmentId: assignment.id,
    direction,
    startDate: assignment.startDate,
    endDate: assignment.endDate,
    route: { id: route.id, name: route.name, code: route.code },
    stop: {
      id: stop.id,
      name: stop.name,
      sequence: stop.sequence,
      landmark: stop.landmark,
      pickupTime: direction === "DROP_ONLY" ? null : stop.pickupTime,
      dropTime: direction === "PICKUP_ONLY" ? null : stop.dropTime,
      monthlyFee: stop.monthlyFee
    },
    vehicle: vehicle && {
      registrationNumber: vehicle.registrationNumber,
      make: vehicle.make,
      model: vehicle.model,
      status: vehicle.status
    },
    driver: vehicle && { name: vehicle.driverName, phone: vehicle.driverPhone },
    attendant: vehicle && { name: vehicle.attendantName, phone: vehicle.attendantPhone }
  };
};

export const myTransportService = {
  /* One entry per visible student; `transport` is null when they have no active assignment */
  forMe: async ctx => {
    const students = await visibleStudents(ctx);
    const assignments = await assignmentService.activeForStudents(
      ctx,
      students.map(student => student.id),
      ctx.academicYearId
    );
    const byStudent = new Map(assignments.map(assignment => [assignment.studentId, assignment]));
    return students
      .map(student => ({
        student: {
          id: student.id,
          studentCode: student.studentCode,
          firstName: student.user?.firstName ?? null,
          lastName: student.user?.lastName ?? null
        },
        transport: byStudent.has(student.id) ? transportView(byStudent.get(student.id)) : null
      }))
      .sort((a, b) =>
        `${a.student.firstName} ${a.student.lastName}`.localeCompare(`${b.student.firstName} ${b.student.lastName}`)
      );
  }
};
