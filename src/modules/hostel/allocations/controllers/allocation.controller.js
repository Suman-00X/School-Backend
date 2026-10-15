import { created, ok, paginated } from "../../../../common/http/responses.js";
import { fullName, roomLabel } from "../../shared/utils/hostel.util.js";
import { allocationService } from "../services/allocation.service.js";

/* "bed 2 in Room 101, Boys Hostel" */
const bedLabel = allocation => `bed ${allocation.bedNumber} in ${roomLabel(allocation.room, allocation.hostel)}`;
const studentName = allocation => fullName(allocation.student.user);

export const allocationController = {
  create: async (req, res) => {
    const allocation = await allocationService.create(req.context, req.body);
    return created(res, allocation, `${studentName(allocation)} allocated ${bedLabel(allocation)}`);
  },

  list: async (req, res) =>
    paginated(res, await allocationService.list(req.context, req.query), "Allocations retrieved successfully"),

  getById: async (req, res) =>
    ok(res, await allocationService.getById(req.context, req.params.allocationId), "Allocation retrieved successfully"),

  update: async (req, res) =>
    ok(
      res,
      await allocationService.update(req.context, req.params.allocationId, req.body),
      "Allocation updated successfully"
    ),

  vacate: async (req, res) => {
    const allocation = await allocationService.vacate(req.context, req.params.allocationId, req.body);
    return ok(res, allocation, `${studentName(allocation)} vacated ${bedLabel(allocation)} on ${allocation.vacatedOn}`);
  },

  /* 201: the move creates a new allocation (the old one is kept as VACATED) */
  transfer: async (req, res) => {
    const allocation = await allocationService.transfer(req.context, req.params.allocationId, req.body);
    return created(res, allocation, `${studentName(allocation)} moved to ${bedLabel(allocation)}`);
  }
};
