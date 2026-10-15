import { createCrudController } from "../../../../common/crud/crudController.js";
import { created } from "../../../../common/http/responses.js";
import { roomService } from "../services/room.service.js";

export const roomController = {
  ...createCrudController(roomService, { singular: "Room", plural: "Rooms", idParam: "roomId" }),

  create: async (req, res) => {
    const room = await roomService.create(req.context, req.body);
    return created(res, room, `Room ${room.roomNumber} added to ${room.hostel.name} with ${room.capacity} bed(s)`);
  }
};
