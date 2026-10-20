import { createRouter } from "../../common/http/router.js";
import { activityRoutes } from "../../common/audit/activity.routes.js";
import { academicYearRoutes } from "./academic-years/index.js";
import { classRoutes } from "./classes/index.js";
import { subjectRoutes } from "./subjects/index.js";
import { sectionRoutes } from "./sections/index.js";
import { sectionSubjectRoutes } from "./section-subjects/index.js";
import { classSubjectRoutes } from "./class-subjects/index.js";
import { subjectCodeRoutes } from "./subject-codes/index.js";
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
import { assessmentRoutes } from "./assessments/index.js";
import { schedulingRoutes } from "./scheduling/index.js";
import { examEligibilityExamRoutes, examEligibilityRoutes } from "./exam-eligibility/index.js";
import { admitCardExamRoutes } from "./admit-cards/index.js";
import { substitutionRoutes } from "./substitutions/index.js";
import { nepPolicyRoutes } from "./nep-policy/index.js";
import { holisticProgressRoutes } from "./holistic-progress/index.js";
import { certificateFormatRoutes, certificateRoutes } from "./certificates/index.js";
import { behaviourRemarkRoutes } from "./behaviour-remarks/index.js";
import { studentLeaveRoutes } from "./student-leaves/index.js";

/* Academics module, mounted at /api/v1/academics */
const router = createRouter();

/* The module's activity log (first: no other path may capture it) */
router.use("/activity", activityRoutes("academics"));

router.use("/academic-years", academicYearRoutes);
router.use("/classes", classRoutes);
router.use("/subjects", subjectRoutes);
router.use("/sections", sectionRoutes);
router.use("/section-subjects", sectionSubjectRoutes);
router.use("/class-subjects", classSubjectRoutes);
router.use("/subject-codes", subjectCodeRoutes);
router.use("/teacher-assignments", teacherAssignmentRoutes);
router.use("/enrollments", enrollmentRoutes);
router.use("/exams", examRoutes);
/* /exams/:examId/result-publication… (report-cards owns publication and its snapshots) */
router.use("/exams", examPublicationRoutes);
/* /exams/:examId/eligibility… and /exams/:examId/admit-cards… */
router.use("/exams", examEligibilityExamRoutes);
router.use("/exams", admitCardExamRoutes);
router.use("/exam-eligibility", examEligibilityRoutes);
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
router.use("/assessments", assessmentRoutes);
router.use("/scheduling", schedulingRoutes);
router.use("/substitutions", substitutionRoutes);
router.use("/nep-policy", nepPolicyRoutes);
router.use("/holistic-progress", holisticProgressRoutes);
router.use("/certificates", certificateRoutes);
router.use("/certificate-formats", certificateFormatRoutes);
router.use("/behaviour-remarks", behaviourRemarkRoutes);
router.use("/student-leaves", studentLeaveRoutes);

export default router;
