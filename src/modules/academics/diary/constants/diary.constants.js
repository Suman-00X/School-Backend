/* A line in a section's daily diary: what was done in class, what to do at home, what to
   bring or remember, and notes to the families (to the whole section, or to one student's
   parents). Classwork and homework belong to a subject. */
export const DIARY_ENTRY_KINDS = ["CLASSWORK", "HOMEWORK", "REMINDER", "NOTE"];

export const DIARY_KIND_LABELS = {
  CLASSWORK: "Classwork",
  HOMEWORK: "Homework",
  REMINDER: "Reminder",
  NOTE: "Note"
};

/* Kinds that name a subject */
export const SUBJECT_KINDS = ["CLASSWORK", "HOMEWORK"];

/* Kinds the families hear about when written (classwork and homework they read in the diary) */
export const NOTIFIED_KINDS = ["REMINDER", "NOTE"];

/* The longest range of days one request may summarise */
export const MAX_DAYS = 92;
