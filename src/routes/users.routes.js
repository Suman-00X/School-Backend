import express from "express";
import { permissionMiddleware } from "../middlewares/permission.middleware.js";
import { auditMiddleware } from "../middlewares/audit.middleware.js";

/* Base user */
import * as userController from "../controllers/user/user.controller.js";

/* Role-based users */
import * as teacherController from "../controllers/user/teacher.controller.js";
import * as parentController from "../controllers/user/parent.controller.js";

/* Student domain */
import * as studentProfileController from "../controllers/student/studentProfile.controller.js";
import * as studentAdmissionController from "../controllers/student/studentAdmission.controller.js";
import * as studentParentController from "../controllers/student/studentParent.controller.js";

const router = express.Router();

/* Users */
router.post("/users", permissionMiddleware("USER", "CREATE"), auditMiddleware("USER", "CREATE"), userController.createUser);
router.get("/users", permissionMiddleware("USER", "READ"), userController.getUsers);
router.get("/users/:userId", permissionMiddleware("USER", "READ"), userController.getUserById);
router.put("/users/:userId", permissionMiddleware("USER", "UPDATE"), auditMiddleware("USER", "UPDATE"), userController.updateUser);
router.delete("/users/:userId", permissionMiddleware("USER", "DELETE"), auditMiddleware("USER", "DELETE"), userController.deactivateUser);

/* Teachers */
router.post("/teachers", permissionMiddleware("TEACHER", "CREATE"), auditMiddleware("TEACHER", "CREATE"), teacherController.createTeacher);
router.get("/teachers", permissionMiddleware("TEACHER", "READ"), teacherController.getTeachers);
router.get("/teachers/:teacherId", permissionMiddleware("TEACHER", "READ"), teacherController.getTeacherById);
router.put("/teachers/:teacherId", permissionMiddleware("TEACHER", "UPDATE"), auditMiddleware("TEACHER", "UPDATE"), teacherController.updateTeacher);

/* Parents */
router.post("/parents", permissionMiddleware("PARENT", "CREATE"), auditMiddleware("PARENT", "CREATE"), parentController.createParent);
router.get("/parents", permissionMiddleware("PARENT", "READ"), parentController.getParents);
router.get("/parents/:parentId", permissionMiddleware("PARENT", "READ"), parentController.getParentById);
router.put("/parents/:parentId", permissionMiddleware("PARENT", "UPDATE"), auditMiddleware("PARENT", "UPDATE"), parentController.updateParent);

/* Student profile */
router.post("/students", permissionMiddleware("STUDENT", "CREATE"), auditMiddleware("STUDENT", "CREATE"), studentProfileController.createStudent);
router.get("/students", permissionMiddleware("STUDENT", "READ"), studentProfileController.getStudents);
router.get("/students/:studentId", permissionMiddleware("STUDENT", "READ"), studentProfileController.getStudentById);
router.put("/students/:studentId", permissionMiddleware("STUDENT", "UPDATE"), auditMiddleware("STUDENT", "UPDATE"), studentProfileController.updateStudent);

/* Student admission */
router.post("/students/bulk", permissionMiddleware("STUDENT", "CREATE"), auditMiddleware("STUDENT_ADMISSION", "CREATE"), studentAdmissionController.addStudent);

/* Student–Parent mapping */
router.post("/student-parent-map", permissionMiddleware("STUDENT_PARENT", "CREATE"), auditMiddleware("STUDENT_PARENT", "CREATE"), studentParentController.mapStudentParent);
router.get("/student-parent-map/student/:studentId", permissionMiddleware("STUDENT_PARENT", "READ"), studentParentController.getParentsByStudent);
router.delete("/student-parent-map/:mapId", permissionMiddleware("STUDENT_PARENT", "DELETE"), auditMiddleware("STUDENT_PARENT", "DELETE"), studentParentController.removeStudentParentMap);

export default router;