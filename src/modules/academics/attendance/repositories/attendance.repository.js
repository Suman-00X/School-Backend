import { asc, between, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { subjects } from "../../subjects/models/subject.schema.js";
import { attendanceRecords, attendanceSessions } from "../models/attendance.schema.js";
import { attendanceFreePeriods } from "../models/attendanceFreePeriod.schema.js";
import { attendanceModeRules } from "../models/attendanceModeRule.schema.js";
import { attendancePolicies } from "../models/attendancePolicy.schema.js";

const excluded = column => sql.raw(`excluded."${column.name}"`);

export const attendanceSessionRepository = {
  ...createRepository({ table: attendanceSessions, queryKey: "attendanceSessions" }),

  /* Create or refresh the register for (section, date, kind, period). -> { id, created } */
  upsert: async (tenantId, values, { dbc = db } = {}) => {
    const [row] = await dbc
      .insert(attendanceSessions)
      .values({ ...values, tenantId, isActive: true })
      .onConflictDoUpdate({
        target: [
          attendanceSessions.sectionId,
          attendanceSessions.date,
          attendanceSessions.kind,
          attendanceSessions.periodNumber
        ],
        set: {
          subjectId: excluded(attendanceSessions.subjectId),
          takenBy: excluded(attendanceSessions.takenBy),
          isSubstitute: excluded(attendanceSessions.isSubstitute),
          takenAt: new Date(),
          remarks: excluded(attendanceSessions.remarks),
          lockOverrideReason: excluded(attendanceSessions.lockOverrideReason),
          lockOverriddenBy: excluded(attendanceSessions.lockOverriddenBy),
          lockOverriddenAt: excluded(attendanceSessions.lockOverriddenAt),
          isActive: true,
          updatedAt: new Date()
        }
      })
      .returning({ id: attendanceSessions.id, created: sql`(xmax = 0)`.mapWith(Boolean) });
    return row;
  },

  /* Was the register of one period taken? */
  periodTaken: (tenantId, { sectionId, date, periodNumber }, { dbc = db } = {}) =>
    attendanceSessionRepository.exists(
      tenantId,
      [
        eq(attendanceSessions.sectionId, sectionId),
        eq(attendanceSessions.date, date),
        eq(attendanceSessions.kind, "PERIOD"),
        eq(attendanceSessions.periodNumber, periodNumber)
      ],
      { dbc }
    ),

  /* Registers of some sections in [from, to], with the period's subject */
  findInRange: (tenantId, { sectionIds, from, to }) =>
    sectionIds.length
      ? db
          .select({
            id: attendanceSessions.id,
            sectionId: attendanceSessions.sectionId,
            date: attendanceSessions.date,
            kind: attendanceSessions.kind,
            periodNumber: attendanceSessions.periodNumber,
            subjectId: attendanceSessions.subjectId,
            subjectName: subjects.subjectName,
            takenBy: attendanceSessions.takenBy,
            isSubstitute: attendanceSessions.isSubstitute,
            takenAt: attendanceSessions.takenAt,
            lockOverrideReason: attendanceSessions.lockOverrideReason,
            lockOverriddenBy: attendanceSessions.lockOverriddenBy,
            lockOverriddenAt: attendanceSessions.lockOverriddenAt
          })
          .from(attendanceSessions)
          .leftJoin(subjects, eq(subjects.id, attendanceSessions.subjectId))
          .where(
            scoped(
              attendanceSessions,
              tenantId,
              inArray(attendanceSessions.sectionId, sectionIds),
              between(attendanceSessions.date, from, to)
            )
          )
          .orderBy(asc(attendanceSessions.date), asc(attendanceSessions.kind), asc(attendanceSessions.periodNumber))
      : []
};

export const attendanceRecordRepository = {
  ...createRepository({ table: attendanceRecords, queryKey: "attendanceRecords" }),

  upsertMany: (tenantId, rows, { dbc = db } = {}) =>
    dbc
      .insert(attendanceRecords)
      .values(rows.map(row => ({ ...row, tenantId, isActive: true })))
      .onConflictDoUpdate({
        target: [attendanceRecords.sessionId, attendanceRecords.studentId],
        set: {
          status: excluded(attendanceRecords.status),
          remarks: excluded(attendanceRecords.remarks),
          isActive: true,
          updatedAt: new Date()
        }
      }),

  /* Marks of a section and/or a student in [from, to] (every kind) */
  findInRange: (tenantId, { sectionId, studentId, academicYearId, from, to }) =>
    db
      .select({
        studentId: attendanceRecords.studentId,
        sectionId: attendanceRecords.sectionId,
        date: attendanceRecords.date,
        kind: attendanceRecords.kind,
        periodNumber: attendanceRecords.periodNumber,
        status: attendanceRecords.status,
        remarks: attendanceRecords.remarks
      })
      .from(attendanceRecords)
      .where(
        scoped(
          attendanceRecords,
          tenantId,
          sectionId ? eq(attendanceRecords.sectionId, sectionId) : undefined,
          studentId ? eq(attendanceRecords.studentId, studentId) : undefined,
          academicYearId ? eq(attendanceRecords.academicYearId, academicYearId) : undefined,
          between(attendanceRecords.date, from, to)
        )
      )
      .orderBy(asc(attendanceRecords.date), asc(attendanceRecords.periodNumber)),

  /* A student's ABSENT marks on these dates, in registers of these kinds, become EXCUSED
     (an empty remark says why) -> the marks changed */
  excuseAbsences: (tenantId, { studentId, dates, kinds, remarks }, { dbc = db } = {}) =>
    dbc
      .update(attendanceRecords)
      .set({ status: "EXCUSED", remarks: sql`coalesce(${attendanceRecords.remarks}, ${remarks})`, updatedAt: new Date() })
      .where(
        scoped(
          attendanceRecords,
          tenantId,
          eq(attendanceRecords.studentId, studentId),
          inArray(attendanceRecords.date, dates),
          inArray(attendanceRecords.kind, kinds),
          eq(attendanceRecords.status, "ABSENT")
        )
      )
      .returning({ date: attendanceRecords.date, kind: attendanceRecords.kind, periodNumber: attendanceRecords.periodNumber })
};

export const attendancePolicyRepository = {
  ...createRepository({ table: attendancePolicies, queryKey: "attendancePolicies" }),

  /* The school's policy, created with defaults the first time (safe under concurrency) */
  ensure: async tenantId => {
    await db
      .insert(attendancePolicies)
      .values({ tenantId })
      .onConflictDoNothing({ target: attendancePolicies.tenantId });
    const [policy] = await db.select().from(attendancePolicies).where(eq(attendancePolicies.tenantId, tenantId));
    return policy;
  },

  /* Mode changes take it FOR UPDATE, and so do concurrent policy edits. A mode change
     starts tomorrow at the earliest, so only a register for today can meet one (made just
     before the school's midnight): that register takes it FOR SHARE. */
  lock: async (tenantId, policyId, { dbc, strength = "update" }) => {
    const [row] = await dbc
      .select()
      .from(attendancePolicies)
      .where(scoped(attendancePolicies, tenantId, eq(attendancePolicies.id, policyId)))
      .for(strength);
    return row ?? null;
  }
};

export const attendanceModeRuleRepository = {
  ...createRepository({
    table: attendanceModeRules,
    queryKey: "attendanceModeRules",
    orderBy: asc(attendanceModeRules.effectiveFrom)
  }),

  /* The school's rules starting on or after `from`: replaced or cancelled by a new rule from that date */
  retireFrom: (tenantId, { from }, { dbc }) =>
    dbc
      .update(attendanceModeRules)
      .set({ isActive: false })
      .where(scoped(attendanceModeRules, tenantId, gte(attendanceModeRules.effectiveFrom, from)))
};

export const attendanceFreePeriodRepository = {
  ...createRepository({
    table: attendanceFreePeriods,
    queryKey: "attendanceFreePeriods",
    orderBy: [asc(attendanceFreePeriods.date), asc(attendanceFreePeriods.periodNumber)]
  }),

  /* Mark (section, date, period) free, or revive a removed row / change its reason.
     -> { id, created } (created: no free period was in force) */
  upsert: async (tenantId, values, { dbc = db } = {}) => {
    const [row] = await dbc
      .insert(attendanceFreePeriods)
      .values({ ...values, tenantId, isActive: true })
      .onConflictDoUpdate({
        target: [attendanceFreePeriods.sectionId, attendanceFreePeriods.date, attendanceFreePeriods.periodNumber],
        set: {
          reason: excluded(attendanceFreePeriods.reason),
          markedBy: excluded(attendanceFreePeriods.markedBy),
          markedAt: new Date(),
          lockOverrideReason: excluded(attendanceFreePeriods.lockOverrideReason),
          lockOverriddenBy: excluded(attendanceFreePeriods.lockOverriddenBy),
          lockOverriddenAt: excluded(attendanceFreePeriods.lockOverriddenAt),
          isActive: true,
          updatedAt: new Date()
        }
      })
      .returning({ id: attendanceFreePeriods.id });
    return row;
  },

  /* List conditions: some sections (null = all) and a date range (either end optional) */
  filters: ({ sectionIds, from, to }) => [
    sectionIds ? inArray(attendanceFreePeriods.sectionId, sectionIds) : undefined,
    from ? gte(attendanceFreePeriods.date, from) : undefined,
    to ? lte(attendanceFreePeriods.date, to) : undefined
  ],

  /* The free period in force at (section, date, period), or null */
  findAt: (tenantId, { sectionId, date, periodNumber }, { dbc = db } = {}) =>
    attendanceFreePeriodRepository.findOne(
      tenantId,
      [
        eq(attendanceFreePeriods.sectionId, sectionId),
        eq(attendanceFreePeriods.date, date),
        eq(attendanceFreePeriods.periodNumber, periodNumber)
      ],
      { dbc }
    ),

  /* Free periods of some sections in [from, to] */
  findInRange: (tenantId, { sectionIds, from, to }, { dbc = db } = {}) =>
    sectionIds.length
      ? dbc
          .select()
          .from(attendanceFreePeriods)
          .where(
            scoped(
              attendanceFreePeriods,
              tenantId,
              inArray(attendanceFreePeriods.sectionId, sectionIds),
              between(attendanceFreePeriods.date, from, to)
            )
          )
          .orderBy(asc(attendanceFreePeriods.date), asc(attendanceFreePeriods.periodNumber))
      : []
};
