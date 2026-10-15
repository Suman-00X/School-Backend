import AcademicYear from "../models/academic-db/AcademicYear.js";
import Class from "../models/academic-db/Class.js";
import Section from "../models/academic-db/Section.js";
import Subject from "../models/academic-db/Subject.js";
import ClassSectionSubjectMap from "../models/academic-db/ClassSectionSubjectMap.js";
import StudentSectionMap from "../models/academic-db/StudentSectionMap.js";
import TeacherSectionSubjectMap from "../models/academic-db/TeacherSectionSubjectMap.js";
import Exam from "../models/academic-db/exam-db/Exam.js";
import ExamSectionSubjectMap from "../models/academic-db/exam-db/ExamSectionSubjectMap.js";
import Marks from "../models/academic-db/exam-db/Marks.js";
import { getPagination } from "../utils/pagination.util.js";

/* ================= Academic Years ================= */

export const createAcademicYear = async (tenantId, payload) => {
  return AcademicYear.create({ ...payload, tenantId });
};

export const getAcademicYears = async (tenantId, query = {}) => {
  const { skip, limit } = getPagination(query);
  return AcademicYear.find({ tenantId, isActive: true })
    .sort({ startDate: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

export const getAcademicYearById = async (tenantId, academicYearId) => {
  return AcademicYear.findOne({ _id: academicYearId, tenantId, isActive: true }).lean();
};

export const updateAcademicYear = async (tenantId, academicYearId, payload) => {
  return AcademicYear.findOneAndUpdate(
    { _id: academicYearId, tenantId, isActive: true },
    payload,
    { new: true }
  ).lean();
};

/* ================= Classes ================= */

export const createClass = async (tenantId, payload) => {
  return Class.create({ ...payload, tenantId });
};

export const getClasses = async (tenantId, query = {}) => {
  const { skip, limit } = getPagination(query);
  return Class.find({ tenantId, isActive: true })
    .sort({ classOrder: 1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

export const getClassById = async (tenantId, classId) => {
  return Class.findOne({ _id: classId, tenantId, isActive: true }).lean();
};

export const updateClass = async (tenantId, classId, payload) => {
  return Class.findOneAndUpdate(
    { _id: classId, tenantId, isActive: true },
    payload,
    { new: true }
  ).lean();
};

/* ================= Sections ================= */

export const createSection = async (tenantId, payload) => {
  return Section.create({ ...payload, tenantId });
};

export const getSections = async (tenantId, query = {}) => {
  const { skip, limit } = getPagination(query);
  return Section.find({ tenantId, isActive: true })
    .populate("classId", "className classOrder")
    .populate("classTeacherId", "employeeCode")
    .skip(skip)
    .limit(limit)
    .lean();
};

export const getSectionById = async (tenantId, sectionId) => {
  return Section.findOne({ _id: sectionId, tenantId, isActive: true })
    .populate("classId", "className classOrder")
    .populate("classTeacherId", "employeeCode")
    .lean();
};

export const getSectionsByClass = async (tenantId, academicYearId, classId) => {
  return Section.find({
    tenantId,
    academicYearId,
    classId,
    isActive: true
  }).lean();
};

export const updateSection = async (tenantId, sectionId, payload) => {
  return Section.findOneAndUpdate(
    { _id: sectionId, tenantId, isActive: true },
    payload,
    { new: true }
  ).lean();
};

export const validateSectionBelongsToYear = async (tenantId, academicYearId, sectionId) => {
  return Section.exists({
    _id: sectionId,
    tenantId,
    academicYearId,
    isActive: true
  });
};


/* ================= Subjects ================= */

export const createSubject = async (tenantId, payload) => {
  return Subject.create({ ...payload, tenantId });
};

export const getSubjects = async (tenantId, query = {}) => {
  const { skip, limit } = getPagination(query);
  return Subject.find({ tenantId, isActive: true })
    .skip(skip)
    .limit(limit)
    .lean();
};

export const getSubjectById = async (tenantId, subjectId) => {
  return Subject.findOne({ _id: subjectId, tenantId, isActive: true }).lean();
};

export const updateSubject = async (tenantId, subjectId, payload) => {
  return Subject.findOneAndUpdate(
    { _id: subjectId, tenantId, isActive: true },
    payload,
    { new: true }
  ).lean();
};


/* ================= Class–Section–Subject ================= */

export const createClassSectionSubjectMap = async (tenantId, payload) => {
  return ClassSectionSubjectMap.create({ ...payload, tenantId });
};

export const getSubjectsBySection = async (tenantId, academicYearId, sectionId) => {
  return ClassSectionSubjectMap.find({
    tenantId,
    academicYearId,
    sectionId,
    isActive: true
  })
    .populate("subjectId", "subjectName subjectCode")
    .lean();
};


export const removeClassSectionSubjectMap = async (tenantId, mapId) => {
  return ClassSectionSubjectMap.findOneAndUpdate(
    { _id: mapId, tenantId, isActive: true },
    { isActive: false },
    { new: true }
  ).lean();
};

/* ================= Student–Section ================= */

export const mapStudentToSection = async (tenantId, payload, session = null) => {
  const [doc] = await StudentSectionMap.create(
    [{ ...payload, tenantId, isActive: true }],
    session ? { session } : undefined
  );
  return doc;
};

export const getStudentsBySection = async (tenantId, academicYearId, sectionId) => {
  return StudentSectionMap.find({
    tenantId,
    academicYearId,
    sectionId,
    isActive: true
  })
    .populate({
      path: "studentId",
      populate: { path: "userId", select: "firstName lastName" }
    })
    .lean();
};

export const updateStudentSectionMap = async (tenantId, mapId, payload) => {
  return StudentSectionMap.findOneAndUpdate(
    { _id: mapId, tenantId, isActive: true },
    payload,
    { new: true }
  ).lean();
};

export const getStudentAdmission = async (tenantId, studentId, academicYearId) => {
  return StudentSectionMap.findOne({
    tenantId,
    studentId,
    academicYearId,
    isActive: true,
    status: "ACTIVE"
  });
};

export const closePreviousAdmission = async (tenantId, mapId, session) => {
  return StudentSectionMap.findOneAndUpdate(
    { _id: mapId, tenantId },
    { status: "LEFT" },
    { session }
  );
};

export const generateNextRollNumber = async (tenantId, academicYearId, sectionId, session) => {
  const last = await StudentSectionMap.findOne({
    tenantId,
    academicYearId,
    sectionId
  })
    .sort({ createdAt: -1 })
    .session(session);

  return last ? String(Number(last.rollNumber) + 1).padStart(2, "0") : "01";
};

/* ================= Teacher–Section–Subject ================= */

export const mapTeacherSectionSubject = async (tenantId, payload) => {
  return TeacherSectionSubjectMap.create({ ...payload, tenantId });
};

export const getTeachersBySection = async (tenantId, academicYearId, sectionId) => {
  return TeacherSectionSubjectMap.find({
    tenantId,
    academicYearId,
    sectionId,
    isActive: true
  })
    .populate({
      path: "teacherId",
      populate: { path: "userId", select: "firstName lastName" }
    })
    .populate("subjectId", "subjectName subjectCode")
    .lean();
};

export const removeTeacherSectionSubjectMap = async (tenantId, mapId) => {
  return TeacherSectionSubjectMap.findOneAndUpdate(
    { _id: mapId, tenantId, isActive: true },
    { isActive: false },
    { new: true }
  ).lean();
};

/* ================= Exams ================= */

export const createExam = async (tenantId, payload) => {
  return Exam.create({ ...payload, tenantId });
};

export const getExams = async (tenantId, academicYearId, query = {}) => {
  const { skip, limit } = getPagination(query);

  return Exam.find({
    tenantId,
    academicYearId,
    isActive: true
  })
    .skip(skip)
    .limit(limit)
    .lean();
};

export const getExamById = async (tenantId, examId) => {
  return Exam.findOne({ _id: examId, tenantId, isActive: true }).lean();
};

export const updateExam = async (tenantId, examId, payload) => {
  return Exam.findOneAndUpdate(
    { _id: examId, tenantId, isActive: true },
    payload,
    { new: true }
  ).lean();
};

/* ================= Exam Structure ================= */

export const createExamSectionSubjectMap = async (tenantId, payload) => {
  return ExamSectionSubjectMap.create({ ...payload, tenantId });
};

export const getExamStructure = async (tenantId, academicYearId, examId) => {
  return ExamSectionSubjectMap.find({
    tenantId,
    examId,
    isActive: true
  })
    .populate("sectionId", "sectionName")
    .populate("subjectId", "subjectName subjectCode")
    .lean();
};

/* ================= Marks ================= */

export const upsertMarks = async (tenantId, payload) => {
  const { studentId, examSectionSubjectId } = payload;

  return Marks.findOneAndUpdate(
    { tenantId, studentId, examSectionSubjectId },
    { $set: { ...payload, tenantId, isActive: true } },
    { upsert: true, new: true }
  ).lean();
};

export const getMarksByStudent = async (tenantId, academicYearId, studentId) => {
  return Marks.find({
    tenantId,
    studentId,
    isActive: true
  })
    .populate({
      path: "examSectionSubjectId",
      match: { academicYearId },
      populate: [
        { path: "subjectId", select: "subjectName subjectCode" },
        { path: "examId", select: "examName academicYearId" }
      ]
    })
    .lean();
};

/* ================= Bulk ================= */

export const createClassesBulk = async (tenantId, classes = []) => {
  return Class.insertMany(
    classes.map(c => ({ ...c, tenantId })),
    { ordered: false }
  );
};

export const createSubjectsBulk = async (tenantId, subjects = []) => {
  return Subject.insertMany(
    subjects.map(s => ({ ...s, tenantId })),
    { ordered: false }
  );
};

export const createSectionsBulk = async (tenantId, sections = []) => {
  return Section.insertMany(
    sections.map(s => ({ ...s, tenantId })),
    { ordered: false }
  );
};

export const createExamsBulk = async (tenantId, exams = []) => {
  return Exam.insertMany(
    exams.map(e => ({ ...e, tenantId })),
    { ordered: false }
  );
};

export const upsertMarksBulk = async (tenantId, marks, session) => {
  const ops = marks.map(m => ({
    updateOne: {
      filter: {
        tenantId,
        studentId: m.studentId,
        examSectionSubjectId: m.examSectionSubjectId
      },
      update: { $set: { ...m, tenantId, isActive: true } },
      upsert: true
    }
  }));

  return Marks.bulkWrite(ops, { session });
};