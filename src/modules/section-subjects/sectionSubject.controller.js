import * as sectionSubjectQueries from "./sectionSubject.queries.js";
import * as subjectQueries from "../subjects/subject.queries.js";
import { getSectionContext } from "../sections/section.service.js";
import { generateClassSectionSubjectDisplay } from "../../common/services/idFormat.service.js";
import { successResponse, errorResponse } from "../../common/responses/index.js";
import { badRequest, conflict, notFound } from "../../common/utils/appError.util.js";

/* Assign a subject to a section of the resolved academic year */
export const createSectionSubject = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const academicYearId = req.academicYearId;
    const { sectionId, subjectId, weeklyNoOfClasses, description } = req.body;

    const { section, classSequence } = await getSectionContext(tenantId, academicYearId, sectionId);

    const subject = await subjectQueries.getSubjectById(tenantId, subjectId);
    if (!subject) throw badRequest("Invalid subject");

    const mapped = await sectionSubjectQueries.isSubjectMappedToSection(
      tenantId,
      academicYearId,
      sectionId,
      subjectId
    );
    if (mapped) throw conflict("Subject already mapped to this section");

    const displayCode = generateClassSectionSubjectDisplay({
      subjectCode: subject.subjectCode,
      classSequence,
      sectionName: section.sectionName
    });

    const data = await sectionSubjectQueries.createSectionSubject(tenantId, academicYearId, {
      sectionId,
      subjectId,
      displayCode,
      weeklyNoOfClasses,
      description
    });
    res.locals.entityId = data.id;
    return successResponse(res, data, "Mapping created", 201);
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getSubjectsBySection = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await sectionSubjectQueries.getSubjectsBySection(
        req.user.tenantId,
        req.academicYearId,
        req.params.sectionId
      )
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const removeSectionSubject = async (req, res, next) => {
  try {
    const data = await sectionSubjectQueries.removeSectionSubject(req.user.tenantId, req.params.mapId);
    if (!data) throw notFound("Mapping");
    res.locals.entityId = req.params.mapId;
    return successResponse(res, null, "Mapping removed");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};
