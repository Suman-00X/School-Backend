import * as academicYearQueries from "../academic-years/academicYear.queries.js";
import * as sectionQueries from "./section.queries.js";
import { badRequest } from "../../common/utils/appError.util.js";
import { toYearYY } from "../../common/utils/date.util.js";

/* Load a section inside an academic year, with the values used to build
   student codes, roll numbers and display codes */
export const getSectionContext = async (tenantId, academicYearId, sectionId) => {
  const academicYear = await academicYearQueries.getAcademicYearById(tenantId, academicYearId);
  if (!academicYear) throw badRequest("Invalid academic year");

  const section = await sectionQueries.getSectionInYear(tenantId, academicYearId, sectionId);
  if (!section) throw badRequest("Section does not belong to academic year");

  const cls = section.class;
  if (!cls?.isActive) throw badRequest("Section's class is inactive");

  return {
    academicYear,
    section,
    cls,
    yearYY: toYearYY(academicYear.startDate),
    classSequence: cls.classOrder
  };
};
