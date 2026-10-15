import { notFound } from "../../../../common/http/errors.js";
import { enrollmentService } from "../../../academics/enrollments/index.js";
import { sectionService } from "../../../academics/sections/index.js";
import { accountService } from "../../../users/accounts/index.js";
import { parentService } from "../../../users/parents/index.js";
import { studentParentService, studentService } from "../../../users/students/index.js";
import { assignmentService } from "../../assignments/index.js";
import { routeService } from "../../routes/index.js";
import { classSection, fullName, hhmm, routeLabel } from "../../shared/utils/format.util.js";

const byId = rows => new Map(rows.map(row => [row.id, row]));

/* studentId -> { name, phone } of the primary contact (or the first linked parent) */
const primaryContacts = async (ctx, studentIds) => {
  const links = await studentParentService.linksForStudents(ctx, studentIds);
  const chosen = new Map();
  for (const link of links) {
    if (!chosen.has(link.studentId) || (link.isPrimaryContact && !chosen.get(link.studentId).isPrimaryContact)) {
      chosen.set(link.studentId, link);
    }
  }
  const parents = byId(await parentService.findManyByIds(ctx, [...new Set([...chosen.values()].map(l => l.parentId))]));
  const accounts = byId(
    await accountService.findManyByIds(ctx, [...new Set([...parents.values()].map(p => p.userId))])
  );
  return new Map(
    [...chosen].map(([studentId, link]) => {
      const account = accounts.get(parents.get(link.parentId)?.userId);
      return [studentId, { name: fullName(account), phone: account?.phone ?? null, relation: link.relation }];
    })
  );
};

const CSV_COLUMNS = [
  { key: "stopSequence", header: "Stop #", width: 8 },
  { key: "stopName", header: "Stop", width: 24 },
  { key: "pickupTime", header: "Pickup", width: 10 },
  { key: "dropTime", header: "Drop", width: 10 },
  { key: "studentName", header: "Student", width: 24 },
  { key: "classSection", header: "Class-Section", width: 14 },
  { key: "rollNumber", header: "Roll No", width: 10 },
  { key: "direction", header: "Direction", width: 12 },
  { key: "parentName", header: "Parent", width: 24 },
  { key: "parentPhone", header: "Parent Phone", width: 16 }
];

export const rosterService = {
  /* Stops in order, each with its students in the request's academic year */
  forRoute: async (ctx, routeId) => {
    const route = await routeService.findWithStops(ctx, routeId);
    if (!route) throw notFound("Route");
    const year = ctx.academicYear;

    const assignments = await assignmentService.activeForRoute(ctx, routeId, year.id);
    const studentIds = [...new Set(assignments.map(a => a.studentId))];
    const [students, enrollments, sections, contacts] = await Promise.all([
      studentService.findManyByIds(ctx, studentIds),
      Promise.all(studentIds.map(id => enrollmentService.findForStudent(ctx, id, year.id))),
      sectionService.findAllInYear(ctx, year.id),
      primaryContacts(ctx, studentIds)
    ]);
    const studentById = byId(students);
    const sectionById = byId(sections);
    const enrollmentOf = new Map(enrollments.filter(Boolean).map(e => [e.studentId, e]));

    const riders = assignments.map(assignment => {
      const student = studentById.get(assignment.studentId);
      const enrollment = enrollmentOf.get(assignment.studentId);
      const contact = contacts.get(assignment.studentId);
      return {
        assignmentId: assignment.id,
        stopId: assignment.stopId,
        studentId: assignment.studentId,
        studentCode: student?.studentCode ?? null,
        name: fullName(student?.user),
        classSection: classSection(sectionById.get(enrollment?.sectionId)),
        rollNumber: enrollment?.rollNumber ?? null,
        direction: assignment.direction,
        parentName: contact?.name || null,
        parentPhone: contact?.phone ?? null
      };
    });
    riders.sort((a, b) => a.name.localeCompare(b.name));

    const capacity = route.vehicle?.capacity ?? null;
    return {
      route: { id: route.id, name: route.name, code: route.code, description: route.description },
      vehicle: route.vehicle,
      academicYear: { id: year.id, yearName: year.yearName },
      occupancy: {
        capacity,
        assigned: riders.length,
        available: capacity === null ? null : Math.max(capacity - riders.length, 0)
      },
      stops: route.stops.map(stop => ({
        id: stop.id,
        sequence: stop.sequence,
        name: stop.name,
        landmark: stop.landmark,
        pickupTime: stop.pickupTime,
        dropTime: stop.dropTime,
        students: riders.filter(rider => rider.stopId === stop.id).map(({ stopId: _stopId, ...rider }) => rider)
      }))
    };
  },

  /* The roster as a table for sendTable(): one row per student, in stop order */
  table: async (ctx, routeId) => {
    const roster = await rosterService.forRoute(ctx, routeId);
    const rows = roster.stops.flatMap(stop =>
      stop.students.map(student => ({
        stopSequence: stop.sequence,
        stopName: stop.name,
        pickupTime: hhmm(stop.pickupTime),
        dropTime: hhmm(stop.dropTime),
        studentName: student.name,
        classSection: student.classSection,
        rollNumber: student.rollNumber,
        direction: student.direction,
        parentName: student.parentName,
        parentPhone: student.parentPhone
      }))
    );
    const vehicle = roster.vehicle;
    const crew = vehicle
      ? ` - ${vehicle.registrationNumber}${vehicle.driverName ? `, driver ${vehicle.driverName}` : ""}${vehicle.driverPhone ? ` (${vehicle.driverPhone})` : ""}`
      : "";
    return {
      rows,
      columns: CSV_COLUMNS,
      fileName: `route-${roster.route.code}-roster`,
      title: `${routeLabel(roster.route)} (${roster.route.name}) ${roster.academicYear.yearName}${crew}`
    };
  }
};
