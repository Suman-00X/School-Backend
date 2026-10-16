/* What a file belongs to, and what kind of file it is */
export const OWNER_TYPES = ["TENANT", "STUDENT", "STAFF", "HOMEWORK", "SUBMISSION", "ANNOUNCEMENT", "GENERAL"];
/* Owners managed through /api/v1/files. Files of other owners (homework, submissions,
   the school logo) are reached only through their module, which applies its own access rules. */
export const DIRECT_OWNER_TYPES = ["STUDENT", "STAFF", "GENERAL"];

export const FILE_CATEGORIES = ["LOGO", "PHOTO", "DOCUMENT", "ATTACHMENT"];

const IMAGES = ["image/jpeg", "image/png", "image/webp"];
const OFFICE = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv"
];

/* Allowed content types and size per category */
export const CATEGORY_RULES = {
  LOGO: { types: IMAGES, maxBytes: 2 * 1024 * 1024 },
  PHOTO: { types: IMAGES, maxBytes: 5 * 1024 * 1024 },
  DOCUMENT: { types: [...OFFICE, ...IMAGES], maxBytes: 10 * 1024 * 1024 },
  ATTACHMENT: { types: [...OFFICE, ...IMAGES], maxBytes: 10 * 1024 * 1024 }
};

export const ANY_ALLOWED_TYPE = [...new Set(Object.values(CATEGORY_RULES).flatMap(rule => rule.types))];

/* Signed download links live this long */
export const DOWNLOAD_URL_SECONDS = 15 * 60;
