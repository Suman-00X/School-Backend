import { idParams, listQuery } from "../../../../common/validation/schemas.js";
import { leaveApplication, leaveCancellation, leaveFilters } from "../../../academics/student-leaves/index.js";

export const portalLeaveValidators = {
  list: { params: idParams("studentId"), query: listQuery(leaveFilters) },
  apply: { params: idParams("studentId"), body: leaveApplication },
  cancel: { params: idParams("studentId", "requestId"), body: leaveCancellation }
};
