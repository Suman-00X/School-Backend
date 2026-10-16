/* academics/result-policies: how each school turns marks into results (grading system,
   pass criteria, grace, best-of-N, absences, ranking, rounding), where each policy applies,
   and the pure result engine report cards and assessment schemes run on */
export { resultPolicyAssignmentRoutes, resultPolicyRoutes } from "./routes/resultPolicy.routes.js";
export { policyView, resultPolicyService } from "./services/resultPolicy.service.js";
export { policySettings } from "./validators/resultPolicy.validator.js";
export * as resultEngine from "./services/resultEngine.service.js";
