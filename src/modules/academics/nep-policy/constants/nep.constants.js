/* NEP 2020 school stages (5+3+3+4) and the grade levels in each. The Holistic Progress
   Card (PARAKH, NCERT) is designed per stage: a school picks the stages it uses it for. */
export const NEP_STAGES = [
  {
    stage: "FOUNDATIONAL",
    label: "Foundational",
    classes: "Nursery to UKG (Balvatika), Class 1 and 2",
    levels: ["NURSERY", "LKG", "UKG", "GRADE_1", "GRADE_2"]
  },
  { stage: "PREPARATORY", label: "Preparatory", classes: "Class 3 to 5", levels: ["GRADE_3", "GRADE_4", "GRADE_5"] },
  { stage: "MIDDLE", label: "Middle", classes: "Class 6 to 8", levels: ["GRADE_6", "GRADE_7", "GRADE_8"] },
  {
    stage: "SECONDARY",
    label: "Secondary",
    classes: "Class 9 to 12",
    levels: ["GRADE_9", "GRADE_10", "GRADE_11", "GRADE_12"]
  }
];
export const NEP_STAGE_KEYS = NEP_STAGES.map(s => s.stage);

/* PARAKH has published cards for the first three stages */
export const DEFAULT_HPC_STAGES = ["FOUNDATIONAL", "PREPARATORY", "MIDDLE"];

/* A class's stage by its grade level (null for a class without a level) */
export const stageOfLevel = level => NEP_STAGES.find(s => s.levels.includes(level)) ?? null;

/* UDISE+ school code: 11 digits */
export const UDISE_CODE = /^\d{11}$/;
