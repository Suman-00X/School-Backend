import User from "../models/user-db/User.js";
import Teacher from "../models/user-db/Teacher.js";
import Student from "../models/user-db/Student.js";
import Parent from "../models/user-db/Parent.js";
import StudentParentMap from "../models/user-db/StudentParentMap.js";
import { getPagination } from "../utils/pagination.util.js";
import { sanitizeUpdate } from "../utils/sanitize.util.js";

const UPDATE_OPTIONS = { returnDocument: "after", runValidators: true };

/* ===================== USERS ===================== */

export const createUser = async (tenantId, payload, session = null) => {
  const [user] = await User.create(
    [{ ...payload, tenantId }],
    session ? { session } : undefined
  );
  return user;
};

export const getUsers = async (tenantId, query = {}) => {
  const { skip, limit } = getPagination(query);

  return User.find(
    { tenantId, isActive: true },
    { passwordHash: 0 }
  )
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

export const getUserById = async (tenantId, userId) => {
  return User.findOne(
    { _id: userId, tenantId, isActive: true },
    { passwordHash: 0 }
  ).lean();
};

export const updateUser = async (tenantId, userId, payload) => {
  return User.findOneAndUpdate(
    { _id: userId, tenantId, isActive: true },
    sanitizeUpdate(payload),
    { ...UPDATE_OPTIONS, projection: { passwordHash: 0 } }
  ).lean();
};

export const deactivateUser = async (tenantId, userId) => {
  return User.findOneAndUpdate(
    { _id: userId, tenantId, isActive: true },
    { isActive: false, status: "INACTIVE" },
    { returnDocument: "after", projection: { passwordHash: 0 } }
  ).lean();
};

/* ===================== TEACHERS ===================== */

export const createTeacher = async (tenantId, payload, session = null) => {
  const [teacher] = await Teacher.create(
    [{ ...payload, tenantId }],
    session ? { session } : undefined
  );
  return teacher;
};

export const getTeachers = async (tenantId, query = {}) => {
  const { skip, limit } = getPagination(query);

  return Teacher.find({ tenantId, isActive: true })
    .populate({
      path: "userId",
      select: "firstName lastName email phone"
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

export const getTeacherById = async (tenantId, teacherId) => {
  return Teacher.findOne({
    _id: teacherId,
    tenantId,
    isActive: true
  })
    .populate({
      path: "userId",
      select: "firstName lastName email phone"
    })
    .lean();
};

export const updateTeacher = async (tenantId, teacherId, payload) => {
  return Teacher.findOneAndUpdate(
    { _id: teacherId, tenantId, isActive: true },
    sanitizeUpdate(payload, ["userId"]),
    UPDATE_OPTIONS
  ).lean();
};

/* ===================== STUDENTS ===================== */

export const createStudent = async (tenantId, payload, session = null) => {
  const [student] = await Student.create(
    [{ ...payload, tenantId }],
    session ? { session } : undefined
  );
  return student;
};

export const getStudents = async (tenantId, query = {}) => {
  const { skip, limit } = getPagination(query);

  return Student.find({ tenantId, isActive: true })
    .populate({
      path: "userId",
      select: "firstName lastName email phone"
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

export const getStudentById = async (tenantId, studentId) => {
  return Student.findOne({
    _id: studentId,
    tenantId,
    isActive: true
  })
    .populate({
      path: "userId",
      select: "firstName lastName email phone"
    })
    .lean();
};

export const updateStudent = async (tenantId, studentId, payload) => {
  return Student.findOneAndUpdate(
    { _id: studentId, tenantId, isActive: true },
    sanitizeUpdate(payload, ["userId"]),
    UPDATE_OPTIONS
  ).lean();
};

/* ===================== PARENTS ===================== */

export const createParent = async (tenantId, payload, session = null) => {
  const [parent] = await Parent.create(
    [{ ...payload, tenantId }],
    session ? { session } : undefined
  );
  return parent;
};

export const getParents = async (tenantId, query = {}) => {
  const { skip, limit } = getPagination(query);

  return Parent.find({ tenantId, isActive: true })
    .populate({
      path: "userId",
      select: "firstName lastName email phone"
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

export const getParentById = async (tenantId, parentId) => {
  return Parent.findOne({
    _id: parentId,
    tenantId,
    isActive: true
  })
    .populate({
      path: "userId",
      select: "firstName lastName email phone"
    })
    .lean();
};

export const updateParent = async (tenantId, parentId, payload) => {
  return Parent.findOneAndUpdate(
    { _id: parentId, tenantId, isActive: true },
    sanitizeUpdate(payload, ["userId"]),
    UPDATE_OPTIONS
  ).lean();
};

/* ===================== STUDENT–PARENT MAP ===================== */

export const mapStudentParent = async (tenantId, payload, session = null) => {
  const [mapping] = await StudentParentMap.create(
    [{ ...payload, tenantId }],
    session ? { session } : undefined
  );
  return mapping;
};

export const getParentsByStudent = async (tenantId, studentId) => {
  return StudentParentMap.find({
    tenantId,
    studentId,
    isActive: true
  })
    .populate({
      path: "parentId",
      populate: {
        path: "userId",
        select: "firstName lastName email phone"
      }
    })
    .lean();
};

export const removeStudentParentMap = async (tenantId, mapId) => {
  return StudentParentMap.findOneAndUpdate(
    { _id: mapId, tenantId, isActive: true },
    { isActive: false },
    { returnDocument: "after" }
  ).lean();
};