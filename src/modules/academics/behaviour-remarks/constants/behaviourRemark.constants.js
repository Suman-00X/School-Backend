/* A behaviour remark in a student's log book: what kind of entry it is (praise to a serious
   incident), and what it is about. Kinds are a database enum; categories are checked here
   only, so the school's list can grow without a migration. */
export const REMARK_KINDS = ["APPRECIATION", "NOTE", "CONCERN", "INCIDENT"];

export const REMARK_KIND_LABELS = {
  APPRECIATION: "Appreciation",
  NOTE: "Note",
  CONCERN: "Concern",
  INCIDENT: "Serious incident"
};

export const REMARK_CATEGORIES = [
  { key: "DISCIPLINE", label: "Discipline" },
  { key: "PUNCTUALITY", label: "Punctuality" },
  { key: "UNIFORM", label: "Uniform & grooming" },
  { key: "CLASSWORK", label: "Classwork & homework" },
  { key: "PARTICIPATION", label: "Participation" },
  { key: "RESPECT", label: "Respect & manners" },
  { key: "KINDNESS", label: "Kindness & teamwork" },
  { key: "LEADERSHIP", label: "Leadership" },
  { key: "SAFETY", label: "Safety" },
  { key: "OTHER", label: "Other" }
];

export const REMARK_CATEGORY_KEYS = REMARK_CATEGORIES.map(c => c.key);
