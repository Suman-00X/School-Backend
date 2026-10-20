import { and, count, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { db } from "../../../../common/database/postgres.js";
import { conflict, forbidden, notFound } from "../../../../common/http/errors.js";
import { CLASS_LEVELS } from "../../shared/constants/academic.constants.js";
import { sections } from "../../sections/models/section.schema.js";
import { subjectCodeService } from "../../subject-codes/index.js";
import { OUTSIDE_SCOPE, teachingScope } from "../../teacher-assignments/index.js";
import { classes } from "../models/class.schema.js";
import { classRepository } from "../repositories/class.repository.js";
import { levelInfo } from "../utils/classLevel.util.js";

const base = createCrudService(classRepository, { entity: "Class" });

/* The stored columns of a level: its name and order are never typed */
const fromLevel = level => {
  const { className, classOrder } = levelInfo(level);
  return { level, className, classOrder };
};

const sectionCount = async (ctx, classId) => {
  const [{ total }] = await db
    .select({ total: count() })
    .from(sections)
    .where(and(eq(sections.tenantId, ctx.tenantId), eq(sections.classId, classId), eq(sections.isActive, true)));
  return total;
};

export const classService = {
  ...base,

  /* A new class takes its level's default place in the subject codes (subject-codes) */
  create: async (ctx, { level, description }) => {
    const row = await classRepository.create(ctx.tenantId, { ...fromLevel(level), description });
    await subjectCodeService.assignDefaults(ctx, [row]);
    return row;
  },

  createMany: async (ctx, items) => {
    const rows = await classRepository.createMany(
      ctx.tenantId,
      items.map(({ level, description }) => ({ ...fromLevel(level), description }))
    );
    await subjectCodeService.assignDefaults(ctx, rows);
    return rows;
  },

  /* A class's level changes only while it has no sections (in any year): its students,
     marks and fees belong to that level. A class created before levels existed (no
     level) can always be given one. */
  update: async (ctx, classId, { level, description }) => {
    const existing = await classRepository.findById(ctx.tenantId, classId);
    if (!existing) throw notFound("Class");
    const changes = { description };
    if (level && level !== existing.level) {
      const { className } = levelInfo(level);
      const used = existing.level ? await sectionCount(ctx, classId) : 0;
      if (used) {
        throw conflict(
          `${existing.className} has ${used} section${used === 1 ? "" : "s"}, so it cannot become ${className}. Create ${className} as a new class instead.`
        );
      }
      Object.assign(changes, fromLevel(level));
    }
    const row = await base.update(ctx, classId, changes);
    if (changes.level) await subjectCodeService.levelChanged(ctx, row, existing.level);
    return row;
  },

  /* Every level, in order, with the class created for it (null when not created yet).
     Teachers see the ids of their own classes only (D-11). */
  levels: async ctx => {
    const created = await classRepository.findMany(ctx.tenantId, { conditions: [isNotNull(classes.level)] });
    const visible = await teachingScope.classIds(ctx);
    return CLASS_LEVELS.map(({ level, className, classOrder }) => {
      const klass = created.find(row => row.level === level);
      return {
        level,
        className,
        classOrder,
        created: Boolean(klass),
        classId: klass && (!visible || visible.includes(klass.id)) ? klass.id : null
      };
    });
  },

  /* Teachers: the classes of the sections they teach (D-11) */
  list: async (ctx, query) => {
    const visible = await teachingScope.classIds(ctx);
    return base.list(ctx, query, visible ? [visible.length ? inArray(classes.id, visible) : sql`false`] : []);
  },

  getById: async (ctx, classId) => {
    const row = await base.getById(ctx, classId);
    const visible = await teachingScope.classIds(ctx);
    if (visible && !visible.includes(classId)) throw forbidden(OUTSIDE_SCOPE);
    return row;
  },

  /* For other submodules */
  exists: (ctx, classId) => classRepository.exists(ctx.tenantId, [eq(classes.id, classId)]),

  /* null when missing */
  findById: (ctx, classId) => classRepository.findById(ctx.tenantId, classId),

  /* True when every id is an active class of the tenant */
  allExist: async (ctx, classIds) => {
    const unique = [...new Set(classIds)];
    return (await classRepository.count(ctx.tenantId, [inArray(classes.id, unique)])) === unique.length;
  }
};
