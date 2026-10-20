/* academics/behaviour-remarks: each student's behaviour log book (appreciation, notes,
   concerns, incidents), written by teachers, read by teachers, the student and parents */
export { default as behaviourRemarkRoutes } from "./routes/behaviourRemark.routes.js";
export { BEHAVIOUR_REMARK_RECORDED, behaviourRemarkService } from "./services/behaviourRemark.service.js";
export { REMARK_CATEGORIES, REMARK_KIND_LABELS } from "./constants/behaviourRemark.constants.js";
export { remarkFilters } from "./validators/behaviourRemark.validator.js";
