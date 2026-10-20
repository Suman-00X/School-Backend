import { idParams, listQuery } from "../../../../common/validation/schemas.js";
import { certificateFilters } from "../../../academics/certificates/index.js";

export const portalCertificateValidators = {
  list: { params: idParams("studentId"), query: listQuery(certificateFilters) },
  get: { params: idParams("studentId", "certificateId") }
};
