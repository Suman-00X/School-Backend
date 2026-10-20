import { and, asc, eq, inArray } from "drizzle-orm";
import { db, transaction } from "../../../../common/database/postgres.js";
import { conflict, unprocessable } from "../../../../common/http/errors.js";
import { classSubjects } from "../../class-subjects/models/classSubject.schema.js";
import { classes } from "../../classes/models/class.schema.js";
import { subjects } from "../../subjects/models/subject.schema.js";
import { DEFAULT_CODE_SLOTS } from "../../shared/constants/academic.constants.js";
import { classSubjectCode } from "../../shared/utils/codes.util.js";
import { classCodeSlotRepository as slots } from "../repositories/classCodeSlot.repository.js";

const place = slot => `${slot.stage}-${slot.position}`;
const key = row => `${row.classId}:${row.academicYearId}:${row.subjectId}`;
const defaultOf = level => {
  const [stage, position] = DEFAULT_CODE_SLOTS[level] ?? [];
  return stage ? { stage, position } : null;
};
const listNames = names => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]);

const activeClasses = (ctx, dbc = db) =>
  dbc.query.classes.findMany({
    where: and(eq(classes.tenantId, ctx.tenantId), eq(classes.isActive, true)),
    orderBy: asc(classes.classOrder)
  });

const subjectCodes = async (ctx, subjectIds, dbc = db) =>
  new Map(
    (
      await dbc
        .select({ id: subjects.id, subjectCode: subjects.subjectCode })
        .from(subjects)
        .where(inArray(subjects.id, [...new Set(subjectIds)]))
    ).map(s => [s.id, s.subjectCode])
  );

/* 409 when any of the class subjects' codes is in use: an exam paper or assessment has it, or its
   year is archived. `what` says what would change ("Mathematics in Class 2 cannot become optional"). */
const assertUnused = async (ctx, rows, what, { dbc } = {}) => {
  if (rows.some(r => r.archived)) {
    throw conflict(`${what}: its codes belong to an archived year`);
  }
  const used = await slots.usedKeys(ctx.tenantId, rows, { dbc });
  const inUse = rows.filter(r => used.has(key(r)));
  if (inUse.length) {
    throw conflict(`${what}: ${listNames(inUse.map(r => r.code))} already used by exam papers or assessments`);
  }
};

/* Rebuilds the codes of class subjects (rows from the repository) from their class's place and
   subject; `overrides` replaces a value for every row ({ subjectCode } on a rename) */
const recode = async (ctx, rows, overrides = {}, { dbc } = {}) => {
  if (!rows.length) return [];
  const classPlaces = new Map(
    (await slots.findMany(ctx.tenantId, { conditions: [inArray(slots.table.classId, [...new Set(rows.map(r => r.classId))])], dbc })).map(
      s => [s.classId, s]
    )
  );
  const codes = overrides.subjectCode ? null : await subjectCodes(ctx, rows.map(r => r.subjectId), dbc);
  const changes = rows
    .map(row => {
      const slot = classPlaces.get(row.classId);
      if (!slot) return null;
      const subjectCode = overrides.subjectCode ?? codes.get(row.subjectId);
      const isOptional = overrides.isOptional ?? row.isOptional;
      return { id: row.id, code: classSubjectCode({ subjectCode, ...slot, isOptional }) };
    })
    .filter(change => change && change.code !== rows.find(r => r.id === change.id).code);
  await slots.recode(ctx.tenantId, changes, { dbc });
  return changes;
};

export const subjectCodeService = {
  /* Policy › Subject codes: every class in order with its place, its level's default place,
     and `locked` when its codes are in use (exam papers, assessments, an archived year) */
  getSlots: async ctx => {
    const [all, placed, used, archived] = await Promise.all([
      activeClasses(ctx),
      slots.findMany(ctx.tenantId),
      slots.usedClassIds(ctx.tenantId),
      slots.archivedClassIds(ctx.tenantId)
    ]);
    return all.map(klass => {
      const slot = placed.find(s => s.classId === klass.id);
      const fallback = defaultOf(klass.level);
      return {
        classId: klass.id,
        className: klass.className,
        level: klass.level,
        classOrder: klass.classOrder,
        stage: slot?.stage ?? null,
        position: slot?.position ?? null,
        defaultStage: fallback?.stage ?? null,
        defaultPosition: fallback?.position ?? null,
        locked: used.has(klass.id) || archived.has(klass.id)
      };
    });
  },

  /* Sets the places of the classes sent (the others keep theirs). A class whose codes are in use
     keeps its place; every other moved class's subject codes are rebuilt. -> { slots, recoded } */
  saveSlots: async (ctx, input) => {
    const all = await activeClasses(ctx);
    const byId = new Map(all.map(k => [k.id, k]));
    const unknown = input.filter(s => !byId.has(s.classId));
    if (unknown.length) throw unprocessable("classId does not refer to an existing class");

    const current = await slots.findMany(ctx.tenantId);
    const merged = new Map(current.filter(s => byId.has(s.classId)).map(s => [s.classId, s]));
    for (const s of input) merged.set(s.classId, s);
    const byPlace = new Map();
    for (const [classId, s] of merged) byPlace.set(place(s), [...(byPlace.get(place(s)) ?? []), byId.get(classId).className]);
    const shared = [...byPlace].find(([, names]) => names.length > 1);
    if (shared) throw unprocessable(`${listNames(shared[1])} cannot share place ${shared[0]}`);

    const moved = input.filter(s => {
      const before = current.find(c => c.classId === s.classId);
      return !before || place(before) !== place(s);
    });
    if (!moved.length) return { slots: await subjectCodeService.getSlots(ctx), recoded: 0 };

    const [used, archived] = await Promise.all([slots.usedClassIds(ctx.tenantId), slots.archivedClassIds(ctx.tenantId)]);
    const locked = moved.filter(s => used.has(s.classId) || archived.has(s.classId));
    if (locked.length) {
      const names = locked.map(s => byId.get(s.classId).className);
      throw conflict(
        `${listNames(names)} keep${names.length === 1 ? "s" : ""} ${names.length === 1 ? "its" : "their"} place: subject codes already used by exam papers, assessments or an archived year`
      );
    }

    const movedIds = moved.map(s => s.classId);
    const recoded = await transaction(async dbc => {
      await slots.removeForClasses(ctx.tenantId, movedIds, { dbc });
      await slots.createMany(
        ctx.tenantId,
        moved.map(({ classId, stage, position }) => ({ classId, stage, position })),
        { dbc }
      );
      const rows = await slots.classSubjects(ctx.tenantId, [inArray(classSubjects.classId, movedIds)], { dbc });
      return (await recode(ctx, rows, {}, { dbc })).length;
    });
    return { slots: await subjectCodeService.getSlots(ctx), recoded };
  },

  /* For classes: new classes take their level's default place when no class has it */
  assignDefaults: async (ctx, newClasses, { dbc } = {}) => {
    const taken = new Set((await slots.findMany(ctx.tenantId, { dbc })).map(place));
    const rows = [];
    for (const klass of newClasses) {
      const fallback = defaultOf(klass.level);
      if (!fallback || taken.has(place(fallback))) continue;
      taken.add(place(fallback));
      rows.push({ classId: klass.id, ...fallback });
    }
    if (rows.length) await slots.createMany(ctx.tenantId, rows, { dbc });
  },

  /* For classes: a class given another level (only while it has no sections) moves to the new
     level's default place when it still had the old level's and the new one is free */
  levelChanged: async (ctx, klass, previousLevel, { dbc } = {}) => {
    const slot = await slots.findOne(ctx.tenantId, [eq(slots.table.classId, klass.id)], { dbc });
    const before = defaultOf(previousLevel);
    const after = defaultOf(klass.level);
    if (slot && (!before || place(slot) !== place(before))) return;
    if (!after || (await slots.exists(ctx.tenantId, [eq(slots.table.stage, after.stage), eq(slots.table.position, after.position)], { dbc })))
      return;
    if (slot) await slots.removeForClasses(ctx.tenantId, [klass.id], { dbc });
    await slots.create(ctx.tenantId, { classId: klass.id, ...after }, { dbc });
    const rows = await slots.classSubjects(ctx.tenantId, [eq(classSubjects.classId, klass.id)], { dbc });
    await recode(ctx, rows, {}, { dbc });
  },

  /* For class subjects: the code of a subject in a class. 422 while the class has no place. */
  codeFor: async (ctx, { classId, subjectCode, isOptional }, { dbc } = {}) => {
    const slot = await slots.findOne(ctx.tenantId, [eq(slots.table.classId, classId)], { dbc });
    if (!slot) {
      const klass = await (dbc ?? db).query.classes.findFirst({ where: eq(classes.id, classId) });
      throw unprocessable(`${klass?.className ?? "The class"} has no place in the subject codes yet: set it under Policy › Subject codes`);
    }
    return classSubjectCode({ subjectCode, ...slot, isOptional });
  },

  /* For class subjects: required <-> optional changes the last digit, only while the code is unused */
  changeOptional: async (ctx, { id, subjectName, className }, isOptional, { dbc } = {}) => {
    const rows = await slots.classSubjects(ctx.tenantId, [eq(classSubjects.id, id)], { dbc });
    await assertUnused(ctx, rows, `${subjectName} in ${className} cannot become ${isOptional ? "optional" : "required"}`, { dbc });
    return recode(ctx, rows, { isOptional }, { dbc });
  },

  /* For subjects: a new subject code renames its class subjects' codes, only while none is used */
  checkRename: async (ctx, subject, { dbc } = {}) => {
    const rows = await slots.classSubjects(ctx.tenantId, [eq(classSubjects.subjectId, subject.id)], { dbc });
    await assertUnused(ctx, rows, `${subject.subjectName}'s code cannot change`, { dbc });
    return rows;
  },

  renamed: (ctx, rows, subjectCode, { dbc } = {}) => recode(ctx, rows, { subjectCode }, { dbc })
};
