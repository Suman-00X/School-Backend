import { roomService } from "../../rooms/index.js";
import { freeBeds } from "../../shared/utils/hostel.util.js";
import { allocationService } from "./allocation.service.js";

const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);

export const availabilityService = {
  /* Beds free for the whole of [fromDate, toDate] (toDate omitted: from fromDate on) in rooms
     that take residents (AVAILABLE), per hostel and per room type */
  beds: async (ctx, { fromDate, toDate = null, hostelId, roomType }) => {
    const rooms = await roomService.findBookable(ctx, { hostelId, roomType });
    const bookings = await allocationService.bookedBeds(
      ctx,
      rooms.map(room => room.id),
      { fromDate, toDate },
      { withStudent: false }
    );

    const hostels = new Map();
    for (const room of rooms) {
      const free = freeBeds(
        room.capacity,
        bookings.filter(booking => booking.roomId === room.id).map(booking => booking.bedNumber)
      );
      if (!hostels.has(room.hostel.id)) hostels.set(room.hostel.id, { ...room.hostel, rooms: [] });
      hostels.get(room.hostel.id).rooms.push({
        id: room.id,
        roomNumber: room.roomNumber,
        floor: room.floor,
        roomType: room.roomType,
        monthlyFee: room.monthlyFee,
        capacity: room.capacity,
        free: free.length,
        freeBeds: free
      });
    }

    const result = [...hostels.values()].map(hostel => {
      const types = new Map();
      for (const room of hostel.rooms) {
        const key = room.roomType ?? null;
        if (!types.has(key)) types.set(key, { roomType: key, rooms: 0, capacity: 0, free: 0 });
        const type = types.get(key);
        type.rooms++;
        type.capacity += room.capacity;
        type.free += room.free;
      }
      return {
        ...hostel,
        capacity: sum(hostel.rooms, "capacity"),
        free: sum(hostel.rooms, "free"),
        byRoomType: [...types.values()],
        rooms: hostel.rooms
      };
    });

    return {
      fromDate,
      toDate,
      totals: {
        hostels: result.length,
        rooms: rooms.length,
        capacity: sum(result, "capacity"),
        free: sum(result, "free")
      },
      hostels: result
    };
  }
};
