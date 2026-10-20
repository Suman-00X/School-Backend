import { reportCardFormat } from "../../report-cards/index.js";
import { CERTIFICATE_TYPE_INFO } from "../constants/certificate.constants.js";
import { DEFAULT_FORMATS } from "../templates/defaultFormats.js";
import { certificateDataService, placeholderGroupsOf } from "./certificateData.service.js";

/* What the format store needs of each document type:
     label, defaultFormat() -> { name, html, css } (version 1),
     placeholderGroups() -> [{ group, fields: [{ key, label, sample, insert? }] }],
     sample(ctx) and forStudent(ctx, studentId) -> the values a preview is filled with.
   A list's fields are keyed "list[].field" (see htmlTemplate.js checkTemplate). */

const certificateType = type => ({
  label: CERTIFICATE_TYPE_INFO[type].label,
  defaultFormat: () => DEFAULT_FORMATS[type],
  placeholderGroups: () => placeholderGroupsOf(type),
  sample: ctx => certificateDataService.sample(ctx, type),
  forStudent: async (ctx, studentId) =>
    (
      await certificateDataService.build(
        ctx,
        type,
        studentId,
        await certificateDataService.inputDefaults(ctx, type, studentId),
        { serialNumber: `${CERTIFICATE_TYPE_INFO[type].prefix}/…` }
      )
    ).values
});

/* Resolved when used, not when loaded: report-cards imports this module's index too */
export const formatTypeOf = type => (type === "REPORT_CARD" ? reportCardFormat : certificateType(type));

export const knownPlaceholders = type =>
  new Set(
    formatTypeOf(type)
      .placeholderGroups()
      .flatMap(group => group.fields.map(field => field.key))
  );
