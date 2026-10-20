/* The Holistic Progress Card (PARAKH, NCERT; NEP 2020): per subject, what the student
   shows across three abilities, at one of three levels, from the teacher, the student
   (self) and classmates (peer); plus the student's interests and the teacher's and
   parents' feedback. */
export const HPC_ABILITIES = [
  { key: "awareness", label: "Awareness" },
  { key: "sensitivity", label: "Sensitivity" },
  { key: "creativity", label: "Creativity" }
];

export const HPC_LEVELS = ["BEGINNER", "PROFICIENT", "ADVANCED"];

/* The Foundational card shows the levels as pictures: stream, mountain, sky */
const LEVEL_LABELS = {
  FOUNDATIONAL: { BEGINNER: "Stream", PROFICIENT: "Mountain", ADVANCED: "Sky" },
  DEFAULT: { BEGINNER: "Beginner", PROFICIENT: "Proficient", ADVANCED: "Advanced" }
};

export const levelsFor = stage =>
  HPC_LEVELS.map(value => ({ value, label: (LEVEL_LABELS[stage] ?? LEVEL_LABELS.DEFAULT)[value] }));

/* The free-text parts of the card, in print order */
export const HPC_REFLECTIONS = [
  { key: "interests", label: "All about me: my interests" },
  { key: "strengths", label: "Strengths" },
  { key: "areasToImprove", label: "Areas to work on" },
  { key: "teacherRemark", label: "Teacher's feedback" },
  { key: "parentFeedback", label: "Parent's feedback" }
];
