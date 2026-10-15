import * as academicQueries from "../queries/academic.queries.js";
import { successResponse } from "../responses/success.response.js";
import { errorResponse } from "../responses/error.response.js";

/* Academic Years */
export const createAcademicYear = async (req, res, next) => {
  try {
    const data = await academicQueries.createAcademicYear(
      req.user.tenantId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Academic year created");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getAcademicYears = async (req, res, next) => {
  try {
    const data = await academicQueries.getAcademicYears(
      req.user.tenantId,
      req.query
    );
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getAcademicYearById = async (req, res, next) => {
  try {
    const data = await academicQueries.getAcademicYearById(
      req.user.tenantId,
      req.params.academicYearId
    );
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const updateAcademicYear = async (req, res, next) => {
  try {
    const data = await academicQueries.updateAcademicYear(
      req.user.tenantId,
      req.params.academicYearId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Academic year updated");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

/* Classes */
export const createClass = async (req, res, next) => {
  try {
    const data = await academicQueries.createClass(
      req.user.tenantId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Class created");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getClasses = async (req, res, next) => {
  try {
    const data = await academicQueries.getClasses(
      req.user.tenantId,
      req.query
    );
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getClassById = async (req, res, next) => {
  try {
    const data = await academicQueries.getClassById(
      req.user.tenantId,
      req.params.classId
    );
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const updateClass = async (req, res, next) => {
  try {
    const data = await academicQueries.updateClass(
      req.user.tenantId,
      req.params.classId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Class updated");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

/* Sections */
export const createSection = async (req, res, next) => {
  try {
    const data = await academicQueries.createSection(
      req.user.tenantId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Section created");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getSections = async (req, res, next) => {
  try {
    const data = await academicQueries.getSections(
      req.user.tenantId,
      req.query
    );
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getSectionById = async (req, res, next) => {
  try {
    const data = await academicQueries.getSectionById(
      req.user.tenantId,
      req.params.sectionId
    );
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getSectionsByClass = async (req, res, next) => {
  try {
    const data = await academicQueries.getSectionsByClass(
      req.user.tenantId,
      req.params.classId
    );
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const updateSection = async (req, res, next) => {
  try {
    const data = await academicQueries.updateSection(
      req.user.tenantId,
      req.params.sectionId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Section updated");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

/* Subjects */
export const createSubject = async (req, res, next) => {
  try {
    const data = await academicQueries.createSubject(
      req.user.tenantId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Subject created");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getSubjects = async (req, res, next) => {
  try {
    const data = await academicQueries.getSubjects(
      req.user.tenantId,
      req.query
    );
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getSubjectById = async (req, res, next) => {
  try {
    const data = await academicQueries.getSubjectById(
      req.user.tenantId,
      req.params.subjectId
    );
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const updateSubject = async (req, res, next) => {
  try {
    const data = await academicQueries.updateSubject(
      req.user.tenantId,
      req.params.subjectId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Subject updated");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

/* Class Section Subject Map */
export const createClassSectionSubjectMap = async (req, res, next) => {
  try {
    const data = await academicQueries.createClassSectionSubjectMap(
      req.user.tenantId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Mapping created");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getSubjectsBySection = async (req, res, next) => {
  try {
    const data = await academicQueries.getSubjectsBySection(
      req.user.tenantId,
      req.params.sectionId
    );
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const removeClassSectionSubjectMap = async (req, res, next) => {
  try {
    await academicQueries.removeClassSectionSubjectMap(
      req.user.tenantId,
      req.params.mapId
    );
    res.locals.entityId = req.params.mapId;
    return successResponse(res, null, "Mapping removed");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

/* Student Section Map */
export const mapStudentToSection = async (req, res, next) => {
  try {
    const data = await academicQueries.mapStudentToSection(
      req.user.tenantId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Student mapped to section");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getStudentsBySection = async (req, res, next) => {
  try {
    const data = await academicQueries.getStudentsBySection(
      req.user.tenantId,
      req.params.sectionId
    );
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const updateStudentSectionMap = async (req, res, next) => {
  try {
    const data = await academicQueries.updateStudentSectionMap(
      req.user.tenantId,
      req.params.mapId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Student section updated");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

/* Teacher Section Subject Map */
export const mapTeacherSectionSubject = async (req, res, next) => {
  try {
    const data = await academicQueries.mapTeacherSectionSubject(
      req.user.tenantId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Teacher mapped");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getTeachersBySection = async (req, res, next) => {
  try {
    const data = await academicQueries.getTeachersBySection(
      req.user.tenantId,
      req.params.sectionId
    );
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const removeTeacherSectionSubjectMap = async (req, res, next) => {
  try {
    await academicQueries.removeTeacherSectionSubjectMap(
      req.user.tenantId,
      req.params.mapId
    );
    res.locals.entityId = req.params.mapId;
    return successResponse(res, null, "Mapping removed");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

/* Exams */
export const createExam = async (req, res, next) => {
  try {
    const data = await academicQueries.createExam(
      req.user.tenantId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Exam created");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getExams = async (req, res, next) => {
  try {
    const data = await academicQueries.getExams(
      req.user.tenantId,
      req.query
    );
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getExamById = async (req, res, next) => {
  try {
    const data = await academicQueries.getExamById(
      req.user.tenantId,
      req.params.examId
    );
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const updateExam = async (req, res, next) => {
  try {
    const data = await academicQueries.updateExam(
      req.user.tenantId,
      req.params.examId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Exam updated");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

/* Exam Section Subject Map */
export const createExamSectionSubjectMap = async (req, res, next) => {
  try {
    const data = await academicQueries.createExamSectionSubjectMap(
      req.user.tenantId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Exam structure created");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getExamStructure = async (req, res, next) => {
  try {
    const data = await academicQueries.getExamStructure(
      req.user.tenantId,
      req.params.examId
    );
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

/* Marks */
export const upsertMarks = async (req, res, next) => {
  try {
    const data = await academicQueries.upsertMarks(
      req.user.tenantId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Marks saved");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getMarksByStudent = async (req, res, next) => {
  try {
    const data = await academicQueries.getMarksByStudent(
      req.user.tenantId,
      req.params.studentId
    );
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};


/* Bulk masters */
export const createClassesBulk = async (req, res, next) => {
  try {
    const data = await academicQueries.createClassesBulk(
      req.user.tenantId,
      req.body.classes
    );
    return successResponse(res, data, "Classes created");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const createSubjectsBulk = async (req, res, next) => {
  try {
    const data = await academicQueries.createSubjectsBulk(
      req.user.tenantId,
      req.body.subjects
    );
    return successResponse(res, data, "Subjects created");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const createSectionsBulk = async (req, res, next) => {
  try {
    const data = await academicQueries.createSectionsBulk(
      req.user.tenantId,
      req.body.sections
    );
    return successResponse(res, data, "Sections created");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const createExamsBulk = async (req, res, next) => {
  try {
    const data = await academicQueries.createExamsBulk(
      req.user.tenantId,
      req.body.exams
    );
    return successResponse(res, data, "Exams created");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

/* Bulk marks */
export const upsertMarksBulk = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const data = await academicQueries.upsertMarksBulk(
      req.user.tenantId,
      req.body.marks,
      session
    );

    await session.commitTransaction();
    session.endSession();

    return successResponse(res, data, "Marks uploaded");
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return errorResponse(res, error, next);
  }
};