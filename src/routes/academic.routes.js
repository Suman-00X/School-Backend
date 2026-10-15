import express from "express";
import { permissionMiddleware } from "../middlewares/permission.middleware.js";
import { auditMiddleware } from "../middlewares/audit.middleware.js";
import { academicYearMiddleware as year } from "../middlewares/academicYear.middleware.js";

import * as academicYearController from "../controllers/academic/academicYear.controller.js";
import * as classController from "../controllers/academic/class.controller.js";
import * as sectionController from "../controllers/academic/section.controller.js";
import * as subjectController from "../controllers/academic/subject.controller.js";
import * as studentAllocationController from "../controllers/academic/studentAllocation.controller.js";
import * as teachingAllocation from "../controllers/academic/teachingAllocation.controller.js";
import * as examController from "../controllers/academic/exam.controller.js";
import * as marksController from "../controllers/academic/marks.controller.js";
import * as bulkAcademicController from "../controllers/academic/bulkAcademic.controller.js";
import * as studentAdmissionController from "../controllers/student/studentAdmission.controller.js";

/* Routes marked `year` act on the current academic year,
   or on the one named in the X-Academic-Year-Id header */
const router = express.Router();

/* Academic Years */
router.post("/academic-years", permissionMiddleware("ACADEMIC_YEAR", "CREATE"), auditMiddleware("ACADEMIC_YEAR", "CREATE"), academicYearController.createAcademicYear);
router.get("/academic-years", permissionMiddleware("ACADEMIC_YEAR", "READ"), academicYearController.getAcademicYears);
router.get("/academic-years/:academicYearId", permissionMiddleware("ACADEMIC_YEAR", "READ"), academicYearController.getAcademicYearById);
router.put("/academic-years/:academicYearId", permissionMiddleware("ACADEMIC_YEAR", "UPDATE"), auditMiddleware("ACADEMIC_YEAR", "UPDATE"), academicYearController.updateAcademicYear);

/* Classes (shared across years) */
router.post("/classes/bulk", permissionMiddleware("CLASS", "BULK"), auditMiddleware("CLASS", "BULK"), bulkAcademicController.createClassesBulk);
router.post("/classes", permissionMiddleware("CLASS", "CREATE"), auditMiddleware("CLASS", "CREATE"), classController.createClass);
router.get("/classes", permissionMiddleware("CLASS", "READ"), classController.getClasses);
router.get("/classes/:classId", permissionMiddleware("CLASS", "READ"), classController.getClassById);
router.put("/classes/:classId", permissionMiddleware("CLASS", "UPDATE"), auditMiddleware("CLASS", "UPDATE"), classController.updateClass);

/* Subjects (shared across years) */
router.post("/subjects/bulk", permissionMiddleware("SUBJECT", "BULK"), auditMiddleware("SUBJECT", "BULK"), bulkAcademicController.createSubjectsBulk);
router.post("/subjects", permissionMiddleware("SUBJECT", "CREATE"), auditMiddleware("SUBJECT", "CREATE"), subjectController.createSubject);
router.get("/subjects", permissionMiddleware("SUBJECT", "READ"), subjectController.getSubjects);
router.get("/subjects/:subjectId", permissionMiddleware("SUBJECT", "READ"), subjectController.getSubjectById);
router.put("/subjects/:subjectId", permissionMiddleware("SUBJECT", "UPDATE"), auditMiddleware("SUBJECT", "UPDATE"), subjectController.updateSubject);

/* Sections */
router.post("/sections/bulk", permissionMiddleware("SECTION", "BULK"), year, auditMiddleware("SECTION", "BULK"), bulkAcademicController.createSectionsBulk);
router.post("/sections", permissionMiddleware("SECTION", "CREATE"), year, auditMiddleware("SECTION", "CREATE"), sectionController.createSection);
router.get("/sections", permissionMiddleware("SECTION", "READ"), year, sectionController.getSections);
router.get("/sections/class/:classId", permissionMiddleware("SECTION", "READ"), year, sectionController.getSectionsByClass);
router.get("/sections/:sectionId", permissionMiddleware("SECTION", "READ"), sectionController.getSectionById);
router.put("/sections/:sectionId", permissionMiddleware("SECTION", "UPDATE"), auditMiddleware("SECTION", "UPDATE"), sectionController.updateSection);

/* Class Section Subject Mapping */
router.post("/class-section-subject-map", permissionMiddleware("CLASS_SECTION_SUBJECT", "CREATE"), year, auditMiddleware("CLASS_SECTION_SUBJECT", "CREATE"), teachingAllocation.createClassSectionSubjectMap);
router.get("/class-section-subject-map/section/:sectionId", permissionMiddleware("CLASS_SECTION_SUBJECT", "READ"), year, teachingAllocation.getSubjectsBySection);
router.delete("/class-section-subject-map/:mapId", permissionMiddleware("CLASS_SECTION_SUBJECT", "DELETE"), auditMiddleware("CLASS_SECTION_SUBJECT", "DELETE"), teachingAllocation.removeClassSectionSubjectMap);

/* Student Section Mapping */
router.post("/student-section-map", permissionMiddleware("STUDENT_SECTION", "CREATE"), year, auditMiddleware("STUDENT_SECTION", "CREATE"), studentAllocationController.mapStudentToSection);
router.get("/student-section-map/section/:sectionId", permissionMiddleware("STUDENT_SECTION", "READ"), year, studentAllocationController.getStudentsBySection);
router.put("/student-section-map/:mapId", permissionMiddleware("STUDENT_SECTION", "UPDATE"), year, auditMiddleware("STUDENT_SECTION", "UPDATE"), studentAllocationController.updateStudentSectionMap);

/* Student Promotion (years come from the body) */
router.post("/students/promote", permissionMiddleware("STUDENT_SECTION", "CREATE"), auditMiddleware("STUDENT_PROMOTION", "CREATE"), studentAdmissionController.promoteStudent);

/* Teacher Section Subject Mapping */
router.post("/teacher-section-subject-map", permissionMiddleware("TEACHER_SECTION_SUBJECT", "CREATE"), year, auditMiddleware("TEACHER_SECTION_SUBJECT", "CREATE"), teachingAllocation.mapTeacherSectionSubject);
router.get("/teacher-section-subject-map/section/:sectionId", permissionMiddleware("TEACHER_SECTION_SUBJECT", "READ"), year, teachingAllocation.getTeachersBySection);
router.delete("/teacher-section-subject-map/:mapId", permissionMiddleware("TEACHER_SECTION_SUBJECT", "DELETE"), auditMiddleware("TEACHER_SECTION_SUBJECT", "DELETE"), teachingAllocation.removeTeacherSectionSubjectMap);

/* Exams */
router.post("/exams/bulk", permissionMiddleware("EXAM", "BULK"), year, auditMiddleware("EXAM", "BULK"), bulkAcademicController.createExamsBulk);
router.post("/exams", permissionMiddleware("EXAM", "CREATE"), year, auditMiddleware("EXAM", "CREATE"), examController.createExam);
router.get("/exams", permissionMiddleware("EXAM", "READ"), year, examController.getExams);
router.get("/exams/:examId", permissionMiddleware("EXAM", "READ"), examController.getExamById);
router.put("/exams/:examId", permissionMiddleware("EXAM", "UPDATE"), auditMiddleware("EXAM", "UPDATE"), examController.updateExam);

/* Exam Section Subject Mapping */
router.post("/exam-section-subject-map", permissionMiddleware("EXAM_SECTION_SUBJECT", "CREATE"), year, auditMiddleware("EXAM_SECTION_SUBJECT", "CREATE"), examController.createExamSectionSubjectMap);
router.get("/exam-section-subject-map/exam/:examId", permissionMiddleware("EXAM_SECTION_SUBJECT", "READ"), examController.getExamStructure);

/* Marks */
router.post("/marks/bulk", permissionMiddleware("MARKS", "BULK"), auditMiddleware("MARKS", "BULK"), marksController.upsertMarksBulk);
router.post("/marks", permissionMiddleware("MARKS", "CREATE"), auditMiddleware("MARKS", "CREATE"), marksController.upsertMarks);
router.get("/marks/student/:studentId", permissionMiddleware("MARKS", "READ"), year, marksController.getMarksByStudent);

export default router;
