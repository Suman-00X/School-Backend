import { and, eq, notInArray } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, unprocessable } from "../../../../common/http/errors.js";
import { academicYearService } from "../../../academics/academic-years/index.js";
import { resourceAssignmentService } from "../../resource-assignments/index.js";
import { MAX_ROLLOVER } from "../../shared/constants/hostel.constants.js";
import { residents } from "../../shared/services/residents.service.js";
import { coversDay, describeRange, guardOverlaps, overlapsRange } from "../../shared/utils/dateRange.util.js";
import { fullName, genderMismatch, roomLabel } from "../../shared/utils/hostel.util.js";
import { hostelAllocations as allocations } from "../models/hostelAllocation.schema.js";
import { hostelAllocationRepository } from "../repositories/hostelAllocation.repository.js";
import { allocationInternals } from "./allocation.service.js";

const { lockRooms, studentColumns } = allocationInternals;

/* Thrown to roll a dry run back after it has done (and reported) everything */
class DryRun extends Error {
  constructor(result) {
    super("dry run");
    this.result = result;
  }
}

const yearSummary = year => ({
  id: year.id,
  yearName: year.yearName,
  startDate: year.startDate,
  endDate: year.endDate
});

export const rolloverService = {
  /* Year-end: every resident whose bed runs to the last day of the source year (ctx's year)
     keeps the same bed for the whole target year, as a new allocation linked to the old one.
     Skipped, with the reason: students who left (no active enrollment in either year), open-ended
     stays (they already continue), students already booked for the target year, beds booked by
     someone else, and residents who no longer fit the hostel's gender rule. All in one
     transaction under the room locks; a dry run reports the same result and changes nothing. */
  rollover: async (ctx, { toAcademicYearId, includeResources, dryRun }) => {
    const source = ctx.academicYear;
    const target = await academicYearService.findById(ctx, toAcademicYearId);
    if (!target) throw unprocessable("toAcademicYearId does not refer to an existing academic year");
    if (target.archivedAt) throw conflict(`Academic year ${target.yearName} is archived and read-only`);
    if (target.startDate <= source.endDate) {
      throw unprocessable(`${target.yearName} must start after ${source.yearName} ends (${source.endDate})`);
    }
    const range = { fromDate: target.startDate, toDate: target.endDate };

    const run = async tx => {
      const current = await hostelAllocationRepository.findMany(ctx.tenantId, {
        dbc: tx,
        conditions: [eq(allocations.status, "ACTIVE"), coversDay(allocations, source.endDate)],
        with: { student: studentColumns }
      });
      if (current.length > MAX_ROLLOVER) {
        throw unprocessable(`At most ${MAX_ROLLOVER} residents can be continued at once (${current.length} found)`);
      }
      const rooms = await lockRooms(
        ctx,
        current.map(row => row.roomId),
        { dbc: tx }
      );
      const result = {
        fromAcademicYear: yearSummary(source),
        toAcademicYear: yearSummary(target),
        dryRun,
        continued: [],
        skipped: [],
        resources: includeResources ? { continued: [], skipped: [] } : null
      };

      for (const previous of current.sort((a, b) => a.bedNumber - b.bedNumber)) {
        const { room, hostel } = rooms.get(previous.roomId) ?? {};
        const entry = {
          allocationId: previous.id,
          student: {
            id: previous.studentId,
            studentCode: previous.student.studentCode,
            name: fullName(previous.student.user)
          },
          bed: room ? `bed ${previous.bedNumber} in ${roomLabel(room, hostel)}` : null
        };
        const skip = reason => result.skipped.push({ ...entry, reason });

        if (!room) {
          skip("The room no longer exists");
          continue;
        }
        if (previous.toDate === null) {
          skip("The stay has no end date, so it already continues");
          continue;
        }
        const years = await residents.activeYearIds(ctx, previous.studentId);
        if (!years.includes(source.id) && !years.includes(target.id)) {
          skip(`Not actively enrolled in ${source.yearName} or ${target.yearName} (left the school)`);
          continue;
        }
        const student = await residents.load(ctx, previous.studentId);
        const mismatch = genderMismatch(hostel, student.account);
        if (mismatch) {
          skip(mismatch);
          continue;
        }
        const booked = await hostelAllocationRepository.findOne(
          ctx.tenantId,
          [
            eq(allocations.status, "ACTIVE"),
            overlapsRange(allocations, range.fromDate, range.toDate),
            and(eq(allocations.roomId, previous.roomId), eq(allocations.bedNumber, previous.bedNumber))
          ],
          { dbc: tx, with: { student: studentColumns } }
        );
        if (booked) {
          skip(
            booked.studentId === previous.studentId
              ? `Already booked for ${target.yearName} (${describeRange(booked)})`
              : `The bed is booked by ${fullName(booked.student.user)} ${describeRange(booked)}`
          );
          continue;
        }
        const elsewhere = await hostelAllocationRepository.findOne(
          ctx.tenantId,
          [
            eq(allocations.studentId, previous.studentId),
            eq(allocations.status, "ACTIVE"),
            overlapsRange(allocations, range.fromDate, range.toDate),
            notInArray(allocations.id, [previous.id])
          ],
          { dbc: tx }
        );
        if (elsewhere) {
          skip(`Already has bed ${elsewhere.bedNumber} for ${target.yearName} (${describeRange(elsewhere)})`);
          continue;
        }

        const next = await hostelAllocationRepository.create(
          ctx.tenantId,
          {
            studentId: previous.studentId,
            hostelId: previous.hostelId,
            roomId: previous.roomId,
            bedNumber: previous.bedNumber,
            ...range,
            source: "ROLLOVER",
            previousAllocationId: previous.id,
            allocatedBy: ctx.userId,
            notes: previous.notes
          },
          { dbc: tx }
        );
        result.continued.push({ ...entry, newAllocationId: next.id });

        if (includeResources) {
          const outcome = await resourceAssignmentService.continueForRollover(
            ctx,
            { student, previous, next, lastDay: source.endDate, range },
            { dbc: tx }
          );
          const tag = rows => rows.map(row => ({ ...row, student: entry.student }));
          result.resources.continued.push(...tag(outcome.continued));
          result.resources.skipped.push(...tag(outcome.skipped));
        }
      }
      if (dryRun) throw new DryRun(result);
      return result;
    };

    try {
      return await guardOverlaps(() => transaction(run));
    } catch (error) {
      if (error instanceof DryRun) return error.result;
      throw error;
    }
  }
};
