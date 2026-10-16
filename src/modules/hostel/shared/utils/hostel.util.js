import { GENDER_FOR_RESIDENTS, RESOURCE_TYPE_LABELS } from "../constants/hostel.constants.js";

export const fullName = user => (user ? [user.firstName, user.lastName].filter(Boolean).join(" ") : null);

/* "Room 101, Boys Hostel" */
export const roomLabel = (room, hostel) => `Room ${room.roomNumber}${hostel ? `, ${hostel.name}` : ""}`;

/* "L-12 (locker)", "Veg (mess plan)", "Stand 3 (bicycle stand)" */
export const resourceLabel = resource =>
  `${resource.name} (${(resource.customType ?? RESOURCE_TYPE_LABELS[resource.resourceType]).toLowerCase()})`;

/* Bed numbers 1..capacity that are not in `taken` */
export const freeBeds = (capacity, taken) => {
  const occupied = new Set(taken);
  return Array.from({ length: capacity }, (_, i) => i + 1).filter(bed => !occupied.has(bed));
};

/* null when the person may live in the hostel, otherwise why not.
   An account without a gender is not blocked: the school has not recorded it. */
export const genderMismatch = (hostel, user) => {
  const required = GENDER_FOR_RESIDENTS[hostel.residentGender];
  if (!required || !user?.gender || user.gender === required) return null;
  const residents = hostel.residentGender === "BOYS" ? "boys" : "girls";
  return `${fullName(user)} cannot stay in ${hostel.name}: it is a ${residents}' hostel and their recorded gender is ${user.gender}`;
};
