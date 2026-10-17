import { unprocessable } from "../../../../common/http/errors.js";
import { addDays } from "../../../../common/utils/date.util.js";
import { attendanceModeRuleRepository } from "../repositories/attendance.repository.js";

export const DEFAULT_MODE = "DAILY";

export const MODE_TEXT = {
  DAILY: "once a day",
  TWO_SESSIONS: "twice a day (forenoon and afternoon)",
  PERIOD_WISE: "period by period"
};

/* rules in effectiveFrom order -> date => the school's mode that day: the latest rule
   starting on or before it, else DAILY */
const timelineOf = rules => date => {
  let mode = DEFAULT_MODE;
  for (const rule of rules) {
    if (rule.effectiveFrom > date) break;
    mode = rule.mode;
  }
  return mode;
};

/* The mode is the same for the whole school; it changes over time, from a date on */
export const attendanceModeService = {
  /* -> date => mode, from one read of the school's rules */
  timeline: async (ctx, { dbc } = {}) => timelineOf(await attendanceModeRuleRepository.findMany(ctx.tenantId, { dbc })),

  modeOn: async (ctx, date, options) => (await attendanceModeService.timeline(ctx, options))(date),

  /* The modes over [from, to], calendar days: [{ mode, from, to }] */
  segments: async (ctx, from, to) => {
    if (from > to) return [];
    const rules = await attendanceModeRuleRepository.findMany(ctx.tenantId);
    const modeOn = timelineOf(rules);
    const starts = [from, ...rules.map(rule => rule.effectiveFrom).filter(day => day > from && day <= to)];
    return starts.reduce((segments, start, index) => {
      const end = index + 1 < starts.length ? addDays(starts[index + 1], -1) : to;
      const mode = modeOn(start);
      if (segments.at(-1)?.mode === mode) segments.at(-1).to = end;
      else segments.push({ mode, from: start, to: end });
      return segments;
    }, []);
  },

  /* For the policy: the school's mode today, and changes still to come */
  view: async (ctx, today) => {
    const rules = await attendanceModeRuleRepository.findMany(ctx.tenantId);
    return {
      mode: timelineOf(rules)(today),
      scheduled: rules
        .filter(rule => rule.effectiveFrom > today)
        .map(rule => ({ mode: rule.mode, effectiveFrom: rule.effectiveFrom }))
    };
  },

  /* Schedule the school's mode from one date (default: tomorrow). Runs in the caller's
     transaction, which holds the policy row FOR UPDATE; `today` is read after taking it.
     The change replaces or cancels the rules from that date on; choosing the mode
     already in force then only cancels them. It starts tomorrow at the earliest (D-66),
     so registers already taken never change meaning; a database trigger holds the same line. */
  schedule: async (ctx, { mode, effectiveFrom }, { dbc, today }) => {
    const tomorrow = addDays(today, 1);
    const from = effectiveFrom ?? tomorrow;
    if (from < tomorrow) {
      throw unprocessable(
        `A new attendance mode can start tomorrow (${tomorrow}) at the earliest. Choose ${tomorrow} or a later date.`
      );
    }
    await attendanceModeRuleRepository.retireFrom(ctx.tenantId, { from }, { dbc });
    if ((await attendanceModeService.modeOn(ctx, addDays(from, -1), { dbc })) !== mode) {
      await attendanceModeRuleRepository.create(
        ctx.tenantId,
        { mode, effectiveFrom: from, setBy: ctx.userId },
        { dbc }
      );
    }
    return { effectiveFrom: from, mode };
  }
};
