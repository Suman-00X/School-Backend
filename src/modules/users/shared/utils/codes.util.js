import { nextCode, pad } from "../../../../common/sequences/sequence.service.js";
import { toYearYY } from "../../../../common/utils/date.util.js";

/* Human-readable codes for people, numbered per school */

/* STU26-1-000001: admission year, class order, serial */
export const nextStudentCode = (tenantId, { yearYY, classSequence }, options) =>
  nextCode(tenantId, `STUDENT-${yearYY}-${classSequence}`, n => `STU${yearYY}-${classSequence}-${pad(n, 6)}`, options);

/* TCHR24-000001: joining year, serial */
export const nextTeacherCode = (tenantId, joiningDate, options) => {
  const yy = toYearYY(joiningDate ?? new Date());
  return nextCode(tenantId, `TEACHER-${yy}`, n => `TCHR${yy}-${pad(n, 6)}`, options);
};

/* STF24-000001: joining year, serial */
export const nextStaffCode = (tenantId, joiningDate, options) => {
  const yy = toYearYY(joiningDate ?? new Date());
  return nextCode(tenantId, `STAFF-${yy}`, n => `STF${yy}-${pad(n, 6)}`, options);
};

/* PRT26-000001: registration year, serial */
export const nextParentCode = (tenantId, yearYY = toYearYY(new Date()), options) =>
  nextCode(tenantId, `PARENT-${yearYY}`, n => `PRT${yearYY}-${pad(n, 6)}`, options);
