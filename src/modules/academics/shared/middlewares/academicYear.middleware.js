import { z } from "../../../../common/validation/zod.js";
import { badRequest, conflict, unprocessable } from "../../../../common/http/errors.js";
import { academicYearService } from "../../academic-years/index.js";
import { ACADEMIC_YEAR_HEADER } from "../constants/academic.constants.js";

const uuid = z.uuid();
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/* For year-scoped routes: sets req.context.academicYearId to the year named in
   the X-Academic-Year-Id header, or else the school's current year */
export const resolveAcademicYear = async (req, res, next) => {
  const requested = req.get(ACADEMIC_YEAR_HEADER);

  if (requested && !uuid.safeParse(requested).success) {
    throw badRequest("X-Academic-Year-Id header must be a valid id");
  }

  const academicYear = requested
    ? await academicYearService.findById(req.context, requested)
    : await academicYearService.findCurrent(req.context);

  if (!academicYear) {
    throw unprocessable(
      requested
        ? "The academic year in X-Academic-Year-Id does not exist"
        : "No current academic year is set. Mark one as current or send X-Academic-Year-Id."
    );
  }

  /* Fail fast (before uploads or other side effects); triggers enforce the same rule in the database */
  if (academicYear.archivedAt && !READ_METHODS.has(req.method)) {
    throw conflict(`Academic year ${academicYear.yearName} is archived and read-only`);
  }

  req.context.academicYearId = academicYear.id;
  req.context.academicYear = academicYear;
  next();
};

resolveAcademicYear.__openapi = {
  parameters: [
    {
      name: "X-Academic-Year-Id",
      in: "header",
      required: false,
      description: "Academic year to act on. Defaults to the school's current year.",
      schema: { type: "string", format: "uuid" }
    }
  ]
};
