import { sql } from "drizzle-orm";
import { check, date, index, integer, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { VEHICLE_STATUSES } from "../../shared/constants/transport.constants.js";

export const vehicleStatus = pgEnum("vehicle_status", VEHICLE_STATUSES);

/* A school bus or van, its crew and its compliance documents.
   registration_number is stored upper-case without spaces or hyphens (KA01AB1234). */
export const transportVehicles = pgTable(
  "transport_vehicles",
  {
    ...baseColumns(),
    registrationNumber: text("registration_number").notNull(),
    make: text("make"),
    model: text("model"),
    /* Seats for students */
    capacity: integer("capacity").notNull(),
    driverName: text("driver_name"),
    driverPhone: text("driver_phone"),
    driverLicenseNumber: text("driver_license_number"),
    attendantName: text("attendant_name"),
    attendantPhone: text("attendant_phone"),
    insuranceExpiresOn: date("insurance_expires_on"),
    fitnessCertificateExpiresOn: date("fitness_certificate_expires_on"),
    permitExpiresOn: date("permit_expires_on"),
    status: vehicleStatus("status").notNull().default("ACTIVE"),
    notes: text("notes")
  },
  t => [
    uniqueIndex("transport_vehicles_tenant_registration_uq").on(t.tenantId, t.registrationNumber).where(activeRows(t)),
    index("transport_vehicles_tenant_status_idx").on(t.tenantId, t.status),
    check("transport_vehicles_capacity_chk", sql`${t.capacity} > 0`),
    check("transport_vehicles_registration_chk", sql`${t.registrationNumber} = upper(${t.registrationNumber})`)
  ]
);
