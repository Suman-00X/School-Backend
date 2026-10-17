import { ATTENDANCE_STATUSES, ATTENDANCE_WEIGHT as WEIGHT } from "../../shared/constants/academic.constants.js";

/* Attendance arithmetic for every mode (pure functions, D-07 weights: PRESENT and
   LATE = 1, HALF_DAY = 0.5, ABSENT = 0, EXCUSED left out of the denominator).

   A day of a student is { status, credit, countable }:
   - DAY register: credit = weight of the mark; countable = 0 when EXCUSED, else 1.
   - FORENOON / AFTERNOON: each session is half a day. credit = Σ 0.5 × weight;
     countable = Σ 0.5 per session not EXCUSED (a session not taken counts 0.5, credit 0).
   - PERIOD registers: the day is PRESENT (credit 1) when attended periods ÷ periods
     held (minus EXCUSED) reaches the school's threshold, else ABSENT (credit 0);
     every period EXCUSED -> EXCUSED (countable 0). The periods themselves are summed
     separately for the period percentage, and per subject (each with its own
     percentage, and the days with at least one attended period of it).
   - No mark at all: unmarked (status null, credit 0, countable 1), as before. */

const KEYS = { DAY: "DAY", FORENOON: "FN", AFTERNOON: "AN" };
const SESSIONS = ["FORENOON", "AFTERNOON"];

/* A register's short name in a day: DAY, FN, AN, P1, P2 … */
export const registerKey = ({ kind, periodNumber }) => (kind === "PERIOD" ? `P${periodNumber}` : KEYS[kind]);

export const percentOf = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

const round2 = value => Math.round(value * 100) / 100;

export const emptyCounts = () => Object.fromEntries(ATTENDANCE_STATUSES.map(status => [status, 0]));

const emptyTally = () => ({ held: 0, attended: 0, excused: 0 });

/* One period's mark into a { held, attended, excused } tally */
const countPeriod = (tally, status) => {
  tally.held++;
  tally.attended += status ? WEIGHT[status] : 0;
  if (status === "EXCUSED") tally.excused++;
};

const addTally = (tally, more) => {
  tally.held += more.held;
  tally.attended += more.attended;
  tally.excused += more.excused;
};

const withPercentage = tally => {
  tally.attended = round2(tally.attended);
  tally.percentage = percentOf(tally.attended, tally.held - tally.excused);
  return tally;
};

/* One student's day. registers: the section's registers that day ({ kind, periodNumber },
   periods also { subjectId, subjectName }); marks: Map(registerKey -> { status }) of the
   student's marks that day */
export const dayOf = (registers, marks, threshold) => {
  const statusIn = register => marks.get(registerKey(register))?.status;
  if (!registers.some(statusIn)) return { status: null, credit: 0, countable: 1 };

  const periods = registers.filter(register => register.kind === "PERIOD");
  if (periods.length) {
    const summary = emptyTally();
    const subjects = new Map();
    for (const period of periods) {
      const status = statusIn(period);
      countPeriod(summary, status);
      if (!period.subjectId) continue;
      if (!subjects.has(period.subjectId)) {
        subjects.set(period.subjectId, { subjectId: period.subjectId, name: period.subjectName, ...emptyTally() });
      }
      countPeriod(subjects.get(period.subjectId), status);
    }
    const day = { periods: summary, subjects: [...subjects.values()] };
    const countable = summary.held - summary.excused;
    if (!countable) return { status: "EXCUSED", credit: 0, countable: 0, ...day };
    const present = summary.attended * 100 >= threshold * countable;
    return { status: present ? "PRESENT" : "ABSENT", credit: present ? 1 : 0, countable: 1, ...day };
  }

  if (registers.some(register => SESSIONS.includes(register.kind))) {
    const halves = SESSIONS.map(kind => statusIn({ kind }));
    const credit = halves.reduce((total, status) => total + (status ? WEIGHT[status] / 2 : 0), 0);
    const countable = halves.reduce((total, status) => total + (status === "EXCUSED" ? 0 : 0.5), 0);
    let status = "HALF_DAY";
    if (!countable) status = "EXCUSED";
    else if (!credit) status = "ABSENT";
    else if (credit === countable) status = halves.includes("LATE") ? "LATE" : "PRESENT";
    return { status, credit, countable };
  }

  const status = statusIn({ kind: "DAY" });
  return { status, credit: WEIGHT[status], countable: status === "EXCUSED" ? 0 : 1 };
};

/* Per subject over the days, by name:
   [{ subjectId, name, held, attended, excused, percentage, daysAttended }] */
const summariseSubjects = days => {
  const bySubject = new Map();
  for (const subject of days.flatMap(day => day.subjects ?? [])) {
    if (!bySubject.has(subject.subjectId)) {
      bySubject.set(subject.subjectId, { name: subject.name, tally: emptyTally(), daysAttended: 0 });
    }
    const totals = bySubject.get(subject.subjectId);
    addTally(totals.tally, subject);
    if (subject.attended > 0) totals.daysAttended++;
  }
  return [...bySubject.entries()]
    .map(([subjectId, { name, tally, daysAttended }]) => ({ subjectId, name, ...withPercentage(tally), daysAttended }))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
};

/* Totals over the working days of a range (one dayOf per working day).
   percentage: the day percentage, or the period percentage when every working
   day of the range was period-wise (basis PERIODS). Wherever periods were taken,
   `periods` sums them and `subjects` breaks them down per subject. */
export const summariseDays = (days, { periodWise = false } = {}) => {
  const counts = emptyCounts();
  let marked = 0;
  let attendedDays = 0;
  let countableDays = 0;
  let periods = null;
  for (const day of days) {
    if (day.status) {
      counts[day.status]++;
      marked++;
    }
    attendedDays += day.credit;
    countableDays += day.countable;
    if (day.periods) {
      periods ??= emptyTally();
      addTally(periods, day.periods);
    }
  }
  if (periods) withPercentage(periods);
  const dayPercentage = percentOf(attendedDays, countableDays);
  const basis = periodWise && periods ? "PERIODS" : "DAYS";
  return {
    workingDays: days.length,
    marked,
    unmarked: days.length - marked,
    counts,
    attendedDays: round2(attendedDays),
    countableDays: round2(countableDays),
    dayPercentage,
    periods,
    subjects: periods ? summariseSubjects(days) : null,
    basis,
    percentage: basis === "PERIODS" ? periods.percentage : dayPercentage
  };
};

/* Consecutive working days with the same mode: [{ mode, from, to }] */
export const modeSegments = (days, modes) =>
  days.reduce((segments, day, index) => {
    const last = segments.at(-1);
    if (last?.mode === modes[index]) last.to = day;
    else segments.push({ mode: modes[index], from: day, to: day });
    return segments;
  }, []);
