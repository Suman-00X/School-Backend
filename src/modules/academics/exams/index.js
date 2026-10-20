/* academics/exams: exams of a year and their subject papers (publication: report-cards) */
export { default as examRoutes } from "./routes/exam.routes.js";
export { examService, EXAM_RESULTS_PUBLISHED, EXAM_SCHEDULE_CHANGED } from "./services/exam.service.js";
export { examPaperService } from "./services/examPaper.service.js";
