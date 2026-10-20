import { idParams, listQuery } from "../../../../common/validation/schemas.js";
import { remarkFilters } from "../../../academics/behaviour-remarks/index.js";

export const portalBehaviourValidators = {
  list: { params: idParams("studentId"), query: listQuery(remarkFilters) },
  summary: { params: idParams("studentId") },
  acknowledge: { params: idParams("studentId", "remarkId") }
};
