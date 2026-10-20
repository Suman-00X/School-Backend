import { createRandom } from "../utils/random.util.js";

/* Class timetable solver: places the weekly classes of the sections in scope on the week's
   grid (school days × teaching periods).

   Pure: no database and no HTTP. The input and output are plain JSON (the planner service
   builds the input from the school's data), and the same input and seed always give the
   same timetable, unless timeLimitMs cuts the search short (stats.timedOut).

   Input
     days      ISO weekdays with school, in order: [1, 2, 3, 4, 5, 6]
     periods   the bell schedule in order, breaks included: [{ id, periodNumber, name, isBreak }]
     lessons   what to place: [{ sectionId, subjectId, teacherId, perWeek, doubles, maxPerDay,
               preferredPeriods?, avoidPeriods? (period numbers), room? }]
               a double is two periods in a row with no break between them, counted in perWeek
     fixed     slots that stay where they are: [{ sectionId, subjectId, teacherId, weekday, periodId, room? }]
     blocked   cells nobody in scope may use: [{ kind: TEACHER | ROOM | SECTION, id, weekday, periodId,
               reason: LESSON (taught outside the scope) | UNAVAILABLE | CLOSED }]
     teacherLimits { [teacherId]: { maxPerDay?, maxConsecutive? } }
     defaults  { teacherMaxPerDay?, teacherMaxConsecutive? }
     weights   soft-rule weights (CLASS_WEIGHTS), seed, attempts, improveIterations, timeLimitMs

   Hard rules (never broken): a section, a teacher and a room hold one class at a time; blocked
   cells stay empty; a subject has at most maxPerDay periods a day in a section; a teacher has
   at most maxPerDay periods a day and maxConsecutive in a row (a break ends a run); a double
   sits in two joined periods.

   Soft rules (the cost; lower is better): a subject's classes spread over the week (spread),
   not back to back unless a double (adjacency), a section's day without free periods in the
   middle (holes), sections' days of similar length (balance), teachers without idle periods
   between classes (teacherGaps), preferred and avoided periods (preferences).

   Method: several greedy constructions (hardest classes first, each in its cheapest cell; a
   class with no free cell moves up to three others out of its way), the best one improved by
   simulated annealing (moves and swaps within a section), then a last try for what is left. */

export const CLASS_WEIGHTS = Object.freeze({
  spread: 10,
  adjacency: 4,
  holes: 6,
  balance: 1,
  teacherGaps: 2,
  preferences: 3
});

/* Why a class could not go in a cell (the planner words them) */
export const CLASS_REASONS = Object.freeze([
  "OK",
  "SECTION_FULL",
  "SECTION_CLOSED",
  "TEACHER_BUSY",
  "TEACHER_UNAVAILABLE",
  "ROOM_BUSY",
  "SUBJECT_DAILY_LIMIT",
  "TEACHER_DAILY_LIMIT",
  "TEACHER_CONSECUTIVE_LIMIT",
  "NO_ROOM_FOR_DOUBLE"
]);
const R = Object.fromEntries(CLASS_REASONS.map((code, i) => [code, i]));

const FREE = -1;
/* Taken outside the scope (a lesson of another section) or closed */
const BLOCKED = -2;
/* The teacher is not available (not teaching, so not a lesson for daily loads) */
const UNAVAILABLE = -3;

const NOISE = 0.5;
const REPAIR_BUDGET = 400;
const MAX_BLOCKERS = 3;

export const solveClassTimetable = input => {
  const startedAt = Date.now();
  const weights = { ...CLASS_WEIGHTS, ...input.weights };
  const seed = input.seed ?? 1;
  const rand = createRandom(seed);
  const attempts = input.attempts ?? 8;
  const timeLimitMs = input.timeLimitMs ?? 20_000;

  /* ---------- the grid ---------- */
  const days = input.days;
  const D = days.length;
  const teaching = input.periods.filter(p => !p.isBreak);
  const P = teaching.length;
  const S = D * P;
  const bellIndex = new Map(input.periods.map((p, i) => [p.id, i]));
  const periodIndex = new Map(teaching.map((p, i) => [p.id, i]));
  const periodByNumber = new Map(teaching.map((p, i) => [p.periodNumber, i]));
  const dayIndex = new Map(days.map((weekday, i) => [weekday, i]));
  /* joined[p]: teaching periods p and p + 1 follow each other with no break between */
  const joined = teaching.map((p, i) => i + 1 < P && bellIndex.get(teaching[i + 1].id) === bellIndex.get(p.id) + 1);
  const cellOf = (weekday, periodId) =>
    dayIndex.has(weekday) && periodIndex.has(periodId) ? dayIndex.get(weekday) * P + periodIndex.get(periodId) : -1;

  const indexer = () => {
    const ids = [];
    const index = new Map();
    return {
      ids,
      of: id => {
        if (!index.has(id)) {
          index.set(id, ids.length);
          ids.push(id);
        }
        return index.get(id);
      },
      has: id => index.has(id),
      get: id => index.get(id)
    };
  };
  const sections = indexer();
  const teachers = indexer();
  const rooms = indexer();
  const groups = indexer();
  const groupInfo = [];
  const groupOf = (sectionId, subjectId, teacherId) => {
    const key = `${sectionId}|${subjectId}`;
    const g = groups.of(key);
    groupInfo[g] ??= { sectionId, subjectId, teacherId };
    return g;
  };

  for (const lesson of input.lessons) sections.of(lesson.sectionId);
  for (const slot of input.fixed) sections.of(slot.sectionId);

  /* ---------- units: one per class to place (a double is one unit of two periods) ---------- */
  const units = [];
  const periodSet = numbers => {
    const set = new Set((numbers ?? []).map(n => periodByNumber.get(n)).filter(p => p !== undefined));
    return set.size ? set : null;
  };
  const issues = [];
  for (const lesson of input.lessons) {
    const g = groupOf(lesson.sectionId, lesson.subjectId, lesson.teacherId);
    const base = {
      group: g,
      sec: sections.of(lesson.sectionId),
      teacher: lesson.teacherId ? teachers.of(lesson.teacherId) : -1,
      room: lesson.room ? rooms.of(lesson.room) : -1,
      pref: periodSet(lesson.preferredPeriods),
      avoid: periodSet(lesson.avoidPeriods),
      maxPerDay: lesson.maxPerDay ?? P,
      fixed: false,
      slot: -1
    };
    const doubles = Math.min(lesson.doubles ?? 0, Math.floor(lesson.perWeek / 2));
    for (let k = 0; k < doubles; k++) units.push({ ...base, idx: units.length, len: 2 });
    for (let k = 0; k < lesson.perWeek - 2 * doubles; k++) units.push({ ...base, idx: units.length, len: 1 });
  }
  const fixedUnits = [];
  for (const slot of input.fixed) {
    const cell = cellOf(slot.weekday, slot.periodId);
    if (cell < 0) continue;
    const unit = {
      idx: units.length,
      group: groupOf(slot.sectionId, slot.subjectId, slot.teacherId),
      sec: sections.of(slot.sectionId),
      teacher: slot.teacherId ? teachers.of(slot.teacherId) : -1,
      room: slot.room ? rooms.of(slot.room) : -1,
      pref: null,
      avoid: null,
      maxPerDay: Infinity,
      fixed: true,
      len: 1,
      slot: cell,
      home: cell
    };
    units.push(unit);
    fixedUnits.push(unit);
  }
  for (const b of input.blocked) {
    if (b.kind === "TEACHER") teachers.of(b.id);
    else if (b.kind === "ROOM") rooms.of(b.id);
  }

  const nSec = sections.ids.length;
  const nTea = teachers.ids.length;
  const nRoom = rooms.ids.length;
  const nGroup = groups.ids.length;

  /* Limits per teacher (periods a day, periods in a row) */
  const teacherMaxPerDay = new Int16Array(nTea);
  const teacherMaxRun = new Int16Array(nTea);
  for (let t = 0; t < nTea; t++) {
    const own = input.teacherLimits?.[teachers.ids[t]] ?? {};
    teacherMaxPerDay[t] = own.maxPerDay ?? input.defaults?.teacherMaxPerDay ?? P;
    teacherMaxRun[t] = own.maxConsecutive ?? input.defaults?.teacherMaxConsecutive ?? P;
  }

  /* Empty grids with only the blocked cells: every attempt starts from these */
  const baseSec = new Int32Array(nSec * S).fill(FREE);
  const baseTea = new Int32Array(nTea * S).fill(FREE);
  const baseRoom = new Int32Array(nRoom * S).fill(FREE);
  for (const b of input.blocked) {
    const cell = cellOf(b.weekday, b.periodId);
    if (cell < 0) continue;
    if (b.kind === "TEACHER") {
      const at = teachers.get(b.id) * S + cell;
      if (b.reason === "UNAVAILABLE") {
        if (baseTea[at] === FREE) baseTea[at] = UNAVAILABLE;
      } else baseTea[at] = BLOCKED;
    } else if (b.kind === "ROOM") baseRoom[rooms.get(b.id) * S + cell] = BLOCKED;
    else if (b.kind === "SECTION" && sections.has(b.id)) baseSec[sections.get(b.id) * S + cell] = BLOCKED;
  }
  const baseTeaLoad = new Int16Array(nTea * D);
  for (let t = 0; t < nTea; t++) {
    for (let s = 0; s < S; s++) if (baseTea[t * S + s] === BLOCKED) baseTeaLoad[t * D + Math.floor(s / P)]++;
  }

  /* Demand above capacity can never fit: say so up front (the search still places what it can) */
  const secNeed = new Int32Array(nSec);
  const teaNeed = new Int32Array(nTea);
  const roomNeed = new Int32Array(nRoom);
  for (const u of units) {
    secNeed[u.sec] += u.len;
    if (u.teacher >= 0) teaNeed[u.teacher] += u.len;
    if (u.room >= 0) roomNeed[u.room] += u.len;
  }
  const countIn = (grid, row, value) => {
    let n = 0;
    for (let s = 0; s < S; s++) if (grid[row * S + s] === value) n++;
    return n;
  };
  for (let sec = 0; sec < nSec; sec++) {
    const available = S - countIn(baseSec, sec, BLOCKED);
    if (secNeed[sec] > available) {
      issues.push({
        severity: "ERROR",
        code: "SECTION_OVERLOADED",
        sectionId: sections.ids[sec],
        needed: secNeed[sec],
        available
      });
    }
  }
  for (let t = 0; t < nTea; t++) {
    const outside = countIn(baseTea, t, BLOCKED);
    const available = S - countIn(baseTea, t, UNAVAILABLE) - outside;
    if (teaNeed[t] > available) {
      issues.push({
        severity: "ERROR",
        code: "TEACHER_OVERLOADED",
        teacherId: teachers.ids[t],
        needed: teaNeed[t],
        available,
        taughtOutsideScope: outside
      });
    } else if (teaNeed[t] + outside > D * teacherMaxPerDay[t]) {
      issues.push({
        severity: "ERROR",
        code: "TEACHER_DAILY_LIMIT_TOO_LOW",
        teacherId: teachers.ids[t],
        needed: teaNeed[t] + outside,
        available: D * teacherMaxPerDay[t]
      });
    }
  }
  for (let r = 0; r < nRoom; r++) {
    const available = S - countIn(baseRoom, r, BLOCKED);
    if (roomNeed[r] > available)
      issues.push({ severity: "ERROR", code: "ROOM_OVERLOADED", room: rooms.ids[r], needed: roomNeed[r], available });
  }
  for (const lesson of input.lessons) {
    const maxPerDay = lesson.maxPerDay ?? P;
    if (lesson.perWeek > D * maxPerDay) {
      issues.push({
        severity: "ERROR",
        code: "SUBJECT_DAILY_LIMIT_TOO_LOW",
        sectionId: lesson.sectionId,
        subjectId: lesson.subjectId,
        needed: lesson.perWeek,
        available: D * maxPerDay
      });
    }
  }
  if (units.some(u => u.len === 2) && !joined.some(Boolean)) {
    issues.push({
      severity: "ERROR",
      code: "NO_DOUBLE_PERIODS",
      needed: units.filter(u => u.len === 2).length,
      available: 0
    });
  }

  const secGrid = new Int32Array(nSec * S);
  const teaGrid = new Int32Array(nTea * S);
  const roomGrid = new Int32Array(nRoom * S);
  const groupDay = new Int16Array(nGroup * D);
  const teaLoad = new Int16Array(nTea * D);

  /* What each section needs over the week, for the balance rule */
  const secTarget = new Float64Array(nSec);
  for (const u of units) secTarget[u.sec] += u.len;
  for (let i = 0; i < nSec; i++) secTarget[i] /= D || 1;

  /* ---------- moves (journaled, so a failed try can be rolled back) ---------- */
  const journal = [];

  const write = (u, s, value) => {
    const d = Math.floor(s / P);
    for (let k = 0; k < u.len; k++) {
      secGrid[u.sec * S + s + k] = value;
      if (u.teacher >= 0) teaGrid[u.teacher * S + s + k] = value;
      if (u.room >= 0) roomGrid[u.room * S + s + k] = value;
    }
    const step = value === FREE ? -u.len : u.len;
    groupDay[u.group * D + d] += step;
    if (u.teacher >= 0) teaLoad[u.teacher * D + d] += step;
  };

  const assignRaw = (u, s) => {
    if (u.slot >= 0) write(u, u.slot, FREE);
    u.slot = s;
    if (s >= 0) write(u, s, u.idx);
  };

  const assign = (u, s) => {
    journal.push(u.idx, u.slot);
    assignRaw(u, s);
  };

  const rollback = mark => {
    while (journal.length > mark) {
      const old = journal.pop();
      assignRaw(units[journal.pop()], old);
    }
  };

  const reset = () => {
    secGrid.set(baseSec);
    teaGrid.set(baseTea);
    roomGrid.set(baseRoom);
    groupDay.fill(0);
    teaLoad.set(baseTeaLoad);
    for (const u of units) u.slot = -1;
    journal.length = 0;
    for (const u of fixedUnits) assignRaw(u, u.home);
  };

  const isLesson = cell => cell >= 0 || cell === BLOCKED;

  /* 0 when u can sit at s now, else the reason (CLASS_REASONS) */
  const fits = (u, s) => {
    const p = s % P;
    const d = (s - p) / P;
    if (p + u.len > P || (u.len === 2 && !joined[p])) return R.NO_ROOM_FOR_DOUBLE;
    for (let k = 0; k < u.len; k++) {
      const sc = secGrid[u.sec * S + s + k];
      if (sc !== FREE) return sc === BLOCKED ? R.SECTION_CLOSED : R.SECTION_FULL;
    }
    if (u.teacher >= 0) {
      for (let k = 0; k < u.len; k++) {
        const tc = teaGrid[u.teacher * S + s + k];
        if (tc !== FREE) return tc === UNAVAILABLE ? R.TEACHER_UNAVAILABLE : R.TEACHER_BUSY;
      }
    }
    if (u.room >= 0) {
      for (let k = 0; k < u.len; k++) if (roomGrid[u.room * S + s + k] !== FREE) return R.ROOM_BUSY;
    }
    if (groupDay[u.group * D + d] + u.len > u.maxPerDay) return R.SUBJECT_DAILY_LIMIT;
    if (u.teacher >= 0) {
      const t = u.teacher;
      if (teaLoad[t * D + d] + u.len > teacherMaxPerDay[t]) return R.TEACHER_DAILY_LIMIT;
      if (teacherMaxRun[t] < P) {
        const row = t * S + d * P;
        let run = u.len;
        for (let q = p - 1; q >= 0 && joined[q] && isLesson(teaGrid[row + q]); q--) run++;
        for (let q = p + u.len; q < P && joined[q - 1] && isLesson(teaGrid[row + q]); q++) run++;
        if (run > teacherMaxRun[t]) return R.TEACHER_CONSECUTIVE_LIMIT;
      }
    }
    return R.OK;
  };

  /* ---------- the cost ---------- */
  const scratch = new Int16Array(nGroup);
  const touched = [];

  const sectionDayCost = (sec, d, acc) => {
    const row = sec * S + d * P;
    let spread = 0;
    let adjacency = 0;
    let first = -1;
    let last = -1;
    let filled = 0;
    let free = 0;
    let prev = FREE;
    for (let p = 0; p < P; p++) {
      const cell = secGrid[row + p];
      if (cell < 0) {
        if (cell === FREE && first >= 0) free++;
        prev = cell;
        continue;
      }
      if (first < 0) first = p;
      last = p;
      filled++;
      if (cell !== prev) {
        const g = units[cell].group;
        if (scratch[g]++ === 0) touched.push(g);
        else spread++;
        if (prev >= 0 && joined[p - 1] && units[prev].group === g) adjacency++;
      }
      prev = cell;
    }
    for (const g of touched) scratch[g] = 0;
    touched.length = 0;
    /* free cells counted after the last class are not holes */
    let trailing = 0;
    for (let p = P - 1; p > last && last >= 0; p--) if (secGrid[row + p] === FREE) trailing++;
    const holes = Math.max(0, free - trailing);
    const balance = filled ? (filled - secTarget[sec]) ** 2 : 0;
    if (acc) {
      acc.spread += spread;
      acc.adjacency += adjacency;
      acc.holes += holes;
      acc.balance += balance;
    }
    return weights.spread * spread + weights.adjacency * adjacency + weights.holes * holes + weights.balance * balance;
  };

  const teacherDayCost = (t, d, acc) => {
    const row = t * S + d * P;
    let first = -1;
    let last = -1;
    let busy = 0;
    for (let p = 0; p < P; p++) {
      if (!isLesson(teaGrid[row + p])) continue;
      if (first < 0) first = p;
      last = p;
      busy++;
    }
    const gaps = busy ? last - first + 1 - busy : 0;
    if (acc) acc.teacherGaps += gaps;
    return weights.teacherGaps * gaps;
  };

  const prefCost = (u, s, acc) => {
    if (s < 0 || (!u.pref && !u.avoid)) return 0;
    let misses = 0;
    for (let k = 0; k < u.len; k++) {
      const p = (s % P) + k;
      if (u.pref && !u.pref.has(p)) misses++;
      if (u.avoid && u.avoid.has(p)) misses++;
    }
    if (acc) acc.preferences += misses;
    return weights.preferences * misses;
  };

  /* Cost of the section-days and teacher-days a move touches: keys are [sec, day] / [teacher, day] */
  const regionCost = (secKeys, teaKeys) => {
    let cost = 0;
    for (let i = 0; i < secKeys.length; i += 2) cost += sectionDayCost(secKeys[i], secKeys[i + 1]);
    for (let i = 0; i < teaKeys.length; i += 2) cost += teacherDayCost(teaKeys[i], teaKeys[i + 1]);
    return cost;
  };

  const keysFor = (list, slots) => {
    const secKeys = [];
    const teaKeys = [];
    const add = (keys, a, d) => {
      for (let i = 0; i < keys.length; i += 2) if (keys[i] === a && keys[i + 1] === d) return;
      keys.push(a, d);
    };
    for (const u of list) {
      for (const s of slots) {
        if (s < 0) continue;
        const d = Math.floor(s / P);
        add(secKeys, u.sec, d);
        if (u.teacher >= 0) add(teaKeys, u.teacher, d);
      }
    }
    return [secKeys, teaKeys];
  };

  const totalCost = acc => {
    let cost = 0;
    for (let sec = 0; sec < nSec; sec++) for (let d = 0; d < D; d++) cost += sectionDayCost(sec, d, acc);
    for (let t = 0; t < nTea; t++) for (let d = 0; d < D; d++) cost += teacherDayCost(t, d, acc);
    for (const u of units) if (!u.fixed) cost += prefCost(u, u.slot, acc);
    return cost;
  };

  /* Cost change of putting the (unplaced) unit u at s, which must fit */
  const placeDelta = (u, s) => {
    const [secKeys, teaKeys] = keysFor([u], [s]);
    const before = regionCost(secKeys, teaKeys);
    assignRaw(u, s);
    const after = regionCost(secKeys, teaKeys);
    assignRaw(u, -1);
    return after - before + prefCost(u, s);
  };

  /* The cheapest cell u fits in now, or -1 */
  const bestSlot = u => {
    let best = -1;
    let bestCost = Infinity;
    for (let s = 0; s < S; s++) {
      if (fits(u, s) !== R.OK) continue;
      const cost = placeDelta(u, s) + rand.next() * NOISE;
      if (cost < bestCost) {
        bestCost = cost;
        best = s;
      }
    }
    return best;
  };

  /* Place u by moving up to MAX_BLOCKERS placed classes out of its way (each re-placed, if
     need be the same way, `depth` levels down). Leaves the grid unchanged on failure. */
  let repairBudget = 0;
  const ejectAndPlace = (u, depth, chain) => {
    const candidates = [];
    for (let s = 0; s < S; s++) {
      const p = s % P;
      if (p + u.len > P || (u.len === 2 && !joined[p])) continue;
      const blockers = new Set();
      let open = true;
      for (let k = 0; k < u.len && open; k++) {
        const cells = [secGrid[u.sec * S + s + k]];
        if (u.teacher >= 0) cells.push(teaGrid[u.teacher * S + s + k]);
        if (u.room >= 0) cells.push(roomGrid[u.room * S + s + k]);
        for (const cell of cells) {
          if (cell === FREE) continue;
          if (cell < 0 || units[cell].fixed || chain.has(cell)) open = false;
          else blockers.add(cell);
        }
      }
      if (open && blockers.size <= MAX_BLOCKERS) candidates.push({ s, blockers: [...blockers], tie: rand.next() });
    }
    candidates.sort((a, b) => a.blockers.length - b.blockers.length || a.tie - b.tie);

    for (const { s, blockers } of candidates.slice(0, 12)) {
      if (repairBudget-- <= 0) return false;
      const mark = journal.length;
      for (const b of blockers) assign(units[b], -1);
      if (fits(u, s) !== R.OK) {
        rollback(mark);
        continue;
      }
      assign(u, s);
      const next = new Set(chain).add(u.idx);
      let ok = true;
      for (const b of blockers) {
        const unit = units[b];
        const best = bestSlot(unit);
        if (best >= 0) assign(unit, best);
        else if (!(depth > 0 && ejectAndPlace(unit, depth - 1, next))) {
          ok = false;
          break;
        }
      }
      if (ok) return true;
      rollback(mark);
    }
    return false;
  };

  const unplacedOf = () => units.filter(u => !u.fixed && u.slot < 0);
  const missingPeriods = () => unplacedOf().reduce((sum, u) => sum + u.len, 0);
  const outOfTime = () => Date.now() - startedAt > timeLimitMs;
  let timedOut = false;

  /* How many cells each class could take on the empty grid: the fewest go first */
  reset();
  const options = units.map(u => {
    if (u.fixed) return 0;
    let n = 0;
    for (let s = 0; s < S; s++) if (fits(u, s) === R.OK) n++;
    return n;
  });
  const teacherDemand = new Int32Array(nTea);
  for (const u of units) if (u.teacher >= 0) teacherDemand[u.teacher] += u.len;

  const construct = () => {
    reset();
    const order = rand
      .shuffle(units.filter(u => !u.fixed))
      .sort(
        (a, b) =>
          b.len - a.len ||
          options[a.idx] - options[b.idx] ||
          (b.teacher >= 0 ? teacherDemand[b.teacher] : 0) - (a.teacher >= 0 ? teacherDemand[a.teacher] : 0)
      );
    for (const u of order) {
      const best = bestSlot(u);
      if (best >= 0) assignRaw(u, best);
      else {
        repairBudget = REPAIR_BUDGET;
        ejectAndPlace(u, 2, new Set());
      }
      journal.length = 0;
    }
  };

  const rescue = budget => {
    for (const u of rand.shuffle(unplacedOf())) {
      if (outOfTime()) break;
      repairBudget = budget;
      ejectAndPlace(u, 3, new Set());
      journal.length = 0;
    }
  };

  const snapshot = () => Int32Array.from(units, u => u.slot);
  const load = slots => {
    reset();
    for (const u of units) if (!u.fixed && slots[u.idx] >= 0) assignRaw(u, slots[u.idx]);
    journal.length = 0;
  };

  /* ---------- search ---------- */
  let best = null;
  let attemptsRun = 0;
  for (let a = 0; a < Math.max(1, attempts); a++) {
    if (a > 0 && outOfTime()) {
      timedOut = true;
      break;
    }
    construct();
    rescue(REPAIR_BUDGET);
    attemptsRun++;
    const missing = missingPeriods();
    const cost = totalCost();
    if (!best || missing < best.missing || (missing === best.missing && cost < best.cost)) {
      best = { missing, cost, slots: snapshot() };
    }
    if (missing === 0 && units.length === fixedUnits.length) break;
  }

  load(best.slots);
  const movable = units.filter(u => !u.fixed);
  const iterations = input.improveIterations ?? Math.min(200_000, 40 * movable.length + 2_000);
  let current = best.cost;
  const T0 = 3;
  const T1 = 0.05;
  let it = 0;
  for (; it < iterations && movable.length; it++) {
    if ((it & 255) === 0 && outOfTime()) {
      timedOut = true;
      break;
    }
    const u = movable[rand.below(movable.length)];
    if (u.slot < 0) continue;
    const temperature = T0 * (T1 / T0) ** (it / iterations);
    const mark = journal.length;
    const from = u.slot;
    let before;
    let after;

    if (rand.next() < 0.5) {
      /* move u to another cell of its section */
      const to = rand.below(S);
      if (to === from) continue;
      const [secKeys, teaKeys] = keysFor([u], [from, to]);
      before = regionCost(secKeys, teaKeys) + prefCost(u, from);
      assign(u, -1);
      if (fits(u, to) !== R.OK) {
        rollback(mark);
        continue;
      }
      assign(u, to);
      after = regionCost(secKeys, teaKeys) + prefCost(u, to);
    } else {
      /* swap u with another class of its section of the same length */
      const cell = secGrid[u.sec * S + rand.below(S)];
      if (cell < 0 || cell === u.idx) continue;
      const v = units[cell];
      if (v.fixed || v.len !== u.len) continue;
      const to = v.slot;
      const [secKeys, teaKeys] = keysFor([u, v], [from, to]);
      before = regionCost(secKeys, teaKeys) + prefCost(u, from) + prefCost(v, to);
      assign(u, -1);
      assign(v, -1);
      if (fits(u, to) !== R.OK) {
        rollback(mark);
        continue;
      }
      assign(u, to);
      if (fits(v, from) !== R.OK) {
        rollback(mark);
        continue;
      }
      assign(v, from);
      after = regionCost(secKeys, teaKeys) + prefCost(u, to) + prefCost(v, from);
    }

    const delta = after - before;
    if (delta <= 0 || rand.next() < Math.exp(-delta / temperature)) {
      current += delta;
      journal.length = 0;
      if (current < best.cost - 1e-9) best = { missing: best.missing, cost: current, slots: snapshot() };
    } else rollback(mark);
  }

  load(best.slots);
  if (best.missing > 0) {
    rescue(REPAIR_BUDGET * 5);
    const missing = missingPeriods();
    if (missing < best.missing) best = { missing, cost: totalCost(), slots: snapshot() };
    load(best.slots);
  }

  /* ---------- result ---------- */
  const breakdown = { spread: 0, adjacency: 0, holes: 0, balance: 0, teacherGaps: 0, preferences: 0 };
  const cost = totalCost(breakdown);
  breakdown.balance = Math.round(breakdown.balance * 100) / 100;

  const placements = [];
  for (const u of movable) {
    if (u.slot < 0) continue;
    const info = groupInfo[u.group];
    const d = Math.floor(u.slot / P);
    for (let k = 0; k < u.len; k++) {
      placements.push({
        sectionId: info.sectionId,
        subjectId: info.subjectId,
        teacherId: info.teacherId,
        weekday: days[d],
        periodId: teaching[(u.slot % P) + k].id,
        room: u.room >= 0 ? rooms.ids[u.room] : null,
        double: u.len === 2
      });
    }
  }

  /* What could not be placed, and why (each cell of the week's first failing rule) */
  const unplacedByGroup = new Map();
  for (const u of unplacedOf()) {
    const entry = unplacedByGroup.get(u.group) ?? {
      ...groupInfo[u.group],
      missingPeriods: 0,
      missingDoubles: 0,
      reasons: {}
    };
    entry.missingPeriods += u.len;
    if (u.len === 2) entry.missingDoubles++;
    if (!Object.keys(entry.reasons).length) {
      for (let s = 0; s < S; s++) {
        const code = CLASS_REASONS[fits(u, s)];
        if (code !== "OK") entry.reasons[code] = (entry.reasons[code] ?? 0) + 1;
      }
    }
    unplacedByGroup.set(u.group, entry);
  }

  const requiredPeriods = movable.reduce((sum, u) => sum + u.len, 0);
  return {
    placements,
    unplaced: [...unplacedByGroup.values()],
    issues,
    score: {
      cost: Math.round(cost * 100) / 100,
      breakdown,
      requiredPeriods,
      placedPeriods: requiredPeriods - best.missing,
      complete: best.missing === 0
    },
    stats: {
      seed,
      attempts: attemptsRun,
      improveIterations: it,
      elapsedMs: Date.now() - startedAt,
      timedOut,
      grid: { days: D, teachingPeriods: P, cells: S, sections: nSec, teachers: nTea }
    }
  };
};
