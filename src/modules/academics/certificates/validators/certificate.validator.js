import { z } from "../../../../common/validation/zod.js";
import {
  id,
  idParams,
  listQuery,
  name,
  optionalText,
  positiveInt,
  text
} from "../../../../common/validation/schemas.js";
import { CERTIFICATE_STATUSES, CERTIFICATE_TYPES, FORMAT_TYPES } from "../constants/certificate.constants.js";

/* "transfer" in a path reads as TRANSFER, "report-card" as REPORT_CARD */
const upper = value => (typeof value === "string" ? value.toUpperCase().replaceAll("-", "_") : value);
const type = () => z.preprocess(upper, z.enum(CERTIFICATE_TYPES));
const formatType = () => z.preprocess(upper, z.enum(FORMAT_TYPES));

/* Each type's inputs are checked by the service against the type's list */
const inputs = z.record(z.string().max(40), z.union([z.string().max(1000), z.number()]).nullable()).default({});

const certificateParams = idParams("certificateId");

/* The portal's list filters (a family sees only certificates in force) */
export const certificateFilters = { type: type().optional() };
const typeParams = z.object({ type: formatType() });

const template = {
  html: z.string().min(1).max(600_000),
  css: z.string().max(200_000).default("")
};

export const certificateValidators = {
  list: {
    query: listQuery({
      type: type().optional(),
      status: z.enum(CERTIFICATE_STATUSES).optional(),
      studentId: id().optional(),
      search: z.string().trim().max(100).optional()
    })
  },
  draft: { query: z.object({ type: type(), studentId: id() }) },
  preview: { body: z.object({ type: type(), studentId: id(), inputs }) },
  issue: { body: z.object({ type: type(), studentId: id(), inputs, markLeft: z.boolean().default(false) }) },
  get: { params: certificateParams },
  cancel: { params: certificateParams, body: z.object({ reason: text(300) }) }
};

export const certificateFormatValidators = {
  current: { params: typeParams },
  versions: { params: typeParams },
  version: { params: z.object({ type: formatType(), version: positiveInt() }) },
  save: {
    params: typeParams,
    body: z.object({
      name: name(100),
      ...template,
      note: optionalText(300),
      baseVersion: z.number().int().min(0).optional()
    })
  },
  preview: {
    params: typeParams,
    body: z.object({ name: name(100).optional(), ...template, studentId: id().optional() })
  }
};
