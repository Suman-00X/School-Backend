import AuditLog from "../models/AuditLog.js";

const sanitizePayload = payload => {
  if (!payload) return null;

  const clone = JSON.parse(JSON.stringify(payload));

  delete clone.password;
  delete clone.passwordHash;
  delete clone.token;

  if (Array.isArray(clone.students) && clone.students.length > 20) {
    clone.students = `BULK_DATA_COUNT_${clone.students.length}`;
  }

  if (Array.isArray(clone.marks) && clone.marks.length > 50) {
    clone.marks = `BULK_DATA_COUNT_${clone.marks.length}`;
  }

  return clone;
};

export const logAudit = async ({
  tenantId,
  userId,
  role,
  action,
  entityType,
  entityId,
  method,
  path,
  payload,
  ipAddress
}) => {
  try {
    await AuditLog.create({
      tenantId,
      userId,
      role,
      action,
      entityType,
      entityId,
      method,
      path,
      payload: sanitizePayload(payload),
      ipAddress
    });
  } catch (error) {
    // audit logging should never break main flow
  }
};