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
import { sanitizeUpdate } from "../utils/sanitize.util.js";

const UPDATE_OPTIONS = { returnDocument: "after", runValidators: true };

/* ================= Academic Years ================= */

/* Only one academic year per tenant can be current */
const setCurrentAcademicYear = async (tenantId, academicYearId) => {
  await AcademicYear.updateMany(
    { tenantId, isCurrent: true, _id: { $ne: academicYearId } },
    { isCurrent: false }
  );
  return AcademicYear.findOneAndUpdate(
    { _id: academicYearId, tenantId },
    { isCurrent: true },
    { returnDocument: "after" }
  ).lean();
};

export const createAcademicYear = async (tenantId, payload) => {
  const { isCurrent, ...rest } = payload;
  const academicYear = await AcademicYear.create({ ...rest, tenantId, isCurrent: false });
  return isCurrent ? setCurrentAcademicYear(tenantId, academicYear._id) : academicYear;
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
  const { isCurrent, ...rest } = sanitizeUpdate(payload);

  const academicYear = await AcademicYear.findOneAndUpdate(
    { _id: academicYearId, tenantId, isActive: true },
    isCurrent === false ? { ...rest, isCurrent: false } : rest,
    UPDATE_OPTIONS
  ).lean();

  if (academicYear && isCurrent === true) {
    return setCurrentAcademicYear(tenantId, academicYear._id);
  }
  return academicYear;
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
    sanitizeUpdate(payload),
    UPDATE_OPTIONS
  ).lean();
};

/* ================= Sections ================= */

export const createSection = async (tenantId, academicYearId, payload) => {
  return Section.create({ ...payload, tenantId, academicYearId });
};

export const getSections = async (tenantId, academicYearId, query = {}) => {
  const { skip, limit } = getPagination(query);
  return Section.find({ tenantId, academicYearId, isActive: true })
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
    sanitizeUpdate(payload, ["academicYearId"]),
    UPDATE_OPTIONS
  ).lean();
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
    sanitizeUpdate(payload),
    UPDATE_OPTIONS
  ).lean();
};

/* ================= Class–Section–Subject ================= */

export const createClassSectionSubjectMap = async (tenantId, academicYearId, payload) => {
  return ClassSectionSubjectMap.create({ ...payload, tenantId, academicYearId });
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
    { returnDocument: "after" }
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

export const updateStudentSectionMap = async (tenantId, academicYearId, mapId, payload) => {
  return StudentSectionMap.findOneAndUpdate(
    { _id: mapId, tenantId, academicYearId, isActive: true },
    payload,
    UPDATE_OPTIONS
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

/* ================= Teacher–Section–Subject ================= */

export const mapTeacherSectionSubject = async (tenantId, academicYearId, payload) => {
  return TeacherSectionSubjectMap.create({ ...payload, tenantId, academicYearId });
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
    { returnDocument: "after" }
  ).lean();
};

/* ================= Exams ================= */

export const createExam = async (tenantId, academicYearId, payload) => {
  return Exam.create({ ...payload, tenantId, academicYearId });
};

export const getExams = async (tenantId, academicYearId, query = {}) => {
  const { skip, limit } = getPagination(query);

  return Exam.find({
    tenantId,
    academicYearId,
    isActive: true
  })
    .sort({ startDate: 1 })
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
    sanitizeUpdate(payload, ["academicYearId"]),
    UPDATE_OPTIONS
  ).lean();
};

/* ================= Exam Structure ================= */

export const createExamSectionSubjectMap = async (tenantId, academicYearId, payload) => {
  return ExamSectionSubjectMap.create({ ...payload, tenantId, academicYearId });
};

export const getExamStructure = async (tenantId, examId) => {
  return ExamSectionSubjectMap.find({
    tenantId,
    examId,
    isActive: true
  })
    .populate("sectionId", "sectionName")
    .populate("subjectId", "subjectName subjectCode")
    .lean();
};

export const getExamStructureEntry = async (tenantId, examSectionSubjectId) => {
  return ExamSectionSubjectMap.findOne({
    _id: examSectionSubjectId,
    tenantId,
    isActive: true
  }).lean();
};

/* ================= Marks ================= */

export const upsertMarks = async (tenantId, entry) => {
  const { studentId, examSectionSubjectId } = entry;

  return Marks.findOneAndUpdate(
    { tenantId, studentId, examSectionSubjectId },
    { $set: { ...entry, tenantId, isActive: true } },
    { upsert: true, returnDocument: "after" }
  ).lean();
};

export const getMarksByStudent = async (tenantId, academicYearId, studentId) => {
  return Marks.find({
    tenantId,
    academicYearId,
    studentId,
    isActive: true
  })
    .populate({
      path: "examSectionSubjectId",
      select: "examId subjectId maxMarks passMarks displayCode",
      populate: [
        { path: "subjectId", select: "subjectName subjectCode" },
        { path: "examId", select: "examName examType" }
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

export const createSectionsBulk = async (tenantId, academicYearId, sections = []) => {
  return Section.insertMany(
    sections.map(s => ({ ...s, tenantId, academicYearId })),
    { ordered: false }
  );
};

export const createExamsBulk = async (tenantId, academicYearId, exams = []) => {
  return Exam.insertMany(
    exams.map(e => ({ ...e, tenantId, academicYearId })),
    { ordered: false }
  );
};

export const upsertMarksBulk = async (tenantId, entries, session) => {
  const ops = entries.map(m => ({
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
