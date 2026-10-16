import { createRouter } from "../../common/http/router.js";
import { academicYearRoutes } from "./academic-years/index.js";
import { classRoutes } from "./classes/index.js";
import { subjectRoutes } from "./subjects/index.js";
import { sectionRoutes } from "./sections/index.js";
import { sectionSubjectRoutes } from "./section-subjects/index.js";
import { teacherAssignmentRoutes } from "./teacher-assignments/index.js";
import { enrollmentRoutes } from "./enrollments/index.js";
import { examRoutes } from "./exams/index.js";
import { marksRoutes } from "./marks/index.js";
import { calendarRoutes } from "./calendar/index.js";
import { attendanceRoutes } from "./attendance/index.js";
import { periodRoutes, timetableRoutes } from "./timetable/index.js";
import { gradingRoutes } from "./grading/index.js";
import { resultPolicyAssignmentRoutes, resultPolicyRoutes } from "./result-policies/index.js";
import { examPublicationRoutes, reportCardRoutes } from "./report-cards/index.js";
import { assessmentSchemeRoutes } from "./assessment-schemes/index.js";
import { homeworkRoutes } from "./homework/index.js";

/* Academics module, mounted at /api/v1/academics */
const router = createRouter();

router.use("/academic-years", academicYearRoutes);
router.use("/classes", classRoutes);
router.use("/subjects", subjectRoutes);
router.use("/sections", sectionRoutes);
router.use("/section-subjects", sectionSubjectRoutes);
router.use("/teacher-assignments", teacherAssignmentRoutes);
router.use("/enrollments", enrollmentRoutes);
router.use("/exams", examRoutes);
/* /exams/:examId/result-publication… (report-cards owns publication and its snapshots) */
router.use("/exams", examPublicationRoutes);
router.use("/marks", marksRoutes);
router.use("/calendar", calendarRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/periods", periodRoutes);
router.use("/timetable", timetableRoutes);
router.use("/grade-scales", gradingRoutes);
router.use("/result-policies", resultPolicyRoutes);
router.use("/result-policy-assignments", resultPolicyAssignmentRoutes);
router.use("/report-cards", reportCardRoutes);
router.use("/assessment-schemes", assessmentSchemeRoutes);
router.use("/homework", homeworkRoutes);

export default router;
