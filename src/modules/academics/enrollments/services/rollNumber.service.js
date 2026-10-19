import { sql } from "drizzle-orm";
import { db, transaction } from "../../../../common/database/postgres.js";
import { unprocessable } from "../../../../common/http/errors.js";
import { lockSequence, setSequence } from "../../../../common/sequences/sequence.service.js";
import { toYearYY } from "../../../../common/utils/date.util.js";
import { academicYearService } from "../../academic-years/index.js";
import { classCodeLabel } from "../../classes/index.js";
import { reportSnapshotService } from "../../report-cards/index.js";
import { sectionService } from "../../sections/index.js";
import { formatRollNumber, rollNumberScope } from "../../shared/utils/codes.util.js";
import { enrollmentRepository } from "../repositories/enrollment.repository.js";
import { enrollmentPolicyRepository } from "../repositories/enrollmentPolicy.repository.js";

/* Roll numbers: the order of a section, by the school's rule (enrollment policy).
   - ALPHABETICAL: first, middle, then last name (case and accents ignored), then admission number
   - RESULT_RANK: the published final result of the year before, best percentage first; students
     without one (new admissions, missing results) follow, alphabetically. Ties alphabetical.
   Numbers are only re-ordered on request (assign) and in a bulk promotion; anyone enrolled
   later takes the next number at the end of the section. */

const names = new Intl.Collator("en", { sensitivity: "base" });
const codes = new Intl.Collator("en", { numeric: true });

export const byName = (a, b) =>
  names.compare(a.firstName ?? "", b.firstName ?? "") ||
  names.compare(a.middleName ?? "", b.middleName ?? "") ||
  names.compare(a.lastName ?? "", b.lastName ?? "") ||
  codes.compare(a.admissionNumber ?? "", b.admissionNumber ?? "") ||
  codes.compare(a.studentId, b.studentId);

/* A result that can be ranked: a percentage on a complete result */
const rankable = result => typeof result?.percentage === "number" && result.result !== "INCOMPLETE";

/* rows: [{ studentId, firstName, middleName, lastName, admissionNumber }] -> a new sorted array */
const orderRows = (rule, rows, results) => {
  if (rule !== "RESULT_RANK") return [...rows].sort(byName);
  const ranked = rows.filter(row => rankable(results.get(row.studentId)));
  const unranked = rows.filter(row => !rankable(results.get(row.studentId)));
  ranked.sort((a, b) => results.get(b.studentId).percentage - results.get(a.studentId).percentage || byName(a, b));
  return [...ranked, ...unranked.sort(byName)];
};

/* The school's rule and, for RESULT_RANK, the year before `academicYear` and its results */
const ruleFor = async (ctx, academicYear, studentIds) => {
  const { rollNumberOrder: rule } = await enrollmentPolicyRepository.ensure(ctx.tenantId);
  if (rule !== "RESULT_RANK") return { rule, previousYear: null, results: new Map() };
  const previousYear = await academicYearService.findPrevious(ctx, academicYear);
  const results = previousYear
    ? await reportSnapshotService.finalResults(ctx, previousYear.id, [...new Set(studentIds)])
    : new Map();
  return { rule, previousYear, results };
};

const placementOf = (academicYear, section) => ({
  yearYY: toYearYY(academicYear.startDate),
  classSequence: classCodeLabel(section.class),
  sectionName: section.sectionName
});

const sectionLabel = section => `${section.class?.className}-${section.sectionName}`;

/* The sections of the year a request names: one section, a class's, or all */
const targetSections = async (ctx, academicYear, { sectionId, classId }) => {
  const sections = (await sectionService.findAllInYear(ctx, academicYear.id))
    .filter(section => (sectionId ? section.id === sectionId : classId ? section.classId === classId : true))
    .sort(
      (a, b) => (a.class?.classOrder ?? 0) - (b.class?.classOrder ?? 0) || names.compare(a.sectionName, b.sectionName)
    );
  if (sectionId && !sections.length) {
    throw unprocessable(`The section does not belong to academic year ${academicYear.yearName}`);
  }
  if (classId && !sections.length) {
    throw unprocessable(`The class has no sections in academic year ${academicYear.yearName}`);
  }
  return sections;
};

const nameOf = row => [row.firstName, row.middleName, row.lastName].filter(Boolean).join(" ");

export const rollNumberPolicyService = {
  get: async ctx => {
    const policy = await enrollmentPolicyRepository.ensure(ctx.tenantId);
    return { rollNumberOrder: policy.rollNumberOrder, updatedAt: policy.updatedAt };
  },

  update: async (ctx, { rollNumberOrder }) => {
    const policy = await enrollmentPolicyRepository.ensure(ctx.tenantId);
    await enrollmentPolicyRepository.update(ctx.tenantId, policy.id, { rollNumberOrder });
    return rollNumberPolicyService.get(ctx);
  }
};

export const rollNumberService = {
  /* Renumber sections of ctx.academicYear 1..n by the school's rule, in one transaction.
     Students still in the section (ACTIVE) are numbered first; rows of students who left
     keep their order after them (a section's numbers are unique across both). Each
     section's roll-number sequence is held for the transaction and restarted after the
     last number, so later enrollments continue from there. dryRun: the same, nothing saved. */
  assign: async (ctx, { sectionId, classId, dryRun = false }) => {
    const academicYear = ctx.academicYear;
    const sections = await targetSections(ctx, academicYear, { sectionId, classId });
    const placements = new Map(sections.map(section => [section.id, placementOf(academicYear, section)]));

    const work = async dbc => {
      if (!dryRun) {
        /* One assignment per school at a time; sequences locked in a fixed order */
        await dbc.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`roll-numbers:${ctx.tenantId}`}, 0))`);
        const scopes = [...placements.values()].map(rollNumberScope).sort();
        for (const scope of scopes) await lockSequence(ctx.tenantId, scope, { dbc });
      }
      const rows = sections.length
        ? await enrollmentRepository.findNumbered(
            ctx.tenantId,
            sections.map(section => section.id),
            { dbc, forUpdate: !dryRun }
          )
        : [];
      const current = row => row.isActive && row.status === "ACTIVE";
      const { rule, previousYear, results } = await ruleFor(
        ctx,
        academicYear,
        rows.filter(current).map(row => row.studentId)
      );

      const report = [];
      for (const section of sections) {
        const placement = placements.get(section.id);
        const inSection = rows.filter(row => row.sectionId === section.id);
        const ordered = orderRows(rule, inSection.filter(current), results);
        const others = inSection.filter(row => !current(row));
        const numbered = [...ordered, ...others].map((row, index) => ({
          ...row,
          newRollNumber: formatRollNumber(placement, index + 1)
        }));
        const changes = numbered.filter(row => row.newRollNumber !== row.rollNumber);

        if (!dryRun) {
          await enrollmentRepository.setRollNumbers(
            ctx.tenantId,
            changes.map(row => ({ id: row.id, rollNumber: row.newRollNumber })),
            { dbc }
          );
          await setSequence(ctx.tenantId, rollNumberScope(placement), numbered.length, { dbc });
        }

        const ranked =
          rule === "RESULT_RANK" ? ordered.filter(row => rankable(results.get(row.studentId))).length : null;
        report.push({
          sectionId: section.id,
          sectionName: sectionLabel(section),
          classId: section.classId,
          students: ordered.length,
          changed: changes.filter(current).length,
          ...(rule === "RESULT_RANK" && { ranked, unranked: ordered.length - ranked }),
          left: others.length,
          nextRollNumber: formatRollNumber(placement, numbered.length + 1),
          ...(dryRun && {
            order: numbered.filter(current).map(row => {
              const result = results.get(row.studentId);
              return {
                enrollmentId: row.id,
                studentId: row.studentId,
                name: nameOf(row),
                admissionNumber: row.admissionNumber,
                currentRollNumber: row.rollNumber,
                rollNumber: row.newRollNumber,
                ...(rule === "RESULT_RANK" && {
                  previousResult: rankable(result)
                    ? { percentage: result.percentage, result: result.result, source: result.sourceName }
                    : null
                })
              };
            })
          })
        });
      }

      return {
        rule,
        academicYear: { id: academicYear.id, yearName: academicYear.yearName },
        ...(rule === "RESULT_RANK" && {
          previousAcademicYear: previousYear && { id: previousYear.id, yearName: previousYear.yearName }
        }),
        dryRun,
        totals: {
          sections: report.length,
          students: report.reduce((sum, s) => sum + s.students, 0),
          changed: report.reduce((sum, s) => sum + s.changed, 0)
        },
        sections: report
      };
    };

    return dryRun ? work(db) : transaction(work);
  },

  /* For bulk promotion: students in the order the rule numbers them in `academicYear`.
     rows need studentId; names are read here. */
  orderForYear: async (ctx, academicYear, sectionId, rows) => {
    const named = new Map(
      (await enrollmentRepository.findNumbered(ctx.tenantId, [sectionId], { dbc: db })).map(row => [row.studentId, row])
    );
    const people = rows.map(row => ({ ...named.get(row.studentId), ...row, studentId: row.studentId }));
    const { rule, results } = await ruleFor(
      ctx,
      academicYear,
      people.map(row => row.studentId)
    );
    return orderRows(rule, people, results);
  }
};
