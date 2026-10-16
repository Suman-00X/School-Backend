import { created, ok, paginated } from "../../../../common/http/responses.js";
import { describeRange } from "../../shared/utils/dateRange.util.js";
import { fullName, roomLabel } from "../../shared/utils/hostel.util.js";
import { allocationService } from "../services/allocation.service.js";
import { availabilityService } from "../services/availability.service.js";
import { rolloverService } from "../services/rollover.service.js";

/* "bed 2 in Room 101, Boys Hostel" */
const bedLabel = allocation => `bed ${allocation.bedNumber} in ${roomLabel(allocation.room, allocation.hostel)}`;
const studentName = allocation => fullName(allocation.student.user);

export const allocationController = {
  create: async (req, res) => {
    const allocation = await allocationService.create(req.context, req.body);
    return created(
      res,
      allocation,
      `${studentName(allocation)} allocated ${bedLabel(allocation)} ${describeRange(allocation)}`
    );
  },

  list: async (req, res) =>
    paginated(res, await allocationService.list(req.context, req.query), "Allocations retrieved successfully"),

  getById: async (req, res) =>
    ok(res, await allocationService.getById(req.context, req.params.allocationId), "Allocation retrieved successfully"),

  update: async (req, res) => {
    const allocation = await allocationService.update(req.context, req.params.allocationId, req.body);
    return ok(res, allocation, `${studentName(allocation)} has ${bedLabel(allocation)} ${describeRange(allocation)}`);
  },

  vacate: async (req, res) => {
    const allocation = await allocationService.vacate(req.context, req.params.allocationId, req.body);
    return ok(res, allocation, `${studentName(allocation)} vacated ${bedLabel(allocation)} on ${allocation.toDate}`);
  },

  cancel: async (req, res) => {
    const allocation = await allocationService.cancel(req.context, req.params.allocationId, req.body);
    return ok(
      res,
      allocation,
      `Booking of ${bedLabel(allocation)} for ${studentName(allocation)} ${describeRange(allocation)} cancelled`
    );
  },

  /* 201: the move creates a new allocation (the old one ends the day before) */
  transfer: async (req, res) => {
    const allocation = await allocationService.transfer(req.context, req.params.allocationId, req.body);
    return created(
      res,
      allocation,
      `${studentName(allocation)} moves to ${bedLabel(allocation)} from ${allocation.fromDate}`
    );
  },

  availability: async (req, res) => {
    const result = await availabilityService.beds(req.context, req.query);
    return ok(res, result, `${result.totals.free} bed(s) free ${describeRange(result)}`);
  },

  /* 201 when allocations were created; a dry run (or nothing to continue) is 200 */
  rollover: async (req, res) => {
    const result = await rolloverService.rollover(req.context, req.body);
    const { continued, skipped, toAcademicYear } = result;
    const message =
      `${continued.length} resident(s) ${result.dryRun ? "would continue" : "continued"} into ${toAcademicYear.yearName}` +
      (skipped.length ? ` (${skipped.length} skipped)` : "");
    return !result.dryRun && continued.length ? created(res, result, message) : ok(res, result, message);
  }
};
