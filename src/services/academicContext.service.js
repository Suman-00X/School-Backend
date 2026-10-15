import AcademicYear from "../models/academic-db/AcademicYear.js";
import Section from "../models/academic-db/Section.js";
import { badRequest } from "../utils/appError.util.js";

export const toYearYY = date => new Date(date).getFullYear().toString().slice(-2);

/* Load a section inside an academic year, with the values used to build
   student codes, roll numbers and display codes */
export const getSectionContext = async (tenantId, academicYearId, sectionId) => {
  const academicYear = await AcademicYear.findOne({
    _id: academicYearId,
    tenantId,
    isActive: true
  }).lean();
  if (!academicYear) throw badRequest("Invalid academic year");

  const section = await Section.findOne({
    _id: sectionId,
    tenantId,
    academicYearId,
    isActive: true
  })
    .populate("classId", "className classOrder isActive")
    .lean();
  if (!section) throw badRequest("Section does not belong to academic year");

  const cls = section.classId;
  if (!cls?.isActive) throw badRequest("Section's class is inactive");

  return {
    academicYear,
    section,
    cls,
    yearYY: toYearYY(academicYear.startDate),
    classSequence: cls.classOrder
  };
};
