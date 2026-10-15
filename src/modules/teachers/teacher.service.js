import { db } from "../../database/postgres/client.js";
import * as userQueries from "../users/user.queries.js";
import * as teacherQueries from "./teacher.queries.js";
import { generateTeacherId } from "../../common/services/idFormat.service.js";
import { toYearYY } from "../../common/utils/date.util.js";

/* Teacher = user (role TEACHER) + teacher profile with a generated employee code */
export const createTeacherWithUser = (tenantId, { user, profile = {} }) =>
  db.transaction(async tx => {
    const createdUser = await userQueries.createUser(tenantId, { ...user, role: "TEACHER" }, tx);

    const employeeCode = await generateTeacherId({
      tenantId,
      joiningYearYY: toYearYY(profile.joiningDate ?? new Date()),
      dbc: tx
    });

    return teacherQueries.createTeacher(
      tenantId,
      { ...profile, userId: createdUser.id, employeeCode },
      tx
    );
  });
