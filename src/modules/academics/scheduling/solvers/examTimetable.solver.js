import { createRandom } from "../utils/random.util.js";

/* Exam timetable solver: gives every paper of an exam a date and a sitting.

   Pure, like the class solver: plain JSON in and out, the same input and seed give the
   same timetable.

   Input
     dates     the school days the exam may use, in order: ["2026-11-02", …]
     sessions  the sittings of a day, in order: [{ name, startTime: "09:30", endTime: "12:30" }]
     papers    [{ id, sectionId, classId, subjectId, component, durationMinutes? }]
               (a paper lasts its sitting unless it has a duration)
     busy      times a section already sits another exam: [{ sectionId, date, startTime, endTime }]
     rules     { maxPapersPerDay = 1, minGapDays = 0, align = CLASS, spread = EVEN, restDayBefore = [subjectId] }
     seed, attempts, improveIterations

   align: the papers sat together, in one sitting. CLASS: a subject's paper (or component)
   for every section of a class, so the class shares one question paper; SCHOOL: for every
   section that sits it; NONE: each paper on its own.

   Hard rules: a section sits one paper at a time and at most maxPapersPerDay a day, with at
   least minGapDays school days free between two of its papers on different days; it never
   sits two exams at once; a paper fits in its sitting.

   Soft rules (the cost): EVEN spreads each section's papers over the window, COMPACT finishes
   as early as it can; two papers a day are avoided; a subject in restDayBefore gets a free day
   before it; morning sittings are preferred. */

export const EXAM_REASONS = Object.freeze(["OK", "SECTION_BUSY", "OTHER_EXAM", "DAILY_LIMIT", "GAP_RULE", "TOO_LONG"]);
const R = Object.fromEntries(EXAM_REASONS.map((code, i) => [code, i]));

const W = { short: 4, sameDay: 30, restDay: 12, session: 1, compact: 1 };

const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const clock = total => `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

export const solveExamTimetable = input => {
  const startedAt = Date.now();
  const seed = input.seed ?? 1;
  const rand = createRandom(seed);
  const rules = {
    maxPapersPerDay: 1,
    minGapDays: 0,
    align: "CLASS",
    spread: "EVEN",
    restDayBefore: [],
    ...input.rules
  };
  const { dates, sessions, papers } = input;
  const ND = dates.length;
  const NS = sessions.length;
  const Q = ND * NS;
  const issues = [];

  const sectionIds = [...new Set(papers.map(p => p.sectionId))];
  const secIndex = new Map(sectionIds.map((id, i) => [id, i]));
  const nSec = sectionIds.length;
  const restBefore = new Set(rules.restDayBefore);

  /* ---------- blocks: papers sat together ---------- */
  const keyOf = p => {
    const subject = `${p.subjectId}|${p.component ?? ""}`;
    if (rules.align === "SCHOOL") return subject;
    if (rules.align === "CLASS") return `${p.classId}|${subject}`;
    return p.id;
  };
  const byKey = new Map();
  for (const paper of papers) {
    const key = keyOf(paper);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(paper);
  }
  const blocks = [];
  for (const list of byKey.values()) {
    /* one section never sits two papers of a block (it would be at once): split them off */
    const rounds = [];
    for (const paper of list) {
      let round = rounds.find(r => !r.some(p => p.sectionId === paper.sectionId));
      if (!round) rounds.push((round = []));
      round.push(paper);
    }
    for (const round of rounds) {
      blocks.push({
        idx: blocks.length,
        papers: round,
        secs: round.map(p => secIndex.get(p.sectionId)),
        rest: restBefore.has(round[0].subjectId),
        slot: -1
      });
    }
  }

  /* ---------- what each sitting allows ---------- */
  const sessionStart = sessions.map(s => minutes(s.startTime));
  const sessionEnd = sessions.map(s => minutes(s.endTime));
  const lengthOf = paper => paper.durationMinutes ?? null;
  /* tooLong[block][session]: a paper of the block does not fit in the sitting */
  const tooLong = blocks.map(b =>
    sessions.map((_, si) => b.papers.some(p => lengthOf(p) !== null && sessionStart[si] + lengthOf(p) > sessionEnd[si]))
  );
  for (const b of blocks) {
    if (tooLong[b.idx].every(Boolean)) {
      issues.push({
        severity: "ERROR",
        code: "PAPER_TOO_LONG",
        paperIds: b.papers.map(p => p.id),
        needed: Math.max(...b.papers.map(p => lengthOf(p) ?? 0)),
        available: Math.max(...sessionEnd.map((e, i) => e - sessionStart[i]))
      });
    }
  }

  /* otherExam[sec * Q + q]: the section sits another exam then */
  const otherExam = new Uint8Array(nSec * Q);
  const dateIndex = new Map(dates.map((d, i) => [d, i]));
  for (const b of input.busy ?? []) {
    const sec = secIndex.get(b.sectionId);
    const di = dateIndex.get(b.date);
    if (sec === undefined || di === undefined) continue;
    for (let si = 0; si < NS; si++) {
      if (minutes(b.startTime) < sessionEnd[si] && minutes(b.endTime) > sessionStart[si])
        otherExam[sec * Q + di * NS + si] = 1;
    }
  }

  /* How many papers a section can sit in the window, at best */
  const perDay = Math.min(rules.maxPapersPerDay, NS);
  const usableDays = rules.minGapDays > 0 ? Math.ceil(ND / (rules.minGapDays + 1)) : ND;
  const capacity = usableDays * perDay;
  const secPapers = new Int32Array(nSec);
  for (const b of blocks) for (const sec of b.secs) secPapers[sec]++;
  for (let sec = 0; sec < nSec; sec++) {
    if (secPapers[sec] > capacity) {
      issues.push({
        severity: "ERROR",
        code: "WINDOW_TOO_SHORT",
        sectionId: sectionIds[sec],
        needed: secPapers[sec],
        available: capacity,
        schoolDays: ND
      });
    }
  }

  /* ---------- state ---------- */
  const secSlot = new Int32Array(nSec * Q);
  const secDay = new Int16Array(nSec * ND);
  const blocksOf = Array.from({ length: nSec }, () => []);
  for (const b of blocks) for (const sec of b.secs) blocksOf[sec].push(b);

  const reset = () => {
    secSlot.fill(-1);
    secDay.fill(0);
    for (const b of blocks) b.slot = -1;
  };

  const assign = (b, q) => {
    if (b.slot >= 0) {
      const d = Math.floor(b.slot / NS);
      for (const sec of b.secs) {
        secSlot[sec * Q + b.slot] = -1;
        secDay[sec * ND + d]--;
      }
    }
    b.slot = q;
    if (q >= 0) {
      const d = Math.floor(q / NS);
      for (const sec of b.secs) {
        secSlot[sec * Q + q] = b.idx;
        secDay[sec * ND + d]++;
      }
    }
  };

  const fits = (b, q) => {
    const d = Math.floor(q / NS);
    if (tooLong[b.idx][q % NS]) return R.TOO_LONG;
    for (const sec of b.secs) {
      if (otherExam[sec * Q + q]) return R.OTHER_EXAM;
      if (secSlot[sec * Q + q] >= 0) return R.SECTION_BUSY;
      if (secDay[sec * ND + d] >= rules.maxPapersPerDay) return R.DAILY_LIMIT;
      for (let g = 1; g <= rules.minGapDays; g++) {
        if ((d - g >= 0 && secDay[sec * ND + d - g]) || (d + g < ND && secDay[sec * ND + d + g])) return R.GAP_RULE;
      }
    }
    return R.OK;
  };

  /* ---------- cost ---------- */
  const target = (sec, n) => (n > 1 ? (ND - 1) / (n - 1) : ND);
  const sectionCost = (sec, acc) => {
    const placed = blocksOf[sec].filter(b => b.slot >= 0);
    if (!placed.length) return 0;
    const ordered = placed.map(b => b.slot).sort((a, b) => a - b);
    const ideal = target(sec, blocksOf[sec].length);
    let cost = 0;
    for (let i = 1; i < ordered.length; i++) {
      const gap = Math.floor(ordered[i] / NS) - Math.floor(ordered[i - 1] / NS);
      if (gap === 0) {
        cost += W.sameDay;
        if (acc) acc.sameDay++;
      } else if (rules.spread === "EVEN" && gap < ideal) {
        cost += W.short * (ideal - gap) ** 2;
        if (acc) acc.shortGaps += ideal - gap;
      }
    }
    for (const b of placed) {
      const d = Math.floor(b.slot / NS);
      if (b.rest && d > 0 && secDay[sec * ND + d - 1]) {
        cost += W.restDay;
        if (acc) acc.noRestDay++;
      }
      cost += W.session * (b.slot % NS);
      if (rules.spread === "COMPACT") cost += W.compact * d;
    }
    return cost;
  };
  const costOf = secs => secs.reduce((sum, sec) => sum + sectionCost(sec), 0);
  const totalCost = acc => {
    let cost = 0;
    for (let sec = 0; sec < nSec; sec++) cost += sectionCost(sec, acc);
    return cost;
  };

  /* tight: the earliest sitting that fits (packs a short window; annealing spreads it after) */
  const bestSlot = (b, tight = false) => {
    let best = -1;
    let bestCost = Infinity;
    for (let q = 0; q < Q; q++) {
      if (fits(b, q) !== R.OK) continue;
      if (tight) return q;
      const before = costOf(b.secs);
      assign(b, q);
      const cost = costOf(b.secs) - before + rand.next() * 0.5;
      assign(b, -1);
      if (cost < bestCost) {
        bestCost = cost;
        best = q;
      }
    }
    return best;
  };

  /* A block with no free sitting moves one other block out of its way */
  const ejectAndPlace = b => {
    for (const q of rand.shuffle([...Array(Q).keys()])) {
      const blockers = new Set();
      for (const sec of b.secs) if (secSlot[sec * Q + q] >= 0) blockers.add(secSlot[sec * Q + q]);
      if (blockers.size !== 1) continue;
      const other = blocks[[...blockers][0]];
      const home = other.slot;
      assign(other, -1);
      if (fits(b, q) === R.OK) {
        assign(b, q);
        const next = bestSlot(other);
        if (next >= 0) {
          assign(other, next);
          return true;
        }
        assign(b, -1);
      }
      assign(other, home);
    }
    return false;
  };

  const options = blocks.map(b => {
    reset();
    let n = 0;
    for (let q = 0; q < Q; q++) if (fits(b, q) === R.OK) n++;
    return n;
  });

  const construct = tight => {
    reset();
    const order = rand.shuffle(blocks).sort((a, b) => b.secs.length - a.secs.length || options[a.idx] - options[b.idx]);
    for (const b of order) {
      const q = bestSlot(b, tight);
      if (q >= 0) assign(b, q);
      else ejectAndPlace(b);
    }
  };

  const missing = () => blocks.reduce((n, b) => n + (b.slot < 0 ? b.papers.length : 0), 0);
  const snapshot = () => Int32Array.from(blocks, b => b.slot);
  const load = slots => {
    reset();
    for (const b of blocks) if (slots[b.idx] >= 0) assign(b, slots[b.idx]);
  };

  /* ---------- search ---------- */
  let best = null;
  const attempts = Math.max(1, input.attempts ?? 12);
  /* spread-minded constructions first; if any paper is left over, tightly packed ones */
  for (let a = 0; a < 2 * attempts; a++) {
    if (a >= attempts && best.missing === 0) break;
    construct(a >= attempts);
    const m = missing();
    const cost = totalCost();
    if (!best || m < best.missing || (m === best.missing && cost < best.cost))
      best = { missing: m, cost, slots: snapshot() };
  }

  load(best.slots);
  const iterations = input.improveIterations ?? Math.min(100_000, 200 * blocks.length + 1_000);
  let current = best.cost;
  let it = 0;
  for (; it < iterations && blocks.length && Q > 1; it++) {
    const temperature = 4 * (0.02 / 4) ** (it / iterations);
    const b = blocks[rand.below(blocks.length)];
    if (b.slot < 0) continue;
    const from = b.slot;
    const to = rand.below(Q);
    if (to === from) continue;
    /* move b, or swap it with the block one of its sections sits at `to` */
    const occupant = b.secs.map(sec => secSlot[sec * Q + to]).find(x => x >= 0);
    const other = occupant !== undefined ? blocks[occupant] : null;
    const secs = other ? [...new Set([...b.secs, ...other.secs])] : b.secs;
    const before = costOf(secs);
    assign(b, -1);
    if (other) assign(other, -1);
    let ok = fits(b, to) === R.OK;
    if (ok) assign(b, to);
    if (ok && other) {
      ok = fits(other, from) === R.OK;
      if (ok) assign(other, from);
    }
    if (!ok) {
      assign(b, -1);
      assign(b, from);
      if (other) assign(other, to);
      continue;
    }
    const delta = costOf(secs) - before;
    if (delta <= 0 || rand.next() < Math.exp(-delta / temperature)) {
      current += delta;
      if (current < best.cost - 1e-9) best = { missing: best.missing, cost: current, slots: snapshot() };
    } else {
      assign(b, -1);
      if (other) assign(other, -1);
      assign(b, from);
      if (other) assign(other, to);
    }
  }
  load(best.slots);

  /* ---------- result ---------- */
  const breakdown = { sameDay: 0, shortGaps: 0, noRestDay: 0 };
  const cost = totalCost(breakdown);
  breakdown.shortGaps = Math.round(breakdown.shortGaps * 100) / 100;

  const rows = [];
  const unplaced = [];
  for (const b of blocks) {
    if (b.slot < 0) {
      const reasons = {};
      for (let q = 0; q < Q; q++) {
        const code = EXAM_REASONS[fits(b, q)];
        if (code !== "OK") reasons[code] = (reasons[code] ?? 0) + 1;
      }
      unplaced.push({
        paperIds: b.papers.map(p => p.id),
        subjectId: b.papers[0].subjectId,
        component: b.papers[0].component ?? null,
        sectionIds: b.papers.map(p => p.sectionId),
        reasons
      });
      continue;
    }
    const di = Math.floor(b.slot / NS);
    const si = b.slot % NS;
    for (const paper of b.papers) {
      const start = sessionStart[si];
      const end = lengthOf(paper) !== null ? start + lengthOf(paper) : sessionEnd[si];
      rows.push({
        paperId: paper.id,
        examDate: dates[di],
        startTime: clock(start),
        endTime: clock(end),
        session: sessions[si].name
      });
    }
  }
  rows.sort((a, b) => a.examDate.localeCompare(b.examDate) || a.startTime.localeCompare(b.startTime));

  return {
    rows,
    unplaced,
    issues,
    score: {
      cost: Math.round(cost * 100) / 100,
      breakdown,
      requiredPapers: papers.length,
      placedPapers: papers.length - best.missing,
      complete: best.missing === 0,
      firstDate: rows[0]?.examDate ?? null,
      lastDate: rows.at(-1)?.examDate ?? null
    },
    stats: {
      seed,
      attempts,
      improveIterations: it,
      elapsedMs: Date.now() - startedAt,
      grid: { dates: ND, sessions: NS, blocks: blocks.length, sections: nSec }
    }
  };
};
