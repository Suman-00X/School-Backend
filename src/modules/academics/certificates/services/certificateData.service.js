import { logoBytes } from "../../../../common/export/branding.js";
import { getTenant, tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { accountService } from "../../../users/accounts/index.js";
import { studentParentService, studentService } from "../../../users/students/index.js";
import { academicYearService } from "../../academic-years/index.js";
import { attendanceService } from "../../attendance/index.js";
import { enrollmentService } from "../../enrollments/index.js";
import { nepPolicyService } from "../../nep-policy/index.js";
import { sectionSubjectService } from "../../section-subjects/index.js";
import { sectionService } from "../../sections/index.js";
import { CERTIFICATE_TYPE_INFO, PLACEHOLDER_GROUPS, SAMPLE_INPUTS } from "../constants/certificate.constants.js";
import { dateInWords, longDate, pronounsOf, shortDate } from "../utils/certificateText.util.js";

/* The values a certificate's placeholders are filled with:
   { school, student, parents, class, certificate } (see PLACEHOLDER_GROUPS) */

const fullName = user => [user?.firstName, user?.middleName, user?.lastName].filter(Boolean).join(" ");
const orEmpty = value => (value === null || value === undefined ? "" : String(value));

/* The placeholders a format of this type may use, in groups for the editor:
   [{ group, fields: [{ key, label, sample }] }]. The type's inputs join "Certificate". */
export const placeholderGroupsOf = type =>
  PLACEHOLDER_GROUPS.map(({ group, fields }) => {
    const listed = fields.map(([key, label, sample]) => ({ key, label, sample }));
    if (group !== "Certificate") return { group, fields: listed };
    for (const input of CERTIFICATE_TYPE_INFO[type].inputs) {
      const sample = SAMPLE_INPUTS[input.key] ?? "";
      if (input.kind !== "date") {
        listed.push({ key: `certificate.${input.key}`, label: input.label, sample });
        continue;
      }
      listed.push(
        { key: `certificate.${input.key}`, label: input.label, sample: shortDate(sample) },
        { key: `certificate.${input.key}Long`, label: `${input.label}, long`, sample: longDate(sample) }
      );
    }
    return { group, fields: listed };
  });

/* certificate.* from the inputs: dates as 14/08/2015 plus <key>Long */
const certificateValues = (type, inputs, { serialNumber, issuedOn }) => {
  const values = {
    title: CERTIFICATE_TYPE_INFO[type].label,
    serialNumber,
    issueDate: shortDate(issuedOn),
    issueDateLong: longDate(issuedOn)
  };
  for (const input of CERTIFICATE_TYPE_INFO[type].inputs) {
    const value = inputs[input.key];
    if (input.kind === "date") {
      values[input.key] = shortDate(value);
      values[`${input.key}Long`] = longDate(value);
    } else {
      values[input.key] = orEmpty(value);
    }
  }
  return values;
};

const schoolValues = async ctx => {
  const [tenant, nep] = await Promise.all([getTenant(ctx.tenantId), nepPolicyService.get(ctx)]);
  return {
    name: orEmpty(tenant?.name),
    address: orEmpty(tenant?.address),
    phone: orEmpty(tenant?.contactPhone),
    email: orEmpty(tenant?.contactEmail),
    udiseCode: orEmpty(nep.udiseCode)
  };
};

/* The year the certificate speaks of: the student's enrollment in the year the request
   names (or the current year), else their latest one */
const enrollmentOf = async (ctx, studentId) => {
  const all = await enrollmentService.findAllForStudent(ctx, studentId);
  if (!all.length) return { enrollment: null, first: null };
  const yearId = ctx.academicYearId ?? (await academicYearService.findCurrent(ctx))?.id;
  const years = new Map(
    await Promise.all(
      [...new Set(all.map(e => e.academicYearId))].map(async id => [id, await academicYearService.findById(ctx, id)])
    )
  );
  const byStart = [...all].sort((a, b) =>
    String(years.get(a.academicYearId)?.startDate ?? "").localeCompare(
      String(years.get(b.academicYearId)?.startDate ?? "")
    )
  );
  const enrollment = all.find(e => e.academicYearId === yearId) ?? byStart.at(-1);
  return { enrollment, first: byStart[0], year: years.get(enrollment.academicYearId) };
};

const classValues = async (ctx, studentId) => {
  const { enrollment, first, year } = await enrollmentOf(ctx, studentId);
  if (!enrollment) return { values: {}, enrollment: null };
  const [section, firstSection, subjects] = await Promise.all([
    sectionService.findById(ctx, enrollment.sectionId),
    first.id === enrollment.id ? null : sectionService.findById(ctx, first.sectionId),
    sectionSubjectService.list(
      { ...ctx, academicYearId: enrollment.academicYearId },
      { sectionId: enrollment.sectionId, page: 1, limit: 100 }
    )
  ]);
  const className = orEmpty(section?.class?.className);
  return {
    enrollment,
    values: {
      name: className,
      section: orEmpty(section?.sectionName),
      classSection: section ? `${className} – ${section.sectionName}` : "",
      rollNumber: orEmpty(enrollment.rollNumber),
      academicYear: orEmpty(year?.yearName),
      admittedClass: orEmpty((firstSection ?? section)?.class?.className),
      subjects: subjects.rows
        .map(row => row.subject?.subjectName)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
        .join(", ")
    }
  };
};

const studentValues = async (ctx, studentId) => {
  const student = await studentService.getById(ctx, studentId);
  const [user, links] = await Promise.all([
    accountService.getById(ctx, student.userId),
    studentParentService.list(ctx, studentId, { page: 1, limit: 20 })
  ]);
  const parentOf = relation => fullName(links.rows.find(link => link.relation === relation)?.parent?.user);
  const parents = { father: parentOf("FATHER"), mother: parentOf("MOTHER"), guardian: parentOf("GUARDIAN") };
  parents.parent = parents.father || parents.mother || parents.guardian;
  return {
    student: {
      name: fullName(user),
      firstName: orEmpty(user.firstName),
      middleName: orEmpty(user.middleName),
      lastName: orEmpty(user.lastName),
      admissionNumber: orEmpty(student.admissionNumber),
      admissionDate: shortDate(student.admissionDate),
      admissionDateLong: longDate(student.admissionDate),
      dob: shortDate(user.dob),
      dobLong: longDate(user.dob),
      dobInWords: dateInWords(user.dob),
      ...pronounsOf(user.gender),
      category: orEmpty(student.category),
      religion: orEmpty(student.religion),
      motherTongue: orEmpty(student.motherTongue),
      bloodGroup: orEmpty(student.bloodGroup),
      pen: orEmpty(student.pen),
      apaarId: orEmpty(student.apaarId)
    },
    parents
  };
};

/* Values worked out for the inputs marked `prefill` (attendance for a transfer certificate) */
const prefills = async (ctx, type, studentId, enrollment) => {
  const wanted = CERTIFICATE_TYPE_INFO[type].inputs.filter(input => input.prefill);
  if (!wanted.length || !enrollment) return {};
  try {
    const attendance = await attendanceService.studentAttendance(ctx, studentId, {
      academicYearId: enrollment.academicYearId
    });
    return { workingDays: String(attendance.workingDays), daysPresent: String(attendance.attendedDays) };
  } catch {
    return {};
  }
};

/* { school: { name: "Green Valley School", ... }, student: { ... }, ... } */
const sampleValues = () => {
  const values = {};
  for (const [key, , sample] of PLACEHOLDER_GROUPS.flatMap(group => group.fields)) {
    const [top, field] = key.split(".");
    (values[top] ??= {})[field] = sample;
  }
  return values;
};

export const certificateDataService = {
  /* The inputs' starting values for a student: defaults, today, and the prefilled ones */
  inputDefaults: async (ctx, type, studentId) => {
    const today = await tenantToday(ctx.tenantId);
    const { enrollment } = studentId ? await enrollmentOf(ctx, studentId) : {};
    const worked = studentId ? await prefills(ctx, type, studentId, enrollment) : {};
    return Object.fromEntries(
      CERTIFICATE_TYPE_INFO[type].inputs.map(input => [
        input.key,
        worked[input.prefill] ?? (input.default === "today" ? today : (input.default ?? ""))
      ])
    );
  },

  /* Every placeholder's value for a student (the school's logo is added when rendering) */
  build: async (ctx, type, studentId, inputs, { serialNumber = "", issuedOn }) => {
    const [school, person, schooling] = await Promise.all([
      schoolValues(ctx),
      studentValues(ctx, studentId),
      classValues(ctx, studentId)
    ]);
    return {
      values: {
        school,
        ...person,
        class: schooling.values,
        certificate: certificateValues(type, inputs, {
          serialNumber,
          issuedOn: issuedOn ?? (await tenantToday(ctx.tenantId))
        })
      },
      enrollment: schooling.enrollment
    };
  },

  /* The sample values, for a format preview without a student */
  sample: async (ctx, type) => {
    const values = sampleValues();
    values.school = { ...values.school, ...(await schoolValues(ctx)) };
    const prefix = CERTIFICATE_TYPE_INFO[type].prefix;
    values.certificate = certificateValues(type, SAMPLE_INPUTS, {
      serialNumber: `${prefix}/2026-27/0001`,
      issuedOn: await tenantToday(ctx.tenantId)
    });
    return values;
  },

  /* school.* (name, address, phone, email, udiseCode), for other documents too */
  school: schoolValues,

  /* The school logo as a data URI for {{school.logo}}, or "" */
  logo: async ctx => {
    const bytes = await logoBytes(await getTenant(ctx.tenantId));
    if (!bytes) return "";
    const type = bytes[0] === 0x89 ? "image/png" : "image/jpeg";
    return `data:${type};base64,${bytes.toString("base64")}`;
  }
};
