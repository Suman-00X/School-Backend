import { eq } from "drizzle-orm";
import { ROLES } from "../../../../common/auth/roles.js";
import { transaction } from "../../../../common/database/postgres.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { notificationService } from "../../../communication/notifications/index.js";
import { accountService } from "../../../users/accounts/index.js";
import { resourceAssignmentService } from "../../resource-assignments/index.js";
import { residents } from "../../shared/services/residents.service.js";
import { notEnded } from "../../shared/utils/dateRange.util.js";
import { resourceLabel, roomLabel } from "../../shared/utils/hostel.util.js";
import { hostelAllocations as allocations } from "../models/hostelAllocation.schema.js";
import { hostelAllocationRepository } from "../repositories/hostelAllocation.repository.js";
import { allocationInternals } from "./allocation.service.js";

const { ending } = allocationInternals;

/* "Released bed 1 in Room 101, Boys Hostel (last night 2026-10-16). Cancelled bed 2 in Room 103 from 2027-06-01." */
const summary = (student, day, beds, resources) => {
  const lines = beds.map(({ allocation, change }) => {
    const bed = `bed ${allocation.bedNumber} in ${roomLabel(allocation.room, allocation.hostel)}`;
    return change === "CANCELLED"
      ? `Cancelled the booking of ${bed} from ${allocation.fromDate}.`
      : `Released ${bed} (last night ${day}).`;
  });
  const ended = resources.filter(r => r.change !== "CANCELLED").map(r => resourceLabel(r.resource));
  const cancelled = resources.filter(r => r.change === "CANCELLED").map(r => resourceLabel(r.resource));
  if (ended.length) lines.push(`Ended: ${ended.join(", ")}.`);
  if (cancelled.length) lines.push(`Cancelled upcoming: ${cancelled.join(", ")}.`);
  return {
    title: `Hostel: ${student.name} left the school`,
    body: `${student.name} (${student.studentCode}) left the school on ${day}. ${lines.join(" ")}`
  };
};

export const leaverService = {
  /* A student who left the school gives up their hostel place from today: current allocations
     and resources end today, upcoming ones are cancelled (reason LEFT_SCHOOL), and hostel
     managers are told in-app. Nothing happens while the student is still actively enrolled in
     some year (e.g. an old year's enrollment closed after they joined the next one).
     The notification is written inside the transaction, so a failure retries the whole job. */
  release: async (ctx, studentId) => {
    if ((await residents.activeYearIds(ctx, studentId)).length) return null;
    const day = await tenantToday(ctx.tenantId);
    const student = await residents.load(ctx, studentId);

    return transaction(async tx => {
      const rows = await hostelAllocationRepository.lockManyForUpdate(
        ctx.tenantId,
        [eq(allocations.studentId, studentId), notEnded(allocations, day)],
        { dbc: tx }
      );
      const beds = [];
      const resources = [];
      for (const before of rows.sort((a, b) => a.fromDate.localeCompare(b.fromDate))) {
        const upcoming = before.fromDate > day;
        if (!upcoming && before.toDate === day) continue;
        const after = await hostelAllocationRepository.update(
          ctx.tenantId,
          before.id,
          upcoming
            ? { status: "CANCELLED", ...ending(ctx, "LEFT_SCHOOL") }
            : { toDate: day, ...ending(ctx, "LEFT_SCHOOL") },
          { dbc: tx }
        );
        resources.push(
          ...(await resourceAssignmentService.followAllocation(ctx, before, after, { dbc: tx, reason: "LEFT_SCHOOL" }))
        );
        beds.push({ allocationId: before.id, change: upcoming ? "CANCELLED" : "ENDED" });
      }
      /* Standalone resources (a day scholar's mess plan), and any tied ones still running */
      resources.push(
        ...(await resourceAssignmentService.endForStudent(ctx, studentId, day, { dbc: tx, reason: "LEFT_SCHOOL" }))
      );
      if (!beds.length && !resources.length) return { beds, resources };

      const details = await hostelAllocationRepository.findManyByIds(
        ctx.tenantId,
        beds.map(bed => bed.allocationId),
        { dbc: tx, with: { room: { columns: { roomNumber: true } }, hostel: { columns: { name: true } } } }
      );
      const managers = (await accountService.findByRoles(ctx, [ROLES.HOSTEL_MANAGER])).filter(
        account => account.status === "ACTIVE"
      );
      await notificationService.notify(ctx, {
        userIds: managers.map(account => account.id),
        type: "MESSAGE",
        ...summary(
          student,
          day,
          beds.map(bed => ({ ...bed, allocation: details.find(row => row.id === bed.allocationId) })),
          resources
        ),
        data: { studentId, beds: beds.map(bed => bed.allocationId), on: day },
        channels: ["IN_APP"]
      });
      return { beds, resources };
    });
  }
};
