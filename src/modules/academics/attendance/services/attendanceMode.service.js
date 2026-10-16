import { conflict, unprocessable } from "../../../../common/http/errors.js";
import { addDays } from "../../../../common/utils/date.util.js";
import { classService } from "../../classes/index.js";
import { attendanceModeRuleRepository, attendanceSessionRepository } from "../repositories/attendance.repository.js";

export const DEFAULT_MODE = "DAILY";

export const MODE_TEXT = {
  DAILY: "once a day",
  TWO_SESSIONS: "twice a day (forenoon and afternoon)",
  PERIOD_WISE: "period by period"
};

/* The rule in force on `date` among rules sorted by effectiveFrom */
const inForce = (rules = [], date) => {
  let found = null;
  for (const rule of rules) {
    if (rule.effectiveFrom > date) break;
    found = rule;
  }
  return found;
};

/* rules -> (classId, date) => mode. A class's own rule wins; mode null follows the school. */
const resolverOf = rules => {
  const sorted = [...rules].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const school = sorted.filter(rule => !rule.classId);
  const byClass = new Map();
  for (const rule of sorted.filter(r => r.classId)) {
    if (!byClass.has(rule.classId)) byClass.set(rule.classId, []);
    byClass.get(rule.classId).push(rule);
  }
  return (classId, date) =>
    (classId && inForce(byClass.get(classId), date)?.mode) || inForce(school, date)?.mode || DEFAULT_MODE;
};

export const attendanceModeService = {
  /* -> (classId, date) => mode, from one read of the school's rules */
  resolver: async (ctx, { dbc } = {}) => resolverOf(await attendanceModeRuleRepository.findMany(ctx.tenantId, { dbc })),

  modeOn: async (ctx, classId, date, options) => (await attendanceModeService.resolver(ctx, options))(classId, date),

  /* For the policy: the school's mode today, classes that differ today, and changes still to come */
  view: async (ctx, today) => {
    const rules = await attendanceModeRuleRepository.findMany(ctx.tenantId, {
      with: { class: { columns: { id: true, className: true, classOrder: true } } }
    });
    const resolve = resolverOf(rules);
    const schoolMode = resolve(null, today);
    const classes = new Map(rules.filter(rule => rule.class).map(rule => [rule.classId, rule.class]));
    return {
      mode: schoolMode,
      classModes: [...classes.values()]
        .sort((a, b) => a.classOrder - b.classOrder)
        .map(c => ({ classId: c.id, className: c.className, mode: resolve(c.id, today) }))
        .filter(c => c.mode !== schoolMode),
      scheduled: rules
        .filter(rule => rule.effectiveFrom > today)
        .map(rule => ({
          classId: rule.classId,
          className: rule.class?.className ?? null,
          mode: rule.mode,
          effectiveFrom: rule.effectiveFrom
        }))
    };
  },

  /* Schedule a school mode and/or class overrides from one date (default: tomorrow).
     Runs in the caller's transaction, which holds the policy row FOR UPDATE.
     A rule replaces or cancels the same scope's rules from that date on. It may start
     today or earlier only while no register exists from that date, so registers
     already taken never change meaning. */
  schedule: async (ctx, { mode, classModes = [], effectiveFrom }, { dbc, today }) => {
    const from = effectiveFrom ?? addDays(today, 1);
    const classIds = classModes.map(c => c.classId);
    if (classIds.length && !(await classService.allExist(ctx, classIds))) {
      throw unprocessable("classModes: one or more classes do not exist");
    }

    if (from <= today) {
      const latest = await attendanceSessionRepository.latestFrom(ctx.tenantId, from, {
        classIds: mode ? undefined : classIds,
        dbc
      });
      if (latest) {
        throw conflict(
          `${latest.className}-${latest.sectionName} already has registers up to ${latest.date}, and a mode change cannot reach back over registers already taken. Start it on ${addDays(latest.date, 1)} or later.`
        );
      }
    }

    const scopes = [...(mode ? [{ classId: null, mode }] : []), ...classModes];
    for (const scope of scopes) {
      await attendanceModeRuleRepository.retireFrom(ctx.tenantId, { classId: scope.classId, from }, { dbc });
      await attendanceModeRuleRepository.create(
        ctx.tenantId,
        { classId: scope.classId, mode: scope.mode, effectiveFrom: from, setBy: ctx.userId },
        { dbc }
      );
    }
    const named = await Promise.all(classModes.map(c => classService.findById(ctx, c.classId)));
    return {
      effectiveFrom: from,
      mode: mode ?? null,
      classModes: classModes.map((c, index) => ({ ...c, className: named[index].className }))
    };
  }
};
