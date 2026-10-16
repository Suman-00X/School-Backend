/* Every PostgreSQL table and relation, handed to the framework at startup
   (initPostgres) so `db.query.<table>` works. Add new module models here. */
export * from "./common/database/platform.schema.js";

/* users */
export * from "./modules/users/shared/models/employment.schema.js";
export * from "./modules/users/accounts/models/user.schema.js";
export * from "./modules/users/staff/models/staffMember.schema.js";
export * from "./modules/users/teachers/models/teacher.schema.js";
export * from "./modules/users/parents/models/parent.schema.js";
export * from "./modules/users/students/models/student.schema.js";
export * from "./modules/users/students/models/studentParent.schema.js";

/* academics */
export * from "./modules/academics/academic-years/models/academicYear.schema.js";
export * from "./modules/academics/classes/models/class.schema.js";
export * from "./modules/academics/subjects/models/subject.schema.js";
export * from "./modules/academics/sections/models/section.schema.js";
export * from "./modules/academics/section-subjects/models/sectionSubject.schema.js";
export * from "./modules/academics/teacher-assignments/models/teacherAssignment.schema.js";
export * from "./modules/academics/enrollments/models/enrollment.schema.js";
export * from "./modules/academics/grading/models/gradeScale.schema.js";
export * from "./modules/academics/exams/models/exam.schema.js";
export * from "./modules/academics/exams/models/examPaper.schema.js";
export * from "./modules/academics/marks/models/marks.schema.js";
export * from "./modules/academics/calendar/models/calendarEvent.schema.js";
export * from "./modules/academics/attendance/models/attendance.schema.js";
export * from "./modules/academics/timetable/models/period.schema.js";
export * from "./modules/academics/timetable/models/timetableSlot.schema.js";
export * from "./modules/academics/homework/models/homework.schema.js";

/* finance */
export * from "./modules/finance/fee-heads/models/feeHead.schema.js";
export * from "./modules/finance/fee-structures/models/feeStructure.schema.js";
export * from "./modules/finance/concessions/models/concession.schema.js";
export * from "./modules/finance/invoices/models/invoice.schema.js";
export * from "./modules/finance/payments/models/payment.schema.js";

/* hostel */
export * from "./modules/hostel/hostels/models/hostel.schema.js";
export * from "./modules/hostel/rooms/models/hostelRoom.schema.js";
export * from "./modules/hostel/allocations/models/hostelAllocation.schema.js";

/* library */
export * from "./modules/library/policy/models/libraryPolicy.schema.js";
export * from "./modules/library/books/models/book.schema.js";
export * from "./modules/library/copies/models/copy.schema.js";
export * from "./modules/library/loans/models/loan.schema.js";

/* hr */
export * from "./modules/hr/leaves/models/leave.schema.js";
export * from "./modules/hr/staff-attendance/models/staffAttendance.schema.js";
export * from "./modules/hr/payroll/models/payroll.schema.js";

/* transport */
export * from "./modules/transport/vehicles/models/vehicle.schema.js";
export * from "./modules/transport/routes/models/route.schema.js";
export * from "./modules/transport/assignments/models/assignment.schema.js";
