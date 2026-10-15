import { Router } from "express";
import { authMiddleware } from "./common/middlewares/auth.middleware.js";

import userRoutes from "./modules/users/user.routes.js";
import teacherRoutes from "./modules/teachers/teacher.routes.js";
import parentRoutes from "./modules/parents/parent.routes.js";
import studentRoutes from "./modules/students/student.routes.js";
import studentParentRoutes from "./modules/students/studentParent.routes.js";

import academicYearRoutes from "./modules/academic-years/academicYear.routes.js";
import classRoutes from "./modules/classes/class.routes.js";
import subjectRoutes from "./modules/subjects/subject.routes.js";
import sectionRoutes from "./modules/sections/section.routes.js";
import sectionSubjectRoutes from "./modules/section-subjects/sectionSubject.routes.js";
import teacherAssignmentRoutes from "./modules/teacher-assignments/teacherAssignment.routes.js";
import enrollmentRoutes from "./modules/enrollments/enrollment.routes.js";
import examRoutes from "./modules/exams/exam.routes.js";
import examSubjectRoutes from "./modules/exams/examSubject.routes.js";
import marksRoutes from "./modules/marks/marks.routes.js";

/* Everything under /api requires a valid token */
const router = Router();

router.use(authMiddleware);

/* People */
router.use("/users", userRoutes);
router.use("/teachers", teacherRoutes);
router.use("/parents", parentRoutes);
router.use("/students", studentRoutes);
router.use("/student-parent-map", studentParentRoutes);

/* Academics */
router.use("/academic/academic-years", academicYearRoutes);
router.use("/academic/classes", classRoutes);
router.use("/academic/subjects", subjectRoutes);
router.use("/academic/sections", sectionRoutes);
router.use("/academic/class-section-subject-map", sectionSubjectRoutes);
router.use("/academic/teacher-section-subject-map", teacherAssignmentRoutes);
router.use("/academic/student-section-map", enrollmentRoutes);

/* Exams */
router.use("/academic/exams", examRoutes);
router.use("/academic/exam-section-subject-map", examSubjectRoutes);
router.use("/academic/marks", marksRoutes);

export default router;
