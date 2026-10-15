/* Enum values used by the transport module's tables and validators (single source) */
export const VEHICLE_STATUSES = ["ACTIVE", "IN_MAINTENANCE", "RETIRED"];
export const ASSIGNMENT_DIRECTIONS = ["BOTH", "PICKUP_ONLY", "DROP_ONLY"];
export const ASSIGNMENT_STATUSES = ["ACTIVE", "ENDED"];

/* Compliance documents a vehicle carries, by the column holding the expiry date */
export const VEHICLE_DOCUMENTS = [
  { field: "insuranceExpiresOn", document: "INSURANCE", label: "Insurance" },
  { field: "fitnessCertificateExpiresOn", document: "FITNESS_CERTIFICATE", label: "Fitness certificate" },
  { field: "permitExpiresOn", document: "PERMIT", label: "Permit" }
];

/* Window used for `expiringDocuments` when the request names none */
export const DEFAULT_EXPIRY_WINDOW_DAYS = 30;
