import { CLASS_LEVELS } from "../../shared/constants/academic.constants.js";

const BY_LEVEL = new Map(CLASS_LEVELS.map(entry => [entry.level, entry]));
const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii"];

/* "Nursery, LKG, UKG, Class 1 … Class 12" */
export const LEVEL_NAMES = `${CLASS_LEVELS.slice(0, 4)
  .map(l => l.className)
  .join(", ")} … ${CLASS_LEVELS.at(-1).className}`;

/* { level, className, classOrder, label } of a level, or undefined */
export const levelInfo = level => BY_LEVEL.get(level);

/* A class name as people write it -> its level, or null. Deliberately small:
   "Nursery", "LKG" / "L.K.G.", "UKG", and 1-12 as "Class 1", "class-1", "Grade 1",
   "Std 1", "Standard 1", "1", "I" … "XII" (any case and spacing), or a level key ("GRADE_1"). */
export const levelFromName = text => {
  if (typeof text !== "string") return null;
  const words = text
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[\s_-]+/g, " ")
    .trim();
  if (words === "nursery") return "NURSERY";
  if (words === "lkg" || words === "l k g") return "LKG";
  if (words === "ukg" || words === "u k g") return "UKG";

  const numbered = /^(?:(?:class|grade|std|standard) ?)?(\d{1,2}|[ivx]+)$/.exec(words);
  if (!numbered) return null;
  const [, number] = numbered;
  const grade = /^\d/.test(number) ? Number(number) : ROMAN.indexOf(number) + 1;
  return grade >= 1 && grade <= 12 ? `GRADE_${grade}` : null;
};

/* What stands for a class in generated codes: the level's label, or the order of a
   class created before levels existed */
export const classCodeLabel = klass => levelInfo(klass.level)?.label ?? String(klass.classOrder);
